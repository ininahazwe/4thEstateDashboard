import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../../config/db';
import { recordAudit } from '../../middleware/auditLog';

export type TagType = 'theme' | 'tag';

interface TagRow extends RowDataPacket {
  id: number;
  name: string;
  type: TagType;
  created_at: string;
}

function mapTag(row: TagRow) {
  return { id: row.id, name: row.name, type: row.type, createdAt: row.created_at };
}

// The shared, platform-wide vocabulary of tags/themes (brief §1.1 "domaines
// associes"): health, corruption, politics, environment, etc. Any
// authenticated user can browse and extend it — same openness as the
// contacts directory.
export async function listTags(type?: TagType) {
  const [rows] = await pool.query<TagRow[]>(
    type ? 'SELECT * FROM tags WHERE type = :type ORDER BY name ASC' : 'SELECT * FROM tags ORDER BY name ASC',
    { type }
  );
  return rows.map(mapTag);
}

// Find-or-create: tags are a shared vocabulary, so re-submitting an existing
// name/type pair should reuse it rather than erroring on the unique key.
export async function findOrCreateTag(name: string, type: TagType, actorId: number) {
  const [existing] = await pool.query<TagRow[]>('SELECT * FROM tags WHERE name = :name AND type = :type', {
    name,
    type,
  });
  if (existing[0]) {
    return mapTag(existing[0]);
  }

  const [result] = await pool.query<ResultSetHeader>('INSERT INTO tags (name, type) VALUES (:name, :type)', {
    name,
    type,
  });

  await recordAudit({ actorId, action: 'create', resourceType: 'tag', resourceId: result.insertId, after: { name, type } });

  const [rows] = await pool.query<TagRow[]>('SELECT * FROM tags WHERE id = :id', { id: result.insertId });
  return mapTag(rows[0]);
}
