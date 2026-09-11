import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import {
  createContactHandler,
  deleteContactHandler,
  getContactHandler,
  listContactsHandler,
  updateContactHandler,
} from './contacts.controller';

// Mounted at /api/contacts. This is the shared, platform-wide directory
// (brief §3.3) — any authenticated user can manage it, unlike cases/events
// which are gated per-case. Add case-level restrictions here later if the
// team decides some contacts should be case-private.
export const contactsRouter = Router();

contactsRouter.use(requireAuth);

contactsRouter.get('/', asyncHandler(listContactsHandler));
contactsRouter.post('/', asyncHandler(createContactHandler));
contactsRouter.get('/:id', asyncHandler(getContactHandler));
contactsRouter.put('/:id', asyncHandler(updateContactHandler));
contactsRouter.delete('/:id', asyncHandler(deleteContactHandler));
