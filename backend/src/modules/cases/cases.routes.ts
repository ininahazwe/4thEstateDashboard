import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireAuth, requireCaseRole } from '../../middleware/auth';
import {
  createCaseHandler,
  deleteCaseHandler,
  getCaseHandler,
  listCasesHandler,
  updateCaseHandler,
} from './cases.controller';

export const casesRouter = Router();

casesRouter.use(requireAuth);

// Listing/creating don't need requireCaseRole (there's no case yet, or the
// query already scopes results to the caller's own cases).
casesRouter.get('/', asyncHandler(listCasesHandler));
casesRouter.post('/', asyncHandler(createCaseHandler));

// Per brief section 1.1: read_only can view, collaborator can edit, only
// lead can delete (delete = archive; see cases.service.ts).
casesRouter.get('/:id', requireCaseRole('read_only'), asyncHandler(getCaseHandler));
casesRouter.put('/:id', requireCaseRole('collaborator'), asyncHandler(updateCaseHandler));
casesRouter.delete('/:id', requireCaseRole('lead'), asyncHandler(deleteCaseHandler));
