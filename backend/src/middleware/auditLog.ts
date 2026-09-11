import { pool } from '../config/db';

type AuditAction = 'create' | 'update' | 'read' | 'delete' | 'download' | 'share';

interface AuditEntry {
  actorId?: number | null;
  caseId?: number | null;
  action: AuditAction;
  resourceType: string;
  resourceId: number;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  context?: string | null;
}

// Writes one row to `audit_log` (brief section 1.4). Called from the
// service layer right after the write it describes succeeds, so the log
// entry always matches what actually happened.
export async function recordAudit(entry: AuditEntry): Promise<void> {
  await pool.query(
    `INSERT INTO audit_log
      (actor_id, case_id, action, resource_type, resource_id, changes_before, changes_after, ip_address, context)
     VALUES
      (:actorId, :caseId, :action, :resourceType, :resourceId, :before, :after, :ip, :context)`,
    {
      actorId: entry.actorId ?? null,
      caseId: entry.caseId ?? null,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      before: entry.before ? JSON.stringify(entry.before) : null,
      after: entry.after ? JSON.stringify(entry.after) : null,
      ip: entry.ip ?? null,
      context: entry.context ?? null,
    }
  );
}
