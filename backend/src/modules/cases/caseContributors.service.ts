import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { pool } from '../../config/db';
import { AppError } from '../../utils/AppError';
import { recordAudit } from '../../middleware/auditLog';
import { CaseRole } from '../../middleware/auth';
import { notifyUsers, getUserFullName } from '../notifications/notifications.service';

interface ContributorRow extends RowDataPacket {
  user_id: number;
  full_name: string;
  email: string;
  avatar_url: string | null;
  role: CaseRole;
  added_at: string;
}

function mapContributor(row: ContributorRow) {
  return {
    userId: row.user_id,
    fullName: row.full_name,
    email: row.email,
    avatarUrl: row.avatar_url,
    role: row.role,
    addedAt: row.added_at,
  };
}

// Bare list of user ids on a case, with no role/name detail — used to fan
// out notifications (new comment, sensitivity escalated) to everyone with
// access, without pulling in the full contributor rows for that.
export async function listCaseContributorIds(caseId: number): Promise<number[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT user_id FROM case_contributors WHERE case_id = :caseId',
    { caseId }
  );
  return rows.map((row) => row.user_id as number);
}

// Lists who has access to a case and at what role (brief §1.1). Any
// contributor — even read_only — can see this list; only leads can change it.
export async function listCaseContributors(caseId: number) {
  const [rows] = await pool.query<ContributorRow[]>(
    `SELECT cc.user_id, u.full_name, u.email, u.avatar_url, cc.role, cc.added_at
     FROM case_contributors cc
     JOIN users u ON u.id = cc.user_id
     WHERE cc.case_id = :caseId
     ORDER BY FIELD(cc.role, 'lead', 'collaborator', 'observer', 'read_only'), u.full_name ASC`,
    { caseId }
  );

  return rows.map(mapContributor);
}

async function countLeads(caseId: number, excludingUserId?: number): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS n FROM case_contributors
     WHERE case_id = :caseId AND role = 'lead' AND user_id <> :excludingUserId`,
    { caseId, excludingUserId: excludingUserId ?? 0 }
  );
  return Number(rows[0]?.n ?? 0);
}

// Adds a platform user (identified by email — they must already have signed
// in with Google at least once, since accounts are only auto-provisioned at
// login) to a case, or updates their role if they're already on it.
export async function addContributorByEmail(
  caseId: number,
  email: string,
  role: CaseRole,
  actorId: number
) {
  const [userRows] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM users WHERE email = :email AND is_active = 1',
    { email }
  );
  const targetUserId = userRows[0]?.id as number | undefined;
  if (!targetUserId) {
    throw new AppError(
      404,
      'No active user found with this email. They need to sign in with Google at least once first.'
    );
  }

  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO case_contributors (case_id, user_id, role, added_by)
     VALUES (:caseId, :userId, :role, :addedBy)
     ON DUPLICATE KEY UPDATE role = VALUES(role)`,
    { caseId, userId: targetUserId, role, addedBy: actorId }
  );

  await recordAudit({
    actorId,
    caseId,
    action: 'update',
    resourceType: 'case_contributor',
    resourceId: targetUserId,
    after: { email, role },
  });

  // affectedRows tells brand-new access (1 row) apart from an existing
  // contributor whose role actually changed (2 rows, MySQL's convention for
  // an INSERT ... ON DUPLICATE KEY UPDATE that updates a row) from a no-op
  // re-add with the same role (0 rows, nothing to notify about). The
  // notifications table's `type` enum has no separate "role changed" value,
  // so both cases use 'access_granted' — the payload's `event` field tells
  // them apart for display.
  if (result.affectedRows === 1 || result.affectedRows === 2) {
    const [caseRows] = await pool.query<RowDataPacket[]>('SELECT title FROM cases WHERE id = :caseId', {
      caseId,
    });
    const actorName = await getUserFullName(actorId);
    await notifyUsers([targetUserId], 'access_granted', {
      actorId,
      payload: {
        caseId,
        caseTitle: caseRows[0]?.title ?? null,
        role,
        actorName,
        event: result.affectedRows === 1 ? 'added' : 'role_changed',
      },
    });
  }

  return listCaseContributors(caseId);
}

// Changes an existing contributor's role. Refuses to demote the case's last
// remaining lead — otherwise a case could end up with nobody able to manage
// access to it.
export async function updateContributorRole(
  caseId: number,
  userId: number,
  role: CaseRole,
  actorId: number
) {
  if (role !== 'lead' && (await countLeads(caseId, userId)) === 0) {
    throw new AppError(400, 'A case must always have at least one lead.');
  }

  const [result] = await pool.query<ResultSetHeader>(
    'UPDATE case_contributors SET role = :role WHERE case_id = :caseId AND user_id = :userId',
    { role, caseId, userId }
  );

  if (result.affectedRows === 0) {
    throw new AppError(404, 'This user is not a contributor on this case.');
  }

  await recordAudit({
    actorId,
    caseId,
    action: 'update',
    resourceType: 'case_contributor',
    resourceId: userId,
    after: { role },
  });

  const [caseRows] = await pool.query<RowDataPacket[]>('SELECT title FROM cases WHERE id = :caseId', {
    caseId,
  });
  const actorName = await getUserFullName(actorId);
  await notifyUsers([userId], 'access_granted', {
    actorId,
    payload: {
      caseId,
      caseTitle: caseRows[0]?.title ?? null,
      role,
      actorName,
      event: 'role_changed',
    },
  });

  return listCaseContributors(caseId);
}

// Removes a contributor from a case. Same last-lead safeguard as above.
export async function removeContributor(caseId: number, userId: number, actorId: number) {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT role FROM case_contributors WHERE case_id = :caseId AND user_id = :userId',
    { caseId, userId }
  );
  const currentRole = rows[0]?.role as CaseRole | undefined;
  if (!currentRole) {
    throw new AppError(404, 'This user is not a contributor on this case.');
  }
  if (currentRole === 'lead' && (await countLeads(caseId, userId)) === 0) {
    throw new AppError(400, 'A case must always have at least one lead.');
  }

  await pool.query('DELETE FROM case_contributors WHERE case_id = :caseId AND user_id = :userId', {
    caseId,
    userId,
  });

  await recordAudit({
    actorId,
    caseId,
    action: 'delete',
    resourceType: 'case_contributor',
    resourceId: userId,
  });
}
