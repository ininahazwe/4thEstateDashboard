import { RowDataPacket } from 'mysql2';
import { pool } from '../../config/db';
import { AppError } from '../../utils/AppError';
import { recordAudit } from '../../middleware/auditLog';

interface CaseTagRow extends RowDataPacket {
  id: number;
  name: string;
  type: 'theme' | 'tag';
}

function mapCaseTag(row: CaseTagRow) {
  return { id: row.id, name: row.name, type: row.type };
}

async function assertTagExists(tagId: number) {
  const [rows] = await pool.query<RowDataPacket[]>('SELECT id FROM tags WHERE id = :tagId', { tagId });
  if (!rows[0]) {
    throw new AppError(404, 'Tag not found');
  }
}

export async function listCaseTags(caseId: number) {
  const [rows] = await pool.query<CaseTagRow[]>(
    `SELECT t.id, t.name, t.type
     FROM case_tags ct
     JOIN tags t ON t.id = ct.tag_id
     WHERE ct.case_id = :caseId
     ORDER BY t.type ASC, t.name ASC`,
    { caseId }
  );
  return rows.map(mapCaseTag);
}

export async function linkTagToCase(caseId: number, tagId: number, actorId: number) {
  await assertTagExists(tagId);

  await pool.query(
    `INSERT INTO case_tags (case_id, tag_id) VALUES (:caseId, :tagId)
     ON DUPLICATE KEY UPDATE tag_id = tag_id`, // idempotent: linking twice is a no-op
    { caseId, tagId }
  );

  await recordAudit({
    actorId,
    caseId,
    action: 'update',
    resourceType: 'case_tag_link',
    resourceId: tagId,
    after: { linked: true },
  });

  return listCaseTags(caseId);
}

export async function unlinkTagFromCase(caseId: number, tagId: number, actorId: number) {
  await pool.query('DELETE FROM case_tags WHERE case_id = :caseId AND tag_id = :tagId', { caseId, tagId });

  await recordAudit({
    actorId,
    caseId,
    action: 'update',
    resourceType: 'case_tag_link',
    resourceId: tagId,
    after: { linked: false },
  });
}
