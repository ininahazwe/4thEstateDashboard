export type CaseStatus = 'preparing' | 'in_progress' | 'paused' | 'published' | 'closed';
export type Sensitivity = 'public' | 'internal' | 'confidential' | 'highly_sensitive';

export interface Case {
  id: number;
  title: string;
  description: string | null;
  editorialContext: string | null;
  status: CaseStatus;
  sensitivity: Sensitivity;
  dueDate: string | null;
  publishedAt: string | null;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
}
