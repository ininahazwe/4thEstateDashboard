import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../../config/db';
import { AppError } from '../../utils/AppError';
import { recordAudit } from '../../middleware/auditLog';
import { LinkedCase } from './editorialProjects.types';

interface LinkedCaseRow extends RowDataPacket {
  id: number;
  title: string;
  status: string;
  sensitivity: string;
  linked_at: string;
}

// Only cases the *viewer* also has access to (via case_contributors) are
// ever returned — a project contributor who isn't also a case contributor
// must not learn a linked case's title/sensitivity this way. An
// inaccessible linked case is silently omitted, same convention as the
// rest of the app (never a 403 on a cross-resource listing).
export async function listLinkedCases(projectId: number, viewerId: number): Promise<LinkedCase[]> {
  const [rows] = await pool.query<LinkedCaseRow[]>(
    `SELECT c.id, c.title, c.status, c.sensitivity, pc.linked_at
     FROM project_cases pc
     JOIN cases c ON c.id = pc.case_id AND c.deleted_at IS NULL
     JOIN case_contributors cc ON cc.case_id = c.id AND cc.user_id = :viewerId
     WHERE pc.project_id = :projectId
     ORDER BY pc.linked_at ASC`,
    { projectId, viewerId }
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    sensitivity: row.sensitivity,
    linkedAt: row.linked_at,
  }));
}

// Linking is deliberately restricted to a case the actor themselves can
// access — otherwise anyone on the editorial project could attach a case
// they have no visibility into at all, purely by knowing its id.
export async function linkCaseToProject(projectId: number, caseId: number, actorId: number) {
  const [caseRows] = await pool.query<RowDataPacket[]>(
    `SELECT c.id FROM cases c
     JOIN case_contributors cc ON cc.case_id = c.id AND cc.user_id = :actorId
     WHERE c.id = :caseId AND c.deleted_at IS NULL`,
    { caseId, actorId }
  );
  if (!caseRows[0]) {
    throw new AppError(404, 'Case not found, or you do not have access to it.');
  }

  await pool.query(
    `INSERT INTO project_cases (project_id, case_id) VALUES (:projectId, :caseId)
     ON DUPLICATE KEY UPDATE linked_at = linked_at`,
    { projectId, caseId }
  );

  await recordAudit({
    actorId,
    caseId,
    action: 'update',
    resourceType: 'project_case_link',
    resourceId: projectId,
    after: { projectId, caseId },
  });

  return listLinkedCases(projectId, actorId);
}

export async function unlinkCaseFromProject(projectId: number, caseId: number, actorId: number) {
  const [result] = await pool.query<ResultSetHeader>(
    'DELETE FROM project_cases WHERE project_id = :projectId AND case_id = :caseId',
    { projectId, caseId }
  );
  if (result.affectedRows === 0) {
    throw new AppError(404, 'This case is not linked to this editorial project.');
  }

  await recordAudit({
    actorId,
    caseId,
    action: 'delete',
    resourceType: 'project_case_link',
    resourceId: projectId,
    before: { projectId, caseId },
  });
}
