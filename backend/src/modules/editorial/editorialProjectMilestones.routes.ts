import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { parseId } from '../../utils/parseId';
import { requireAuth, requireProjectContributor } from '../../middleware/auth';
import {
  createMilestone,
  deleteMilestone,
  listMilestones,
  updateMilestone,
} from './editorialProjectMilestones.service';

const statusEnum = z.enum(['pending', 'in_progress', 'done', 'skipped']);
const createSchema = z.object({
  name: z.string().min(1).max(150),
  dueDate: z.string().optional(),
  status: statusEnum.optional(),
});
const updateSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  dueDate: z.string().optional(),
  status: statusEnum.optional(),
});

// Mounted at /api/editorial-projects/:projectId/milestones in app.ts. Open
// to any project contributor — per-step deadlines (brief §2.1) are a shared
// tracking tool, not membership.
export const editorialProjectMilestonesRouter = Router({ mergeParams: true });

editorialProjectMilestonesRouter.use(requireAuth);

editorialProjectMilestonesRouter.get(
  '/',
  requireProjectContributor(),
  asyncHandler(async (req, res) => {
    const projectId = parseId(req.params.projectId, 'project id');
    res.json(await listMilestones(projectId));
  })
);

editorialProjectMilestonesRouter.post(
  '/',
  requireProjectContributor(),
  asyncHandler(async (req, res) => {
    const projectId = parseId(req.params.projectId, 'project id');
    const input = createSchema.parse(req.body);
    res.status(201).json(await createMilestone(projectId, input, req.user!.id));
  })
);

editorialProjectMilestonesRouter.put(
  '/:milestoneId',
  requireProjectContributor(),
  asyncHandler(async (req, res) => {
    const projectId = parseId(req.params.projectId, 'project id');
    const milestoneId = parseId(req.params.milestoneId, 'milestone id');
    const input = updateSchema.parse(req.body);
    res.json(await updateMilestone(projectId, milestoneId, input, req.user!.id));
  })
);

editorialProjectMilestonesRouter.delete(
  '/:milestoneId',
  requireProjectContributor(),
  asyncHandler(async (req, res) => {
    const projectId = parseId(req.params.projectId, 'project id');
    const milestoneId = parseId(req.params.milestoneId, 'milestone id');
    await deleteMilestone(projectId, milestoneId, req.user!.id);
    res.status(204).send();
  })
);
