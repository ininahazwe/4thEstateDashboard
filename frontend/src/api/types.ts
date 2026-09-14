export type CaseStatus = 'preparing' | 'in_progress' | 'paused' | 'published' | 'closed';
export type Sensitivity = 'public' | 'internal' | 'confidential' | 'highly_sensitive';

export type CaseRole = 'lead' | 'collaborator' | 'observer' | 'read_only';

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
  // Only present on GET /cases/:id — the caller's own role on this case,
  // resolved server-side by requireCaseRole. Lets the UI show lead-only
  // controls (contributor management) without a second request.
  myRole?: CaseRole;
  // Only present on GET /cases (the list view) — tags/themes linked to the
  // case, so the list can show badges without a request per card.
  tags?: CaseTag[];
}

export interface CaseContributor {
  userId: number;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  role: CaseRole;
  addedAt: string;
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

export interface LinkedContact {
  id: number;
  fullName: string;
  email: string | null;
  phone: string | null;
  organization: string | null;
  roleOrTitle: string | null;
  sensitivity: Contact['sensitivity'];
  reliability: number | null;
  addedAt: string;
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

export type CommentResourceType = 'case' | 'event' | 'document';
export type CommentVisibility = 'private' | 'shared';

export interface CommentMentions {
  contactIds?: number[];
  eventIds?: number[];
}

export interface Comment {
  id: number;
  resourceType: CommentResourceType;
  resourceId: number;
  parentCommentId: number | null;
  authorId: number;
  authorName: string;
  body: string;
  visibility: CommentVisibility;
  mentions: CommentMentions | null;
  createdAt: string;
  updatedAt: string;
}

export type DocumentFileType = 'contract' | 'report' | 'photo' | 'audio' | 'video' | 'other';
export type OcrStatus = 'not_applicable' | 'pending' | 'done' | 'failed';

export interface CaseDocument {
  id: number;
  caseId: number;
  eventId: number | null;
  fileName: string;
  fileType: DocumentFileType;
  sensitivity: Sensitivity | null;
  sourceDescription: string | null;
  extractedDate: string | null;
  ocrStatus: OcrStatus;
  uploadedBy: number;
  uploadedAt: string;
}

export type TagType = 'theme' | 'tag';

export interface Tag {
  id: number;
  name: string;
  type: TagType;
  createdAt: string;
}

export interface CaseTag {
  id: number;
  name: string;
  type: TagType;
}

export type AuditAction = 'create' | 'update' | 'read' | 'delete' | 'download' | 'share';

export interface AuditLogEntry {
  id: number;
  actorId: number | null;
  actorName: string | null;
  action: AuditAction;
  resourceType: string;
  resourceId: number;
  before: unknown;
  after: unknown;
  createdAt: string;
}

export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
  // Only present on GET /auth/me (not embedded in the JWT itself, since it
  // can change independently of it) -- whether this account has TOTP 2FA
  // enrolled (brief §5.2). Drives whether the Security page offers "Enable"
  // or "Disable".
  totpEnabled?: boolean;
}

export type SearchResourceType = 'case' | 'event' | 'comment' | 'document';

export interface SearchResult {
  resourceType: SearchResourceType;
  caseId: number;
  caseTitle: string;
  resourceId: number;
  title: string;
  snippet: string;
  sensitivity: Sensitivity | null;
  date: string;
}

// Matches the notifications table's `type` ENUM (pre-existing in the DB —
// only 'new_action', 'access_granted' and 'sensitivity_increased' are
// actually emitted today; 'mention' and 'deadline_approaching' are defined
// but not wired up yet, see backend/README.md > Notifications).
export type NotificationType =
  | 'new_action'
  | 'mention'
  | 'deadline_approaching'
  | 'sensitivity_increased'
  | 'access_granted';

// The table itself only has id/type/payload/read/createdAt — everything
// case-specific (which case, its title, who triggered it, ...) lives
// inside payload, denormalized at write time by the backend.
export interface NotificationItem {
  id: number;
  type: NotificationType;
  payload: {
    caseId?: number;
    caseTitle?: string;
    actorName?: string | null;
    role?: string;
    event?: 'added' | 'role_changed';
    from?: string;
    to?: string;
    snippet?: string;
    onResourceType?: string;
    onResourceId?: number;
  } | null;
  read: boolean;
  createdAt: string;
}

export type GraphNodeType = 'case' | 'event' | 'contact' | 'tag' | 'location';

export type GraphEdgeType =
  | 'linked_to_case'
  | 'involved_in_event'
  | 'interviewed_at'
  | 'discovered_at'
  | 'part_of_case'
  | 'tagged_with'
  | 'took_place_at'
  | 'met'
  | 'mentioned_in';

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  sensitivity?: Sensitivity | null;
  meta?: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: GraphEdgeType;
  label: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// A geolocated event for the map view (Phase 4) — one entry per
// investigation_events row that has both location_lat and location_lng
// set. Cross-case (or scoped to one case via ?caseId=), same access model
// as GraphData/SearchResult.
export interface GeoEvent {
  id: number;
  caseId: number;
  caseTitle: string;
  sensitivity: Sensitivity;
  type: EventType;
  eventDate: string;
  location: string | null;
  lat: number;
  lng: number;
  reason: string | null;
}

// Calendar / agenda (Phase 4) — a month/week view over investigation_events
// (eventDate) and case due dates (dueDate). Cross-case (or scoped to one
// case via ?caseId=), same access model as GraphData/GeoEvent.
export interface CalendarEvent {
  id: number;
  caseId: number;
  caseTitle: string;
  sensitivity: Sensitivity;
  type: EventType;
  eventDate: string;
  location: string | null;
  reason: string | null;
  followUpStatus: FollowUpStatus;
}

export interface CalendarDueDate {
  caseId: number;
  caseTitle: string;
  sensitivity: Sensitivity;
  status: CaseStatus;
  dueDate: string;
}

export interface CalendarData {
  events: CalendarEvent[];
  dueDates: CalendarDueDate[];
}

// Editorial projects & portfolio view (Phase 4, brief §2.1/§2.2) — distinct
// from a case/dossier: several cases can feed one editorial project.
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
  // Only present on GET /editorial-projects/:id — the caller's own role,
  // resolved server-side (same idea as CaseSummary.myRole).
  myRole?: ProjectContributorRole;
  contributors?: ProjectContributor[];
  linkedCases?: LinkedCase[];
  milestones?: ProjectMilestone[];
}

// Only present on GET /editorial-projects (the portfolio list view) — one
// row per project with rollup counts, so the grid doesn't need a request
// per card.
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
  status: CaseStatus;
  sensitivity: Sensitivity;
  linkedAt: string;
}

export interface PortfolioKpis {
  active: number;
  toLaunch: number;
  publishedThisMonth: number;
}

export interface PortfolioResponse {
  projects: EditorialProjectSummary[];
  kpis: PortfolioKpis;
}

// Two-factor authentication (brief §5.2) — account-level TOTP enrollment,
// plus the step-up flow a highly-sensitive case route requires.
export interface TotpStatus {
  enabled: boolean;
}

export interface TotpSetupResponse {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
}

export interface TotpEnableResponse {
  recoveryCodes: string[];
}

export interface TotpStepUpResponse {
  token: string;
}
