import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import { crossCaseSearch, toCsv, SearchFilters, SearchResourceType } from './search.service';

const resourceTypeEnum = z.enum(['case', 'event', 'comment', 'document']);
const sensitivityEnum = z.enum(['public', 'internal', 'confidential', 'highly_sensitive']);
const eventTypeEnum = z.enum([
  'interview',
  'meeting',
  'call',
  'field_visit',
  'document_analysis',
  'key_discovery',
  'dead_end',
  'pivot',
  'publication',
]);

const querySchema = z.object({
  q: z.string().trim().min(2, 'Search term must be at least 2 characters'),
  sensitivity: sensitivityEnum.optional(),
  eventType: eventTypeEnum.optional(),
  contributor: z.string().trim().min(1).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  // Comma-separated resource types, e.g. "case,document" — kept as one
  // query param rather than types[]=a&types[]=b since it's simpler to
  // build from a handful of checkboxes on the frontend.
  types: z.string().optional(),
});

function parseTypes(raw?: string): SearchResourceType[] | undefined {
  if (!raw) return undefined;
  const values = raw
    .split(',')
    .map((v) => v.trim())
    .filter((v): v is SearchResourceType => resourceTypeEnum.safeParse(v).success);
  return values.length ? values : undefined;
}

function toFilters(query: z.infer<typeof querySchema>): SearchFilters {
  return {
    q: query.q,
    sensitivity: query.sensitivity,
    eventType: query.eventType,
    contributor: query.contributor,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    resourceTypes: parseTypes(query.types),
  };
}

// Mounted at /api/search in app.ts — not case-scoped, since the whole point
// is to search across every case the caller has access to.
export const searchRouter = Router();

searchRouter.use(requireAuth);

searchRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = querySchema.parse(req.query);
    const results = await crossCaseSearch(req.user!.id, toFilters(query));
    res.json(results);
  })
);

searchRouter.get(
  '/export',
  asyncHandler(async (req, res) => {
    const query = querySchema.parse(req.query);
    const results = await crossCaseSearch(req.user!.id, toFilters(query));
    const csv = toCsv(results);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="search-results.csv"');
    res.send(csv);
  })
);
