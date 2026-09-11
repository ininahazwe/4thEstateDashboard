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
  findingsSummary: unknown | null;
  sensitivity: string | null;
  followUpStatus: FollowUpStatus;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
  contactIds: number[];
}
