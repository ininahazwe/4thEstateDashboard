import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../../config/db';
import { AppError } from '../../utils/AppError';
import { recordAudit } from '../../middleware/auditLog';
import { ProjectRole } from '../../middleware/auth';
import { ProjectContributor } from './editorialProjects.types';

interface ContributorRow extends RowDataPacket {
  user_id: number;
  full_name: string;
  email: string;
  avatar_url: string | null;
  role: ProjectRole;
  added_at: string;
}

function mapContributor(row: ContributorRow): ProjectContributor {
  return {
    userId: row.user_id,
    fullName: row.full_name,
    email: row.email,
    avatarUrl: row.avatar_url,
    role: row.role,
    addedAt: row.added_at,
  };
}

export async function listProjectContributors(projectId: number) {
  const [rows] = await pool.query<ContributorRow[]>(
    `SELECT epc.user_id, u.full_name, u.email, u.avatar_url, epc.role, epc.added_at
     FROM editorial_project_contributors epc
     JOIN users u ON u.id = epc.user_id
     WHERE epc.project_id = :projectId
     ORDER BY FIELD(epc.role, 'lead_journalist', 'editor', 'researcher', 'photographer'), u.full_name ASC`,
    { projectId }
  );
  return rows.map(mapContributor);
}

async function countLeadJournalists(projectId: number, excludingUserId?: number): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS n FROM editorial_project_contributors
     WHERE project_id = :projectId AND role = 'lead_journalist' AND user_id <> :excludingUserId`,
    { projectId, excludingUserId: excludingUserId ?? 0 }
  );
  return Number(rows[0]?.n ?? 0);
}

// Adds a platform user (by email — same convention as case contributors:
// they must have signed in with Google at least once) to an editorial
// project, or updates their role if already on it.
export async function addProjectContributorByEmail(
  projectId: number,
  email: string,
  role: ProjectRole,
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

  await pool.query<ResultSetHeader>(
    `INSERT INTO editorial_project_contributors (project_id, user_id, role)
     VALUES (:projectId, :userId, :role)
     ON DUPLICATE KEY UPDATE role = VALUES(role)`,
    { projectId, userId: targetUserId, role }
  );

  await recordAudit({
    actorId,
    caseId: null,
    action: 'update',
    resourceType: 'editorial_project_contributor',
    resourceId: targetUserId,
    after: { projectId, email, role },
  });

  return listProjectContributors(projectId);
}

// Same last-lead safeguard as cases: refuses to demote a project's last
// remaining lead_journalist, since only they can manage membership.
export async function updateProjectContributorRole(
  projectId: number,
  userId: number,
  role: ProjectRole,
  actorId: number
) {
  if (role !== 'lead_journalist' && (await countLeadJournalists(projectId, userId)) === 0) {
    throw new AppError(400, 'An editorial project must always have at least one lead journalist.');
  }

  const [result] = await pool.query<ResultSetHeader>(
    'UPDATE editorial_project_contributors SET role = :role WHERE project_id = :projectId AND user_id = :userId',
    { role, projectId, userId }
  );
  if (result.affectedRows === 0) {
    throw new AppError(404, 'This user is not a contributor on this editorial project.');
  }

  await recordAudit({
    actorId,
    caseId: null,
    action: 'update',
    resourceType: 'editorial_project_contributor',
    resourceId: userId,
    after: { projectId, role },
  });

  return listProjectContributors(projectId);
}

export async function removeProjectContributor(projectId: number, userId: number, actorId: number) {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT role FROM editorial_project_contributors WHERE project_id = :projectId AND user_id = :userId',
    { projectId, userId }
  );
  const currentRole = rows[0]?.role as ProjectRole | undefined;
  if (!currentRole) {
    throw new AppError(404, 'This user is not a contributor on this editorial project.');
  }
  if (currentRole === 'lead_journalist' && (await countLeadJournalists(projectId, userId)) === 0) {
    throw new AppError(400, 'An editorial project must always have at least one lead journalist.');
  }

  await pool.query(
    'DELETE FROM editorial_project_contributors WHERE project_id = :projectId AND user_id = :userId',
    { projectId, userId }
  );

  await recordAudit({
    actorId,
    caseId: null,
    action: 'delete',
    resourceType: 'editorial_project_contributor',
    resourceId: userId,
    before: { projectId },
  });
}
