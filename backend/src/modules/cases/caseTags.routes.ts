import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { parseId } from '../../utils/parseId';
import { requireAuth, requireCaseRole } from '../../middleware/auth';
import { linkTagToCase, listCaseTags, unlinkTagFromCase } from './caseTags.service';

const linkSchema = z.object({ tagId: z.number().int().positive() });

// Mounted at /api/cases/:caseId/tags in app.ts.
export const caseTagsRouter = Router({ mergeParams: true });

caseTagsRouter.use(requireAuth);

caseTagsRouter.get(
  '/',
  requireCaseRole('read_only'),
  asyncHandler(async (req, res) => {
    const caseId = parseId(req.params.caseId, 'case id');
    res.json(await listCaseTags(caseId));
  })
);

caseTagsRouter.post(
  '/',
  requireCaseRole('collaborator'),
  asyncHandler(async (req, res) => {
    const caseId = parseId(req.params.caseId, 'case id');
    const { tagId } = linkSchema.parse(req.body);
    res.status(201).json(await linkTagToCase(caseId, tagId, req.user!.id));
  })
);

caseTagsRouter.delete(
  '/:tagId',
  requireCaseRole('collaborator'),
  asyncHandler(async (req, res) => {
    const caseId = parseId(req.params.caseId, 'case id');
    const tagId = parseId(req.params.tagId, 'tag id');
    await unlinkTagFromCase(caseId, tagId, req.user!.id);
    res.status(204).send();
  })
);
