import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../../config/db';
import { AppError } from '../../utils/AppError';
import { recordAudit } from '../../middleware/auditLog';
import { CaseStatus, Sensitivity } from './cases.types';
import { listCaseContributorIds } from './caseContributors.service';
import { notifyUsers, getUserFullName } from '../notifications/notifications.service';

// Ordering used to detect a sensitivity *increase* (brief §2.3 "Sensibilité
// augmentée : un cas passe de 'interne' à 'très sensible'") — a decrease
// isn't worth a notification.
const SENSITIVITY_RANK: Record<Sensitivity, number> = {
  public: 0,
  internal: 1,
  confidential: 2,
  highly_sensitive: 3,
};

interface CaseRow extends RowDataPacket {
  id: number;
  title: string;
  description: string | null;
  editorial_context: string | null;
  status: CaseStatus;
  sensitivity: Sensitivity;
  due_date: string | null;
  published_at: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
}

interface CaseTagRow extends RowDataPacket {
  case_id: number;
  id: number;
  name: string;
  type: 'theme' | 'tag';
}

function mapCase(row: CaseRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    editorialContext: row.editorial_context,
    status: row.status,
    sensitivity: row.sensitivity,
    dueDate: row.due_date,
    publishedAt: row.published_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateCaseInput {
  title: string;
  description?: string;
  editorialContext?: string;
  sensitivity?: Sensitivity;
  dueDate?: string;
}

export async function createCase(input: CreateCaseInput, actorId: number) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query<ResultSetHeader>(
      `INSERT INTO cases (title, description, editorial_context, sensitivity, due_date, created_by)
       VALUES (:title, :description, :editorialContext, :sensitivity, :dueDate, :createdBy)`,
      {
        title: input.title,
        description: input.description ?? null,
        editorialContext: input.editorialContext ?? null,
        sensitivity: input.sensitivity ?? 'internal',
        dueDate: input.dueDate ?? null,
        createdBy: actorId,
      }
    );

    const caseId = result.insertId;

    // The creator is automatically added as "lead" so they can manage
    // access on the case right away (brief section 1.1).
    await conn.query(
      `INSERT INTO case_contributors (case_id, user_id, role, added_by)
       VALUES (:caseId, :userId, 'lead', :addedBy)`,
      { caseId, userId: actorId, addedBy: actorId }
    );

    await conn.commit();

    await recordAudit({
      actorId,
      caseId,
      action: 'create',
      resourceType: 'case',
      resourceId: caseId,
      after: input,
    });

    return getCaseById(caseId);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// Only cases the user actually contributes to are listed — access control
// happens at the query level, not just at the route level.
export async function listCasesForUser(userId: number) {
  const [rows] = await pool.query<CaseRow[]>(
    `SELECT c.* FROM cases c
     JOIN case_contributors cc ON cc.case_id = c.id
     WHERE cc.user_id = :userId AND c.deleted_at IS NULL
     ORDER BY c.updated_at DESC`,
    { userId }
  );

  if (rows.length === 0) return [];

  // Tags weren't shown on the list view yet (only on the case detail page)
  // — fetched here in one batched query rather than per-card, so the list
  // page doesn't turn into an N+1.
  const caseIds = rows.map((r) => r.id);
  const [tagRows] = await pool.query<CaseTagRow[]>(
    `SELECT ct.case_id, t.id, t.name, t.type
     FROM case_tags ct
     JOIN tags t ON t.id = ct.tag_id
     WHERE ct.case_id IN (:caseIds)
     ORDER BY t.type ASC, t.name ASC`,
    { caseIds }
  );
  const tagsByCase = new Map<number, { id: number; name: string; type: 'theme' | 'tag' }[]>();
  for (const row of tagRows) {
    const list = tagsByCase.get(row.case_id) ?? [];
    list.push({ id: row.id, name: row.name, type: row.type });
    tagsByCase.set(row.case_id, list);
  }

  return rows.map((row) => ({ ...mapCase(row), tags: tagsByCase.get(row.id) ?? [] }));
}

export async function getCaseById(caseId: number, readerId?: number) {
  const [rows] = await pool.query<CaseRow[]>(
    'SELECT * FROM cases WHERE id = :caseId AND deleted_at IS NULL',
    { caseId }
  );

  const row = rows[0];
  if (!row) {
    throw new AppError(404, 'Case not found');
  }

  // Every consultation is logged too (brief section 1.4: "même une simple
  // consultation"), not just creates/updates/deletes. readerId is omitted
  // for the internal call from createCase() since that read isn't a
  // separate user action.
  if (readerId) {
    await recordAudit({ actorId: readerId, caseId, action: 'read', resourceType: 'case', resourceId: caseId });
  }

  return mapCase(row);
}

export interface UpdateCaseInput {
  title?: string;
  description?: string;
  editorialContext?: string;
  status?: CaseStatus;
  sensitivity?: Sensitivity;
  dueDate?: string;
  publishedAt?: string;
}

const UPDATABLE_FIELDS: { key: keyof UpdateCaseInput; column: string }[] = [
  { key: 'title', column: 'title' },
  { key: 'description', column: 'description' },
  { key: 'editorialContext', column: 'editorial_context' },
  { key: 'status', column: 'status' },
  { key: 'sensitivity', column: 'sensitivity' },
  { key: 'dueDate', column: 'due_date' },
  { key: 'publishedAt', column: 'published_at' },
];

export async function updateCase(caseId: number, input: UpdateCaseInput, actorId: number) {
  const before = await getCaseById(caseId);

  const setClauses: string[] = [];
  const params: Record<string, string | number | boolean | null> = { caseId };

  for (const { key, column } of UPDATABLE_FIELDS) {
    if (input[key] !== undefined) {
      setClauses.push(`${column} = :${key}`);
      params[key] = input[key];
    }
  }

  if (setClauses.length === 0) {
    return before;
  }

  await pool.query(`UPDATE cases SET ${setClauses.join(', ')} WHERE id = :caseId`, params);

  const after = await getCaseById(caseId);

  await recordAudit({
    actorId,
    caseId,
    action: 'update',
    resourceType: 'case',
    resourceId: caseId,
    before,
    after,
  });

  if (SENSITIVITY_RANK[after.sensitivity] > SENSITIVITY_RANK[before.sensitivity]) {
    const contributorIds = await listCaseContributorIds(caseId);
    const actorName = await getUserFullName(actorId);
    await notifyUsers(contributorIds, 'sensitivity_increased', {
      actorId,
      payload: {
        caseId,
        caseTitle: after.title,
        from: before.sensitivity,
        to: after.sensitivity,
        actorName,
      },
    });
  }

  return after;
}

// Soft delete only — the row (and everything that references it) stays in
// place for audit/retention purposes (brief section 5.3); it's just hidden
// from normal reads via the `deleted_at IS NULL` filter above.
export async function deleteCase(caseId: number, actorId: number) {
  const before = await getCaseById(caseId);

  await pool.query('UPDATE cases SET deleted_at = NOW() WHERE id = :caseId', { caseId });

  await recordAudit({
    actorId,
    caseId,
    action: 'delete',
    resourceType: 'case',
    resourceId: caseId,
    before,
  });
}
