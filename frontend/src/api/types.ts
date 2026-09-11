export type CaseStatus = 'preparing' | 'in_progress' | 'paused' | 'published' | 'closed';
export type Sensitivity = 'public' | 'internal' | 'confidential' | 'highly_sensitive';

export interface CaseSummary {
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

export type EventType =
  | 'interview'
  | 'meeting'
  | 'call'
  | 'field_visit'
  | 'document_analysis'
  | 'key_discovery'
  | 'dead_end'
  | 'pivot'
  | 'publication';

export type FollowUpStatus = 'to_process' | 'in_progress' | 'resolved' | 'no_further_action';

export interface InvestigationEvent {
  id: number;
  caseId: number;
  type: EventType;
  eventDate: string;
  location: string | null;
  locationLat: number | null;
  locationLng: number | null;
  reason: string | null;
  findingsSummary: unknown;
  sensitivity: Sensitivity | null;
  followUpStatus: FollowUpStatus;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
  contactIds: number[];
}

export interface Contact {
  id: number;
  fullName: string;
  email: string | null;
  phone: string | null;
  organization: string | null;
  roleOrTitle: string | null;
  notes: string | null;
  sensitivity: 'none' | 'protected_witness' | 'at_risk_source';
  reliability: number | null;
  privateNotes: string | null;
}

export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
}
