import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import { findOrCreateTag, listTags, TagType } from './tags.service';

const typeEnum = z.enum(['theme', 'tag']);
const createTagSchema = z.object({ name: z.string().min(1).max(100), type: typeEnum });

// Mounted at /api/tags in app.ts.
export const tagsRouter = Router();

tagsRouter.use(requireAuth);

tagsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const type = typeof req.query.type === 'string' ? (req.query.type as TagType) : undefined;
    res.json(await listTags(type));
  })
);

tagsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, type } = createTagSchema.parse(req.body);
    res.status(201).json(await findOrCreateTag(name, type, req.user!.id));
  })
);
