import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { parseId } from '../../utils/parseId';
import { requireAuth, requireCaseRole } from '../../middleware/auth';
import { linkContactToCase, listCaseContacts, unlinkContactFromCase } from './caseContacts.service';

const linkSchema = z.object({ contactId: z.number().int().positive() });

// Mounted at /api/cases/:caseId/contacts in app.ts.
export const caseContactsRouter = Router({ mergeParams: true });

caseContactsRouter.use(requireAuth);

caseContactsRouter.get(
  '/',
  requireCaseRole('read_only'),
  asyncHandler(async (req, res) => {
    const caseId = parseId(req.params.caseId, 'case id');
    res.json(await listCaseContacts(caseId));
  })
);

caseContactsRouter.post(
  '/',
  requireCaseRole('collaborator'),
  asyncHandler(async (req, res) => {
    const caseId = parseId(req.params.caseId, 'case id');
    const { contactId } = linkSchema.parse(req.body);
    res.status(201).json(await linkContactToCase(caseId, contactId, req.user!.id));
  })
);

caseContactsRouter.delete(
  '/:contactId',
  requireCaseRole('collaborator'),
  asyncHandler(async (req, res) => {
    const caseId = parseId(req.params.caseId, 'case id');
    const contactId = parseId(req.params.contactId, 'contact id');
    await unlinkContactFromCase(caseId, contactId, req.user!.id);
    res.status(204).send();
  })
);
