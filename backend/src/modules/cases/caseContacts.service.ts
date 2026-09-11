import { RowDataPacket } from 'mysql2';
import { pool } from '../../config/db';
import { AppError } from '../../utils/AppError';
import { recordAudit } from '../../middleware/auditLog';

interface LinkedContactRow extends RowDataPacket {
  id: number;
  full_name: string;
  email: string | null;
  phone: string | null;
  organization: string | null;
  role_or_title: string | null;
  sensitivity: string;
  reliability: number | null;
  added_at: string;
}

function mapLinkedContact(row: LinkedContactRow) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    organization: row.organization,
    roleOrTitle: row.role_or_title,
    sensitivity: row.sensitivity,
    reliability: row.reliability,
    addedAt: row.added_at,
  };
}

async function assertContactExists(contactId: number) {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM contacts WHERE id = :contactId AND deleted_at IS NULL',
    { contactId }
  );
  if (!rows[0]) {
    throw new AppError(404, 'Contact not found');
  }
}

// Contacts linked to a case (brief §1.3 sidebar: "Contacts liés"). Private
// notes / reliability are intentionally omitted here even though they're
// visible via GET /api/contacts/:id today — tightening that per-role is a
// follow-up, not solved by this endpoint.
export async function listCaseContacts(caseId: number) {
  const [rows] = await pool.query<LinkedContactRow[]>(
    `SELECT c.id, c.full_name, c.email, c.phone, c.organization, c.role_or_title,
            c.sensitivity, c.reliability, cc.added_at
     FROM case_contacts cc
     JOIN contacts c ON c.id = cc.contact_id
     WHERE cc.case_id = :caseId AND c.deleted_at IS NULL
     ORDER BY c.full_name ASC`,
    { caseId }
  );

  return rows.map(mapLinkedContact);
}

export async function linkContactToCase(caseId: number, contactId: number, actorId: number) {
  await assertContactExists(contactId);

  await pool.query(
    `INSERT INTO case_contacts (case_id, contact_id, added_by)
     VALUES (:caseId, :contactId, :addedBy)
     ON DUPLICATE KEY UPDATE added_by = added_by`, // idempotent: linking twice is a no-op, not an error
    { caseId, contactId, addedBy: actorId }
  );

  await recordAudit({
    actorId,
    caseId,
    action: 'update',
    resourceType: 'case_contact_link',
    resourceId: contactId,
    after: { linked: true },
  });

  return listCaseContacts(caseId);
}

export async function unlinkContactFromCase(caseId: number, contactId: number, actorId: number) {
  await pool.query('DELETE FROM case_contacts WHERE case_id = :caseId AND contact_id = :contactId', {
    caseId,
    contactId,
  });

  await recordAudit({
    actorId,
    caseId,
    action: 'update',
    resourceType: 'case_contact_link',
    resourceId: contactId,
    after: { linked: false },
  });
}
