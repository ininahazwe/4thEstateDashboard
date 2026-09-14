import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { parseId } from '../../utils/parseId';
import { requireAuth, requireCaseRole } from '../../middleware/auth';
import { exportCaseAuditLogCsv, listCaseAuditLog } from './caseAuditLog.service';

// Mounted at /api/cases/:caseId/audit-log in app.ts. Every case member (down
// to read_only) can call this — listCaseAuditLog itself narrows what comes
// back based on req.caseRole (see the visibility rules documented there).
export const caseAuditLogRouter = Router({ mergeParams: true });

caseAuditLogRouter.use(requireAuth);

caseAuditLogRouter.get(
  '/',
  requireCaseRole('read_only'),
  asyncHandler(async (req, res) => {
    const caseId = parseId(req.params.caseId, 'case id');
    const entries = await listCaseAuditLog(caseId, req.user!.id, req.caseRole!);
    res.json(entries);
  })
);

caseAuditLogRouter.get(
  '/export',
  requireCaseRole('read_only'),
  asyncHandler(async (req, res) => {
    const caseId = parseId(req.params.caseId, 'case id');
    const csv = await exportCaseAuditLogCsv(caseId, req.user!.id, req.caseRole!);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="case-${caseId}-audit-log.csv"`);
    res.send(csv);
  })
);
