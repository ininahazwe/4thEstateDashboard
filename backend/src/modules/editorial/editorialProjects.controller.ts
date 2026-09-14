import { Request, Response } from 'express';
import { z } from 'zod';
import {
  createProject,
  deleteProject,
  getPortfolioKpis,
  getProjectById,
  listProjectsForUser,
  updateProject,
} from './editorialProjects.service';
import { listProjectContributors } from './editorialProjectContributors.service';
import { listLinkedCases } from './editorialProjectCases.service';
import { listMilestones } from './editorialProjectMilestones.service';

const statusEnum = z.enum(['pitch', 'researching', 'writing', 'fact_check', 'editing', 'ready', 'published']);
const sortEnum = z.enum(['date', 'urgency', 'progress']);

const createProjectSchema = z.object({
  title: z.string().min(1).max(255),
  targetPublication: z.string().max(150).optional(),
  targetDate: z.string().optional(),
  status: statusEnum.optional(),
});

const updateProjectSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  targetPublication: z.string().max(150).optional(),
  targetDate: z.string().optional(),
  status: statusEnum.optional(),
});

const listQuerySchema = z.object({
  status: statusEnum.optional(),
  contributorUserId: z.coerce.number().int().positive().optional(),
  tagId: z.coerce.number().int().positive().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  sort: sortEnum.optional(),
});

export async function listProjectsHandler(req: Request, res: Response) {
  const query = listQuerySchema.parse(req.query);
  const [projects, kpis] = await Promise.all([
    listProjectsForUser(req.user!.id, query),
    getPortfolioKpis(req.user!.id),
  ]);
  res.json({ projects, kpis });
}

export async function createProjectHandler(req: Request, res: Response) {
  const input = createProjectSchema.parse(req.body);
  const created = await createProject(input, req.user!.id);
  res.status(201).json(created);
}

export async function getProjectHandler(req: Request, res: Response) {
  const projectId = Number(req.params.id);
  const [project, contributors, linkedCases, milestones] = await Promise.all([
    getProjectById(projectId, req.user!.id),
    listProjectContributors(projectId),
    listLinkedCases(projectId, req.user!.id),
    listMilestones(projectId),
  ]);
  // requireProjectContributor (mounted on this route) already resolved the
  // caller's role — surfaced here so the frontend can show lead-only
  // controls without a second request, same pattern as cases' myRole.
  res.json({ ...project, myRole: req.projectRole, contributors, linkedCases, milestones });
}

export async function updateProjectHandler(req: Request, res: Response) {
  const input = updateProjectSchema.parse(req.body);
  const updated = await updateProject(Number(req.params.id), input, req.user!.id);
  res.json(updated);
}

export async function deleteProjectHandler(req: Request, res: Response) {
  await deleteProject(Number(req.params.id), req.user!.id);
  res.status(204).send();
}
