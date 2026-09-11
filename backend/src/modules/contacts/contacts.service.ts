import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../../config/db';
import { AppError } from '../../utils/AppError';
import { recordAudit } from '../../middleware/auditLog';
import { ContactSensitivity } from './contacts.types';

interface ContactRow extends RowDataPacket {
  id: number;
  full_name: string;
  email: string | null;
  phone: string | null;
  organization: string | null;
  role_or_title: string | null;
  notes: string | null;
  sensitivity: ContactSensitivity;
  reliability: number | null;
  private_notes: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
}

function mapContact(row: ContactRow) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    organization: row.organization,
    roleOrTitle: row.role_or_title,
    notes: row.notes,
    sensitivity: row.sensitivity,
    reliability: row.reliability,
    privateNotes: row.private_notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface ContactInput {
  fullName: string;
  email?: string;
  phone?: string;
  organization?: string;
  roleOrTitle?: string;
  notes?: string;
  sensitivity?: ContactSensitivity;
  reliability?: number;
  privateNotes?: string;
}

export async function createContact(input: ContactInput, actorId: number) {
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO contacts
      (full_name, email, phone, organization, role_or_title, notes, sensitivity, reliability, private_notes, created_by)
     VALUES
      (:fullName, :email, :phone, :organization, :roleOrTitle, :notes, :sensitivity, :reliability, :privateNotes, :createdBy)`,
    {
      fullName: input.fullName,
      email: input.email ?? null,
      phone: input.phone ?? null,
      organization: input.organization ?? null,
      roleOrTitle: input.roleOrTitle ?? null,
      notes: input.notes ?? null,
      sensitivity: input.sensitivity ?? 'none',
      reliability: input.reliability ?? null,
      privateNotes: input.privateNotes ?? null,
      createdBy: actorId,
    }
  );

  const contactId = result.insertId;

  await recordAudit({
    actorId,
    action: 'create',
    resourceType: 'contact',
    resourceId: contactId,
    after: input,
  });

  return getContactById(contactId);
}

// This is the shared, platform-wide directory (brief §3.3) — not scoped to
// a single case. `search` does a simple substring match on name/org/email,
// good enough until full-text/cross-case search (roadmap Phase 3) lands.
export async function listContacts(search?: string) {
  const [rows] = await pool.query<ContactRow[]>(
    `SELECT * FROM contacts
     WHERE deleted_at IS NULL
       AND (:search IS NULL OR full_name LIKE :searchLike OR organization LIKE :searchLike OR email LIKE :searchLike)
     ORDER BY full_name ASC`,
    { search: search ?? null, searchLike: search ? `%${search}%` : null }
  );

  return rows.map(mapContact);
}

export async function getContactById(contactId: number, readerId?: number) {
  const [rows] = await pool.query<ContactRow[]>(
    'SELECT * FROM contacts WHERE id = :contactId AND deleted_at IS NULL',
    { contactId }
  );

  const row = rows[0];
  if (!row) {
    throw new AppError(404, 'Contact not found');
  }

  if (readerId) {
    await recordAudit({ actorId: readerId, action: 'read', resourceType: 'contact', resourceId: contactId });
  }

  return mapContact(row);
}

const UPDATABLE_FIELDS: { key: keyof ContactInput; column: string }[] = [
  { key: 'fullName', column: 'full_name' },
  { key: 'email', column: 'email' },
  { key: 'phone', column: 'phone' },
  { key: 'organization', column: 'organization' },
  { key: 'roleOrTitle', column: 'role_or_title' },
  { key: 'notes', column: 'notes' },
  { key: 'sensitivity', column: 'sensitivity' },
  { key: 'reliability', column: 'reliability' },
  { key: 'privateNotes', column: 'private_notes' },
];

export async function updateContact(contactId: number, input: Partial<ContactInput>, actorId: number) {
  const before = await getContactById(contactId);

  const setClauses: string[] = [];
  const params: Record<string, string | number | boolean | null> = { contactId };

  for (const { key, column } of UPDATABLE_FIELDS) {
    if (input[key] !== undefined) {
      setClauses.push(`${column} = :${key}`);
      params[key] = input[key];
    }
  }

  if (setClauses.length === 0) {
    return before;
  }

  await pool.query(`UPDATE contacts SET ${setClauses.join(', ')} WHERE id = :contactId`, params);

  const after = await getContactById(contactId);

  await recordAudit({
    actorId,
    action: 'update',
    resourceType: 'contact',
    resourceId: contactId,
    before,
    after,
  });

  return after;
}

export async function deleteContact(contactId: number, actorId: number) {
  const before = await getContactById(contactId);

  await pool.query('UPDATE contacts SET deleted_at = NOW() WHERE id = :contactId', { contactId });

  await recordAudit({
    actorId,
    action: 'delete',
    resourceType: 'contact',
    resourceId: contactId,
    before,
  });
}
