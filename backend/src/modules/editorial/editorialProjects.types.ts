export type ProjectStatus =
  | 'pitch'
  | 'researching'
  | 'writing'
  | 'fact_check'
  | 'editing'
  | 'ready'
  | 'published';

export type ProjectContributorRole = 'lead_journalist' | 'editor' | 'researcher' | 'photographer';

export type MilestoneStatus = 'pending' | 'in_progress' | 'done' | 'skipped';

export interface EditorialProject {
  id: number;
  title: string;
  targetPublication: string | null;
  targetDate: string | null;
  status: ProjectStatus;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
}

export interface EditorialProjectSummary extends EditorialProject {
  contributorCount: number;
  linkedCaseCount: number;
  milestoneTotal: number;
  milestoneDone: number;
}

export interface ProjectContributor {
  userId: number;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  role: ProjectContributorRole;
  addedAt: string;
}

export interface ProjectMilestone {
  id: number;
  projectId: number;
  name: string;
  dueDate: string | null;
  status: MilestoneStatus;
  completedAt: string | null;
}

export interface LinkedCase {
  id: number;
  title: string;
  status: string;
  sensitivity: string;
  linkedAt: string;
}

export interface PortfolioKpis {
  active: number;
  toLaunch: number;
  publishedThisMonth: number;
}
