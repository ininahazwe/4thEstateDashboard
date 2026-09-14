import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../../config/db';
import { AppError } from '../../utils/AppError';
import { recordAudit } from '../../middleware/auditLog';
import { MilestoneStatus, ProjectMilestone } from './editorialProjects.types';

interface MilestoneRow extends RowDataPacket {
  id: number;
  project_id: number;
  name: string;
  due_date: string | null;
  status: MilestoneStatus;
  completed_at: string | null;
}

function mapMilestone(row: MilestoneRow): ProjectMilestone {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    dueDate: row.due_date,
    status: row.status,
    completedAt: row.completed_at,
  };
}

export async function listMilestones(projectId: number) {
  const [rows] = await pool.query<MilestoneRow[]>(
    `SELECT * FROM project_milestones WHERE project_id = :projectId
     ORDER BY due_date IS NULL ASC, due_date ASC, id ASC`,
    { projectId }
  );
  return rows.map(mapMilestone);
}

export interface CreateMilestoneInput {
  name: string;
  dueDate?: string;
  status?: MilestoneStatus;
}

export async function createMilestone(projectId: number, input: CreateMilestoneInput, actorId: number) {
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO project_milestones (project_id, name, due_date, status)
     VALUES (:projectId, :name, :dueDate, :status)`,
    {
      projectId,
      name: input.name,
      dueDate: input.dueDate ?? null,
      status: input.status ?? 'pending',
    }
  );

  await recordAudit({
    actorId,
    caseId: null,
    action: 'create',
    resourceType: 'project_milestone',
    resourceId: result.insertId,
    after: { projectId, ...input },
  });

  return listMilestones(projectId);
}

export interface UpdateMilestoneInput {
  name?: string;
  dueDate?: string;
  status?: MilestoneStatus;
}

export async function updateMilestone(
  projectId: number,
  milestoneId: number,
  input: UpdateMilestoneInput,
  actorId: number
) {
  const [rows] = await pool.query<MilestoneRow[]>(
    'SELECT * FROM project_milestones WHERE id = :milestoneId AND project_id = :projectId',
    { milestoneId, projectId }
  );
  const existing = rows[0];
  if (!existing) {
    throw new AppError(404, 'Milestone not found on this editorial project.');
  }

  const nextStatus = input.status ?? existing.status;
  // completed_at is set the moment a milestone first reaches "done", and
  // cleared if it's ever moved back out of "done" — kept in sync with
  // status rather than left stale.
  const completedAt = nextStatus === 'done' ? (existing.status === 'done' ? existing.completed_at : new Date()) : null;

  await pool.query(
    `UPDATE project_milestones SET
       name = :name,
       due_date = :dueDate,
       status = :status,
       completed_at = :completedAt
     WHERE id = :milestoneId`,
    {
      milestoneId,
      name: input.name ?? existing.name,
      dueDate: input.dueDate ?? existing.due_date,
      status: nextStatus,
      completedAt,
    }
  );

  await recordAudit({
    actorId,
    caseId: null,
    action: 'update',
    resourceType: 'project_milestone',
    resourceId: milestoneId,
    before: mapMilestone(existing),
    after: input,
  });

  return listMilestones(projectId);
}

export async function deleteMilestone(projectId: number, milestoneId: number, actorId: number) {
  const [result] = await pool.query<ResultSetHeader>(
    'DELETE FROM project_milestones WHERE id = :milestoneId AND project_id = :projectId',
    { milestoneId, projectId }
  );
  if (result.affectedRows === 0) {
    throw new AppError(404, 'Milestone not found on this editorial project.');
  }

  await recordAudit({
    actorId,
    caseId: null,
    action: 'delete',
    resourceType: 'project_milestone',
    resourceId: milestoneId,
    before: { projectId },
  });
}
