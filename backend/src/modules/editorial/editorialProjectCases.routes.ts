import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { parseId } from '../../utils/parseId';
import { requireAuth, requireProjectContributor } from '../../middleware/auth';
import { linkCaseToProject, listLinkedCases, unlinkCaseFromProject } from './editorialProjectCases.service';

const linkSchema = z.object({ caseId: z.number().int().positive() });

// Mounted at /api/editorial-projects/:projectId/cases in app.ts. Linking a
// case is open to any project contributor (not lead_journalist-only) — it's
// a collaborative "which cases feed this story" list, not membership.
export const editorialProjectCasesRouter = Router({ mergeParams: true });

editorialProjectCasesRouter.use(requireAuth);

editorialProjectCasesRouter.get(
  '/',
  requireProjectContributor(),
  asyncHandler(async (req, res) => {
    const projectId = parseId(req.params.projectId, 'project id');
    res.json(await listLinkedCases(projectId, req.user!.id));
  })
);

editorialProjectCasesRouter.post(
  '/',
  requireProjectContributor(),
  asyncHandler(async (req, res) => {
    const projectId = parseId(req.params.projectId, 'project id');
    const { caseId } = linkSchema.parse(req.body);
    res.status(201).json(await linkCaseToProject(projectId, caseId, req.user!.id));
  })
);

editorialProjectCasesRouter.delete(
  '/:caseId',
  requireProjectContributor(),
  asyncHandler(async (req, res) => {
    const projectId = parseId(req.params.projectId, 'project id');
    const caseId = parseId(req.params.caseId, 'case id');
    await unlinkCaseFromProject(projectId, caseId, req.user!.id);
    res.status(204).send();
  })
);
