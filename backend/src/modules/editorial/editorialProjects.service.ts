import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../../config/db';
import { AppError } from '../../utils/AppError';
import { recordAudit } from '../../middleware/auditLog';
import { EditorialProject, EditorialProjectSummary, PortfolioKpis, ProjectStatus } from './editorialProjects.types';

// Pipeline order from the brief (§2.1): pitch -> researching -> writing ->
// fact_check -> editing -> ready -> published. Used for the "progress" sort
// on the portfolio (further along the pipeline = more progress) — simpler
// and always available, unlike a milestone-completion ratio which is empty
// for a project with no milestones yet.
const STATUS_RANK: Record<ProjectStatus, number> = {
  pitch: 0,
  researching: 1,
  writing: 2,
  fact_check: 3,
  editing: 4,
  ready: 5,
  published: 6,
};

interface ProjectRow extends RowDataPacket {
  id: number;
  title: string;
  target_publication: string | null;
  target_date: string | null;
  status: ProjectStatus;
  created_by: number;
  created_at: string;
  updated_at: string;
}

interface ProjectCountsRow extends RowDataPacket {
  project_id: number;
  contributor_count: number;
  linked_case_count: number;
  milestone_total: number;
  milestone_done: number;
}

function mapProject(row: ProjectRow): EditorialProject {
  return {
    id: row.id,
    title: row.title,
    targetPublication: row.target_publication,
    targetDate: row.target_date,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateProjectInput {
  title: string;
  targetPublication?: string;
  targetDate?: string;
  status?: ProjectStatus;
}

export interface UpdateProjectInput {
  title?: string;
  targetPublication?: string;
  targetDate?: string;
  status?: ProjectStatus;
}

export interface ProjectFilters {
  status?: ProjectStatus;
  contributorUserId?: number;
  tagId?: number;
  from?: string;
  to?: string;
  sort?: 'date' | 'urgency' | 'progress';
}

export async function createProject(input: CreateProjectInput, actorId: number) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query<ResultSetHeader>(
      `INSERT INTO editorial_projects (title, target_publication, target_date, status, created_by)
       VALUES (:title, :targetPublication, :targetDate, :status, :createdBy)`,
      {
        title: input.title,
        targetPublication: input.targetPublication ?? null,
        targetDate: input.targetDate ?? null,
        status: input.status ?? 'pitch',
        createdBy: actorId,
      }
    );

    const projectId = result.insertId;

    // The creator is automatically added as lead_journalist, mirroring how
    // a case's creator becomes its lead (brief §1.1) — they can otherwise
    // manage the project's contributors right away.
    await conn.query(
      `INSERT INTO editorial_project_contributors (project_id, user_id, role)
       VALUES (:projectId, :userId, 'lead_journalist')`,
      { projectId, userId: actorId }
    );

    await conn.commit();

    await recordAudit({
      actorId,
      caseId: null,
      action: 'create',
      resourceType: 'editorial_project',
      resourceId: projectId,
      after: input,
    });

    return getProjectById(projectId, actorId);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

function sortClause(sort: ProjectFilters['sort']): string {
  switch (sort) {
    case 'urgency':
      // Anything already published is no longer urgent, whatever its date;
      // among the rest, the soonest target_date comes first, undated
      // projects last.
      return `ep.status = 'published' ASC, ep.target_date IS NULL ASC, ep.target_date ASC`;
    case 'progress':
      return `FIELD(ep.status, 'published','ready','editing','fact_check','writing','researching','pitch') ASC`;
    case 'date':
    default:
      return `ep.target_date IS NULL ASC, ep.target_date ASC, ep.updated_at DESC`;
  }
}

// Only editorial projects the caller is a contributor on are ever listed —
// access control happens at the query level, same discipline as
// listCasesForUser.
// The index signature is what lets this satisfy mysql2's named-placeholder
// params type below (same fix as search.service.ts's QueryParams) — every
// value here is already a plain string/number, so it doesn't change what
// actually gets sent to the query.
interface ListParams {
  userId: number;
  status?: ProjectStatus;
  contributorUserId?: number;
  tagId?: number;
  from?: string;
  to?: string;
  [key: string]: string | number | undefined;
}

export async function listProjectsForUser(userId: number, filters: ProjectFilters = {}) {
  const conditions = ['epc.user_id = :userId', 'ep.deleted_at IS NULL'];
  const params: ListParams = { userId };

  if (filters.status) {
    conditions.push('ep.status = :status');
    params.status = filters.status;
  }
  if (filters.contributorUserId) {
    conditions.push(
      `EXISTS (SELECT 1 FROM editorial_project_contributors epc2
               WHERE epc2.project_id = ep.id AND epc2.user_id = :contributorUserId)`
    );
    params.contributorUserId = filters.contributorUserId;
  }
  if (filters.tagId) {
    conditions.push(
      `EXISTS (SELECT 1 FROM project_cases pc
               JOIN case_tags ct ON ct.case_id = pc.case_id
               WHERE pc.project_id = ep.id AND ct.tag_id = :tagId)`
    );
    params.tagId = filters.tagId;
  }
  if (filters.from) {
    conditions.push('ep.target_date >= :from');
    params.from = filters.from;
  }
  if (filters.to) {
    conditions.push('ep.target_date <= :to');
    params.to = filters.to;
  }

  const [rows] = await pool.query<ProjectRow[]>(
    `SELECT ep.* FROM editorial_projects ep
     JOIN editorial_project_contributors epc ON epc.project_id = ep.id
     WHERE ${conditions.join(' AND ')}
     ORDER BY ${sortClause(filters.sort)}`,
    params
  );

  if (rows.length === 0) return [] as EditorialProjectSummary[];

  const projectIds = rows.map((r) => r.id);
  const [countRows] = await pool.query<ProjectCountsRow[]>(
    `SELECT
       ep.id AS project_id,
       (SELECT COUNT(*) FROM editorial_project_contributors epc WHERE epc.project_id = ep.id) AS contributor_count,
       (SELECT COUNT(*) FROM project_cases pc WHERE pc.project_id = ep.id) AS linked_case_count,
       (SELECT COUNT(*) FROM project_milestones pm WHERE pm.project_id = ep.id) AS milestone_total,
       (SELECT COUNT(*) FROM project_milestones pm WHERE pm.project_id = ep.id AND pm.status = 'done') AS milestone_done
     FROM editorial_projects ep
     WHERE ep.id IN (:projectIds)`,
    { projectIds }
  );
  const countsByProject = new Map(countRows.map((r) => [r.project_id, r]));

  return rows.map((row) => {
    const counts = countsByProject.get(row.id);
    return {
      ...mapProject(row),
      contributorCount: counts?.contributor_count ?? 0,
      linkedCaseCount: counts?.linked_case_count ?? 0,
      milestoneTotal: counts?.milestone_total ?? 0,
      milestoneDone: counts?.milestone_done ?? 0,
    } satisfies EditorialProjectSummary;
  });
}

// Portfolio-wide KPI header (brief §2.2) — deliberately computed over *all*
// projects the caller can see, not the currently filtered list, same as a
// typical dashboard summary bar staying stable while the list below it is
// filtered.
export async function getPortfolioKpis(userId: number): Promise<PortfolioKpis> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT ep.status, ep.updated_at
     FROM editorial_projects ep
     JOIN editorial_project_contributors epc ON epc.project_id = ep.id
     WHERE epc.user_id = :userId AND ep.deleted_at IS NULL`,
    { userId }
  );

  const now = new Date();
  let active = 0;
  let toLaunch = 0;
  let publishedThisMonth = 0;

  for (const row of rows) {
    const status = row.status as ProjectStatus;
    if (status === 'pitch') {
      toLaunch += 1;
    } else if (status !== 'published') {
      active += 1;
    } else {
      // No dedicated "published_at" column on editorial_projects (unlike
      // cases) — updated_at is used as an approximation of when the status
      // last changed to "published". Known limitation: any later edit to
      // an already-published project would (incorrectly) keep counting as
      // published "this month" — acceptable for a KPI header, documented in
      // etat-avancement.md.
      const updatedAt = new Date(row.updated_at as string);
      if (updatedAt.getFullYear() === now.getFullYear() && updatedAt.getMonth() === now.getMonth()) {
        publishedThisMonth += 1;
      }
    }
  }

  return { active, toLaunch, publishedThisMonth };
}

export async function getProjectById(projectId: number, viewerId: number) {
  const [rows] = await pool.query<ProjectRow[]>(
    'SELECT * FROM editorial_projects WHERE id = :projectId AND deleted_at IS NULL',
    { projectId }
  );
  const row = rows[0];
  if (!row) {
    throw new AppError(404, 'Editorial project not found');
  }
  return mapProject(row);
}

export async function updateProject(projectId: number, input: UpdateProjectInput, actorId: number) {
  const existing = await getProjectById(projectId, actorId);

  await pool.query(
    `UPDATE editorial_projects SET
       title = :title,
       target_publication = :targetPublication,
       target_date = :targetDate,
       status = :status
     WHERE id = :projectId`,
    {
      projectId,
      title: input.title ?? existing.title,
      targetPublication: input.targetPublication ?? existing.targetPublication,
      targetDate: input.targetDate ?? existing.targetDate,
      status: input.status ?? existing.status,
    }
  );

  await recordAudit({
    actorId,
    caseId: null,
    action: 'update',
    resourceType: 'editorial_project',
    resourceId: projectId,
    before: existing,
    after: input,
  });

  return getProjectById(projectId, actorId);
}

export async function deleteProject(projectId: number, actorId: number) {
  const existing = await getProjectById(projectId, actorId);

  await pool.query('UPDATE editorial_projects SET deleted_at = NOW() WHERE id = :projectId', { projectId });

  await recordAudit({
    actorId,
    caseId: null,
    action: 'delete',
    resourceType: 'editorial_project',
    resourceId: projectId,
    before: existing,
  });
}
