import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireAuth, requireProjectContributor, requireProjectLead } from '../../middleware/auth';
import {
  createProjectHandler,
  deleteProjectHandler,
  getProjectHandler,
  listProjectsHandler,
  updateProjectHandler,
} from './editorialProjects.controller';

export const editorialProjectsRouter = Router();

editorialProjectsRouter.use(requireAuth);

// Listing/creating don't need requireProjectContributor (there's no project
// yet, or the query already scopes results to the caller's own projects) —
// same reasoning as casesRouter.
editorialProjectsRouter.get('/', asyncHandler(listProjectsHandler));
editorialProjectsRouter.post('/', asyncHandler(createProjectHandler));

// Project roles are functional, not ranked (brief §2.1) — any contributor
// can read/edit; only the lead_journalist deletes. See requireProjectContributor
// / requireProjectLead in middleware/auth.ts.
editorialProjectsRouter.get('/:id', requireProjectContributor(), asyncHandler(getProjectHandler));
editorialProjectsRouter.put('/:id', requireProjectContributor(), asyncHandler(updateProjectHandler));
editorialProjectsRouter.delete('/:id', requireProjectLead(), asyncHandler(deleteProjectHandler));
