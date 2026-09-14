import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { parseId } from '../../utils/parseId';
import { requireAuth, requireCaseRole } from '../../middleware/auth';
import { generateCaseReport } from './report.service';

// Mounted at /api/cases/:caseId/report in app.ts. Same minimum access as
// the rest of the case (read_only+) — generateCaseReport itself further
// restricts the full (non-redacted) report to the lead on a highly
// sensitive case, mirroring caseAuditLog's rule.
export const reportRouter = Router({ mergeParams: true });

reportRouter.use(requireAuth);

reportRouter.get(
  '/',
  requireCaseRole('read_only'),
  asyncHandler(async (req, res) => {
    const caseId = parseId(req.params.caseId, 'case id');
    const redacted = req.query.redacted === 'true' || req.query.redacted === '1';
    const markdown = await generateCaseReport(caseId, req.user!.id, req.caseRole!, { redacted });

    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="case-${caseId}-report${redacted ? '-redacted' : ''}.md"`
    );
    res.send(markdown);
  })
);
