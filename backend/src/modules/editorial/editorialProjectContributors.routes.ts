import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { parseId } from '../../utils/parseId';
import { requireAuth, requireProjectContributor, requireProjectLead } from '../../middleware/auth';
import {
  addProjectContributorByEmail,
  listProjectContributors,
  removeProjectContributor,
  updateProjectContributorRole,
} from './editorialProjectContributors.service';

const roleEnum = z.enum(['lead_journalist', 'editor', 'researcher', 'photographer']);
const addSchema = z.object({ email: z.string().email(), role: roleEnum });
const updateRoleSchema = z.object({ role: roleEnum });

// Mounted at /api/editorial-projects/:projectId/contributors in app.ts.
// Managing membership (add/change role/remove) is lead_journalist-only,
// same "only the lead manages access" idea as caseContributors.routes.ts.
export const editorialProjectContributorsRouter = Router({ mergeParams: true });

editorialProjectContributorsRouter.use(requireAuth);

editorialProjectContributorsRouter.get(
  '/',
  requireProjectContributor(),
  asyncHandler(async (req, res) => {
    const projectId = parseId(req.params.projectId, 'project id');
    res.json(await listProjectContributors(projectId));
  })
);

editorialProjectContributorsRouter.post(
  '/',
  requireProjectLead(),
  asyncHandler(async (req, res) => {
    const projectId = parseId(req.params.projectId, 'project id');
    const { email, role } = addSchema.parse(req.body);
    res.status(201).json(await addProjectContributorByEmail(projectId, email, role, req.user!.id));
  })
);

editorialProjectContributorsRouter.put(
  '/:userId',
  requireProjectLead(),
  asyncHandler(async (req, res) => {
    const projectId = parseId(req.params.projectId, 'project id');
    const userId = parseId(req.params.userId, 'user id');
    const { role } = updateRoleSchema.parse(req.body);
    res.json(await updateProjectContributorRole(projectId, userId, role, req.user!.id));
  })
);

editorialProjectContributorsRouter.delete(
  '/:userId',
  requireProjectLead(),
  asyncHandler(async (req, res) => {
    const projectId = parseId(req.params.projectId, 'project id');
    const userId = parseId(req.params.userId, 'user id');
    await removeProjectContributor(projectId, userId, req.user!.id);
    res.status(204).send();
  })
);
