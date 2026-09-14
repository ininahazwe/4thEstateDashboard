import { RowDataPacket } from 'mysql2';
import { pool } from '../../config/db';
import { CaseRole } from '../../middleware/auth';

interface AuditRow extends RowDataPacket {
  id: number;
  actor_id: number | null;
  actor_name: string | null;
  action: string;
  resource_type: string;
  resource_id: number;
  changes_before: unknown;
  changes_after: unknown;
  created_at: string;
}

function mapEntry(row: AuditRow) {
  return {
    id: row.id,
    actorId: row.actor_id,
    actorName: row.actor_name,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    before: row.changes_before,
    after: row.changes_after,
    createdAt: row.created_at,
  };
}

// Visibility rules per brief §1.1 / §1.4 — deliberately conservative where
// the brief is ambiguous:
// - lead: sees every entry for the case, including plain "read" (consultation)
// - collaborator: sees everything except "read" entries (those are for the
//   lead's eyes only, per §1.4 "Lead : voit tout, meme les consultations")
// - observer / read_only: only their own actions ("audit log masque sauf
//   ses propres actions", §1.1)
// - regardless of role, a "highly_sensitive" case's log is lead-only
//   (§1.4 "Sensibilite source protegee : audit log visible lead seul")
export async function listCaseAuditLog(caseId: number, viewerId: number, viewerRole: CaseRole) {
  const [caseRows] = await pool.query<RowDataPacket[]>('SELECT sensitivity FROM cases WHERE id = :caseId', {
    caseId,
  });
  const sensitivity = caseRows[0]?.sensitivity as string | undefined;

  if (sensitivity === 'highly_sensitive' && viewerRole !== 'lead') {
    return [];
  }

  let visibilityClause = '';
  const params: Record<string, string | number> = { caseId };

  if (viewerRole === 'collaborator') {
    visibilityClause = "AND a.action <> 'read'";
  } else if (viewerRole === 'observer' || viewerRole === 'read_only') {
    visibilityClause = 'AND a.actor_id = :viewerId';
    params.viewerId = viewerId;
  }
  // viewerRole === 'lead': no extra clause, sees everything.

  const [rows] = await pool.query<AuditRow[]>(
    `SELECT a.id, a.actor_id, u.full_name AS actor_name, a.action, a.resource_type,
            a.resource_id, a.changes_before, a.changes_after, a.created_at
     FROM audit_log a
     LEFT JOIN users u ON u.id = a.actor_id
     WHERE a.case_id = :caseId ${visibilityClause}
     ORDER BY a.created_at DESC
     LIMIT 200`,
    params
  );

  return rows.map(mapEntry);
}

// Same access rules as listCaseAuditLog (including the highly_sensitive/
// lead-only gate and the per-role visibility clause) but without the
// 200-row cap -- an export for compliance/retention purposes (brief §5)
// needs the full history, not just the most recent page of it.
async function queryCaseAuditLogForExport(caseId: number, viewerId: number, viewerRole: CaseRole) {
  const [caseRows] = await pool.query<RowDataPacket[]>('SELECT sensitivity FROM cases WHERE id = :caseId', {
    caseId,
  });
  const sensitivity = caseRows[0]?.sensitivity as string | undefined;

  if (sensitivity === 'highly_sensitive' && viewerRole !== 'lead') {
    return [];
  }

  let visibilityClause = '';
  const params: Record<string, string | number> = { caseId };

  if (viewerRole === 'collaborator') {
    visibilityClause = "AND a.action <> 'read'";
  } else if (viewerRole === 'observer' || viewerRole === 'read_only') {
    visibilityClause = 'AND a.actor_id = :viewerId';
    params.viewerId = viewerId;
  }

  const [rows] = await pool.query<AuditRow[]>(
    `SELECT a.id, a.actor_id, u.full_name AS actor_name, a.action, a.resource_type,
            a.resource_id, a.changes_before, a.changes_after, a.created_at
     FROM audit_log a
     LEFT JOIN users u ON u.id = a.actor_id
     WHERE a.case_id = :caseId ${visibilityClause}
     ORDER BY a.created_at DESC`,
    params
  );

  return rows.map(mapEntry);
}

// CSV export (brief §5, "export du journal d'audit") -- same escaping
// convention as search.service.ts's toCsv, kept local here since the
// columns are entirely different (actor, action, resource, before/after).
export async function exportCaseAuditLogCsv(
  caseId: number,
  viewerId: number,
  viewerRole: CaseRole
): Promise<string> {
  const entries = await queryCaseAuditLogForExport(caseId, viewerId, viewerRole);
  const header = ['date', 'actor', 'action', 'resourceType', 'resourceId', 'before', 'after'];
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const lines = entries.map((e) =>
    [
      e.createdAt,
      e.actorName ?? '',
      e.action,
      e.resourceType,
      String(e.resourceId),
      e.before != null ? JSON.stringify(e.before) : '',
      e.after != null ? JSON.stringify(e.after) : '',
    ]
      .map((v) => escape(String(v)))
      .join(',')
  );
  return [header.map(escape).join(','), ...lines].join('\r\n');
}
