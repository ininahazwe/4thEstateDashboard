import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import { listGeolocatedEvents } from './geo.service';

const querySchema = z.object({
  caseId: z.coerce.number().int().positive().optional(),
});

// Mounted at /api/geo in app.ts — cross-case by default (every geolocated
// event across every case the caller contributes to), or scoped to one
// case via ?caseId=, same access model as /api/graph and /api/search.
export const geoRouter = Router();

geoRouter.use(requireAuth);

geoRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = querySchema.parse(req.query);
    const events = await listGeolocatedEvents(req.user!.id, { caseId: query.caseId });
    res.json(events);
  })
);
