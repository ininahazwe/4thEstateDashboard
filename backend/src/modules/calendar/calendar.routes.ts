import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import { getCalendarData } from './calendar.service';

const querySchema = z.object({
  caseId: z.coerce.number().int().positive().optional(),
});

// Mounted at /api/calendar in app.ts — cross-case by default (every event
// and case due date across every case the caller contributes to), or
// scoped to one case via ?caseId=, same access model as /api/graph,
// /api/search and /api/geo.
export const calendarRouter = Router();

calendarRouter.use(requireAuth);

calendarRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = querySchema.parse(req.query);
    const data = await getCalendarData(req.user!.id, { caseId: query.caseId });
    res.json(data);
  })
);
