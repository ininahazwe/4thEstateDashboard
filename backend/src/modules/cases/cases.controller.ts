import { Request, Response } from 'express';
import { z } from 'zod';
import { createCase, deleteCase, getCaseById, listCasesForUser, updateCase } from './cases.service';

const sensitivityEnum = z.enum(['public', 'internal', 'confidential', 'highly_sensitive']);
const statusEnum = z.enum(['preparing', 'in_progress', 'paused', 'published', 'closed']);

const createCaseSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  editorialContext: z.string().optional(),
  sensitivity: sensitivityEnum.optional(),
  dueDate: z.string().optional(),
});

const updateCaseSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  editorialContext: z.string().optional(),
  status: statusEnum.optional(),
  sensitivity: sensitivityEnum.optional(),
  dueDate: z.string().optional(),
  publishedAt: z.string().optional(),
});

export async function listCasesHandler(req: Request, res: Response) {
  const cases = await listCasesForUser(req.user!.id);
  res.json(cases);
}

export async function createCaseHandler(req: Request, res: Response) {
  const input = createCaseSchema.parse(req.body);
  const created = await createCase(input, req.user!.id);
  res.status(201).json(created);
}

export async function getCaseHandler(req: Request, res: Response) {
  const caseItem = await getCaseById(Number(req.params.id), req.user!.id);
  // requireCaseRole (mounted on this route) already resolved the caller's
  // role; surface it so the frontend can show lead-only controls (e.g.
  // contributor management) without a second request.
  res.json({ ...caseItem, myRole: req.caseRole });
}

export async function updateCaseHandler(req: Request, res: Response) {
  const input = updateCaseSchema.parse(req.body);
  const updated = await updateCase(Number(req.params.id), input, req.user!.id);
  res.json(updated);
}

export async function deleteCaseHandler(req: Request, res: Response) {
  await deleteCase(Number(req.params.id), req.user!.id);
  res.status(204).send();
}
