import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import { buildRelationshipGraph } from './graph.service';

const querySchema = z.object({
  caseId: z.coerce.number().int().positive().optional(),
});

// Mounted at /api/graph in app.ts — cross-case by default (every accessible
// case at once), or scoped to one case via ?caseId=, same access model as
// /api/search: results are always filtered down to cases the caller
// actually contributes to.
export const graphRouter = Router();

graphRouter.use(requireAuth);

graphRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = querySchema.parse(req.query);
    const graph = await buildRelationshipGraph(req.user!.id, { caseId: query.caseId });
    res.json(graph);
  })
);
