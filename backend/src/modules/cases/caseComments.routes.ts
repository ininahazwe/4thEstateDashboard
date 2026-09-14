import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { parseId } from '../../utils/parseId';
import { requireAuth, requireCaseRole } from '../../middleware/auth';
import { createComment, deleteComment, listComments, updateComment } from './caseComments.service';

const resourceTypeEnum = z.enum(['case', 'event', 'document']);
const visibilityEnum = z.enum(['private', 'shared']);

const mentionsSchema = z
  .object({
    contactIds: z.array(z.number().int().positive()).optional(),
    eventIds: z.array(z.number().int().positive()).optional(),
  })
  .optional();

const createCommentSchema = z.object({
  resourceType: resourceTypeEnum.optional().default('case'),
  resourceId: z.number().int().positive().optional(),
  body: z.string().min(1).max(5000),
  visibility: visibilityEnum.optional(),
  parentCommentId: z.number().int().positive().optional(),
  mentions: mentionsSchema,
});

const updateCommentSchema = z.object({ body: z.string().min(1).max(5000) });

// Mounted at /api/cases/:caseId/comments in app.ts. Comments default to the
// case itself (resourceType "case") when resourceType/resourceId aren't
// given, which is all the current UI uses — the resourceType/document
// options exist so a per-event or per-document thread can be added later
// without changing this API.
export const caseCommentsRouter = Router({ mergeParams: true });

caseCommentsRouter.use(requireAuth);

caseCommentsRouter.get(
  '/',
  requireCaseRole('read_only'),
  asyncHandler(async (req, res) => {
    const caseId = parseId(req.params.caseId, 'case id');
    const resourceType = resourceTypeEnum.catch('case').parse(req.query.resourceType);
    const resourceId = req.query.resourceId ? Number(req.query.resourceId) : caseId;
    res.json(await listComments(caseId, resourceType, resourceId, req.user!.id));
  })
);

caseCommentsRouter.post(
  '/',
  requireCaseRole('observer'),
  asyncHandler(async (req, res) => {
    const caseId = parseId(req.params.caseId, 'case id');
    const input = createCommentSchema.parse(req.body);
    const resourceId = input.resourceId ?? caseId;
    const created = await createComment(caseId, { ...input, resourceId }, req.user!.id);
    res.status(201).json(created);
  })
);

caseCommentsRouter.put(
  '/:commentId',
  requireCaseRole('read_only'),
  asyncHandler(async (req, res) => {
    const caseId = parseId(req.params.caseId, 'case id');
    const commentId = parseId(req.params.commentId, 'comment id');
    const { body } = updateCommentSchema.parse(req.body);
    res.json(await updateComment(caseId, commentId, body, req.user!.id));
  })
);

caseCommentsRouter.delete(
  '/:commentId',
  requireCaseRole('read_only'),
  asyncHandler(async (req, res) => {
    const caseId = parseId(req.params.caseId, 'case id');
    const commentId = parseId(req.params.commentId, 'comment id');
    await deleteComment(caseId, commentId, req.user!.id, req.caseRole!);
    res.status(204).send();
  })
);
