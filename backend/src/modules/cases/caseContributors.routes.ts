import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { parseId } from '../../utils/parseId';
import { requireAuth, requireCaseRole } from '../../middleware/auth';
import {
  addContributorByEmail,
  listCaseContributors,
  removeContributor,
  updateContributorRole,
} from './caseContributors.service';

const roleEnum = z.enum(['lead', 'collaborator', 'observer', 'read_only']);
const addSchema = z.object({ email: z.string().email(), role: roleEnum });
const updateRoleSchema = z.object({ role: roleEnum });

// Mounted at /api/cases/:caseId/contributors in app.ts. Manages who has
// access to a case and at what role (brief §1.1) — separate from
// caseContacts.routes.ts, which links external contacts, not platform users.
export const caseContributorsRouter = Router({ mergeParams: true });

caseContributorsRouter.use(requireAuth);

caseContributorsRouter.get(
  '/',
  requireCaseRole('read_only'),
  asyncHandler(async (req, res) => {
    const caseId = parseId(req.params.caseId, 'case id');
    res.json(await listCaseContributors(caseId));
  })
);

caseContributorsRouter.post(
  '/',
  requireCaseRole('lead'),
  asyncHandler(async (req, res) => {
    const caseId = parseId(req.params.caseId, 'case id');
    const { email, role } = addSchema.parse(req.body);
    res.status(201).json(await addContributorByEmail(caseId, email, role, req.user!.id));
  })
);

caseContributorsRouter.put(
  '/:userId',
  requireCaseRole('lead'),
  asyncHandler(async (req, res) => {
    const caseId = parseId(req.params.caseId, 'case id');
    const userId = parseId(req.params.userId, 'user id');
    const { role } = updateRoleSchema.parse(req.body);
    res.json(await updateContributorRole(caseId, userId, role, req.user!.id));
  })
);

caseContributorsRouter.delete(
  '/:userId',
  requireCaseRole('lead'),
  asyncHandler(async (req, res) => {
    const caseId = parseId(req.params.caseId, 'case id');
    const userId = parseId(req.params.userId, 'user id');
    await removeContributor(caseId, userId, req.user!.id);
    res.status(204).send();
  })
);
