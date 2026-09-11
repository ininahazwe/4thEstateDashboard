import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireAuth, requireCaseRole } from '../../middleware/auth';
import {
  createEventHandler,
  deleteEventHandler,
  getEventHandler,
  listEventsHandler,
  updateEventHandler,
} from './events.controller';

// Mounted at /api/cases/:caseId/events in app.ts. mergeParams lets this
// router see the parent's :caseId, which requireCaseRole relies on.
export const eventsRouter = Router({ mergeParams: true });

eventsRouter.use(requireAuth);

eventsRouter.get('/', requireCaseRole('read_only'), asyncHandler(listEventsHandler));
eventsRouter.post('/', requireCaseRole('collaborator'), asyncHandler(createEventHandler));
eventsRouter.get('/:eventId', requireCaseRole('read_only'), asyncHandler(getEventHandler));
eventsRouter.put('/:eventId', requireCaseRole('collaborator'), asyncHandler(updateEventHandler));
eventsRouter.delete('/:eventId', requireCaseRole('lead'), asyncHandler(deleteEventHandler));
