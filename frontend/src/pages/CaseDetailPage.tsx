import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, requestBlob } from '../api/client';
import {
  AuditLogEntry,
  CaseContributor,
  CaseDocument,
  CaseRole,
  CaseStatus,
  CaseSummary,
  CaseTag,
  Comment,
  CommentVisibility,
  Contact,
  DocumentFileType,
  EventType,
  FollowUpStatus,
  InvestigationEvent,
  LinkedContact,
  Sensitivity,
  Tag,
  TagType,
} from '../api/types';
import { ContactSensitivityBadge, SensitivityBadge, StatusBadge } from '../components/StatusBadge';
import { AppShell } from '../components/AppShell';
import { PresenceBar } from '../components/PresenceBar';
import { useCasePresence } from '../realtime/useCasePresence';
import { useAuth } from '../auth/AuthContext';

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  interview: 'Interview',
  meeting: 'Meeting',
  call: 'Call',
  field_visit: 'Field visit',
  document_analysis: 'Document analysis',
  key_discovery: 'Key discovery',
  dead_end: 'Dead end',
  pivot: 'Pivot',
  publication: 'Publication',
};

const FOLLOW_UP_LABELS: Record<FollowUpStatus, string> = {
  to_process: 'To process',
  in_progress: 'In progress',
  resolved: 'Resolved',
  no_further_action: 'No further action',
};

const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  preparing: 'Preparing',
  in_progress: 'In progress',
  paused: 'Paused',
  published: 'Published',
  closed: 'Closed',
};

const SENSITIVITY_LABELS: Record<Sensitivity, string> = {
  public: 'Public',
  internal: 'Internal',
  confidential: 'Confidential',
  highly_sensitive: 'Highly sensitive',
};

const ROLE_LABELS: Record<CaseRole, string> = {
  lead: 'Lead',
  collaborator: 'Collaborator',
  observer: 'Observer',
  read_only: 'Read only',
};

const AUDIT_ACTION_LABELS: Record<AuditLogEntry['action'], string> = {
  create: 'Created',
  update: 'Updated',
  read: 'Viewed',
  delete: 'Deleted',
  download: 'Downloaded',
  share: 'Shared',
};

const DOCUMENT_TYPE_LABELS: Record<DocumentFileType, string> = {
  contract: 'Contract',
  report: 'Report',
  photo: 'Photo',
  audio: 'Audio',
  video: 'Video',
  other: 'Other',
};

// Converts an ISO datetime (as returned by the API) to the
// "YYYY-MM-DDTHH:mm" format <input type="datetime-local"> expects.
function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CaseDetailPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const { user, loginWithToken } = useAuth();
  const presenceUsers = useCasePresence(caseId ? Number(caseId) : undefined);
  const [caseItem, setCaseItem] = useState<CaseSummary | null>(null);
  const [events, setEvents] = useState<InvestigationEvent[]>([]);
  const [contributors, setContributors] = useState<CaseContributor[]>([]);
  const [linkedContacts, setLinkedContacts] = useState<LinkedContact[]>([]);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [showCaseEditForm, setShowCaseEditForm] = useState(false);
  const [caseEditError, setCaseEditError] = useState<string | null>(null);
  const [showContributorForm, setShowContributorForm] = useState(false);
  const [contributorError, setContributorError] = useState<string | null>(null);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [expandedEntryId, setExpandedEntryId] = useState<number | null>(null);
  const [caseTags, setCaseTags] = useState<CaseTag[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [showTagLinkForm, setShowTagLinkForm] = useState(false);
  const [showNewTagForm, setShowNewTagForm] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<CaseDocument[]>([]);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [replyingToId, setReplyingToId] = useState<number | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [totpGate, setTotpGate] = useState<
    { code: 'TOTP_SETUP_REQUIRED' | 'TOTP_STEP_UP_REQUIRED'; message: string } | null
  >(null);
  const [stepUpCode, setStepUpCode] = useState('');
  const [stepUpError, setStepUpError] = useState<string | null>(null);
  const [stepUpSubmitting, setStepUpSubmitting] = useState(false);

  async function loadAll() {
    if (!caseId) return;
    setLoading(true);
    try {
      const [
        caseData,
        eventsData,
        contributorsData,
        linkedContactsData,
        allContactsData,
        auditLogData,
        caseTagsData,
        allTagsData,
        documentsData,
        commentsData,
      ] = await Promise.all([
        api.get<CaseSummary>(`/cases/${caseId}`),
        api.get<InvestigationEvent[]>(`/cases/${caseId}/events`),
        api.get<CaseContributor[]>(`/cases/${caseId}/contributors`),
        api.get<LinkedContact[]>(`/cases/${caseId}/contacts`),
        api.get<Contact[]>('/contacts'),
        api.get<AuditLogEntry[]>(`/cases/${caseId}/audit-log`),
        api.get<CaseTag[]>(`/cases/${caseId}/tags`),
        api.get<Tag[]>('/tags'),
        api.get<CaseDocument[]>(`/cases/${caseId}/documents`),
        api.get<Comment[]>(`/cases/${caseId}/comments`),
      ]);
      setCaseItem(caseData);
      setEvents(eventsData);
      setContributors(contributorsData);
      setLinkedContacts(linkedContactsData);
      setAllContacts(allContactsData);
      setAuditLog(auditLogData);
      setCaseTags(caseTagsData);
      setAllTags(allTagsData);
      setDocuments(documentsData);
      setComments(commentsData);
    } catch (err) {
      const code = err instanceof ApiError ? (err.details as { code?: string } | undefined)?.code : undefined;
      if (code === 'TOTP_SETUP_REQUIRED' || code === 'TOTP_STEP_UP_REQUIRED') {
        setTotpGate({ code, message: (err as ApiError).message });
      } else {
        setError(err instanceof ApiError ? err.message : 'Unable to load the case');
      }
    } finally {
      setLoading(false);
    }
  }

  // Called from the two-factor step-up form below: proves control of the
  // second factor, swaps in the freshly-issued (totpVerifiedAt-bearing) JWT,
  // then retries the load that the case's highly-sensitive gate rejected.
  async function handleStepUpSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStepUpSubmitting(true);
    setStepUpError(null);
    try {
      const { token } = await api.post<{ token: string }>('/auth/2fa/step-up', { code: stepUpCode.trim() });
      await loginWithToken(token);
      setTotpGate(null);
      setStepUpCode('');
      await loadAll();
    } catch (err) {
      setStepUpError(err instanceof ApiError ? err.message : 'Invalid verification code');
    } finally {
      setStepUpSubmitting(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  async function handleUpdateCase(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const title = String(form.get('title') ?? '').trim();
    const description = String(form.get('description') ?? '').trim();
    const editorialContext = String(form.get('editorialContext') ?? '').trim();
    const status = String(form.get('status') ?? '') as CaseStatus;
    const sensitivity = String(form.get('sensitivity') ?? '') as Sensitivity;
    const dueDate = String(form.get('dueDate') ?? '').trim();
    const publishedAt = String(form.get('publishedAt') ?? '').trim();

    if (!title) return;

    setCaseEditError(null);
    try {
      const updated = await api.put<CaseSummary>(`/cases/${caseId}`, {
        title,
        description: description || undefined,
        editorialContext: editorialContext || undefined,
        status,
        sensitivity,
        dueDate: dueDate || undefined,
        publishedAt: publishedAt || undefined,
      });
      // The PUT response doesn't carry myRole (only GET /cases/:id resolves
      // it via requireCaseRole) — keep the one we already have.
      setCaseItem({ ...updated, myRole: caseItem?.myRole });
      setShowCaseEditForm(false);
    } catch (err) {
      setCaseEditError(err instanceof ApiError ? err.message : 'Unable to update the case');
    }
  }

  async function handleDeleteCase() {
    if (!window.confirm('Delete this case? This action cannot be undone by users.')) {
      return;
    }
    try {
      await api.delete(`/cases/${caseId}`);
      navigate('/cases');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to delete the case');
    }
  }

  async function handleCreateEvent(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Same gotcha as CasesListPage.handleCreate: capture the form element
    // before the first await, since React nulls event.currentTarget once
    // the synthetic event finishes dispatching.
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const type = String(form.get('type') ?? '');
    const eventDateLocal = String(form.get('eventDate') ?? '');
    const reason = String(form.get('reason') ?? '');
    const contactIds = form
      .getAll('contactIds')
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n));

    if (!type || !eventDateLocal) return;

    try {
      await api.post(`/cases/${caseId}/events`, {
        type,
        eventDate: new Date(eventDateLocal).toISOString(),
        reason: reason || undefined,
        contactIds: contactIds.length ? contactIds : undefined,
      });
      setShowForm(false);
      formEl.reset();
      loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to add the event');
    }
  }

  async function handleUpdateEvent(e: FormEvent<HTMLFormElement>, eventId: number) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const type = String(form.get('type') ?? '');
    const eventDateLocal = String(form.get('eventDate') ?? '');
    const reason = String(form.get('reason') ?? '');
    const followUpStatus = String(form.get('followUpStatus') ?? '');
    const contactIds = form
      .getAll('contactIds')
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n));

    if (!type || !eventDateLocal) return;

    try {
      await api.put(`/cases/${caseId}/events/${eventId}`, {
        type,
        eventDate: new Date(eventDateLocal).toISOString(),
        reason: reason || undefined,
        followUpStatus: followUpStatus || undefined,
        contactIds,
      });
      setEditingEventId(null);
      loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to update the event');
    }
  }

  async function handleDeleteEvent(eventId: number) {
    if (!window.confirm('Delete this event?')) return;
    try {
      await api.delete(`/cases/${caseId}/events/${eventId}`);
      setEvents((prev) => prev.filter((ev) => ev.id !== eventId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to delete the event');
    }
  }

  async function handleAddContributor(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const email = String(form.get('email') ?? '').trim();
    const role = String(form.get('role') ?? '') as CaseRole;

    if (!email || !role) return;

    setContributorError(null);
    try {
      const updated = await api.post<CaseContributor[]>(`/cases/${caseId}/contributors`, { email, role });
      setContributors(updated);
      setShowContributorForm(false);
      formEl.reset();
    } catch (err) {
      setContributorError(
        err instanceof ApiError ? err.message : 'Unable to add this contributor'
      );
    }
  }

  async function handleChangeRole(userId: number, role: CaseRole) {
    setContributorError(null);
    try {
      const updated = await api.put<CaseContributor[]>(`/cases/${caseId}/contributors/${userId}`, { role });
      setContributors(updated);
    } catch (err) {
      setContributorError(
        err instanceof ApiError ? err.message : 'Unable to change this role'
      );
      loadAll();
    }
  }

  async function handleRemoveContributor(userId: number) {
    if (!window.confirm('Remove this contributor from the case?')) return;
    setContributorError(null);
    try {
      await api.delete(`/cases/${caseId}/contributors/${userId}`);
      setContributors((prev) => prev.filter((c) => c.userId !== userId));
    } catch (err) {
      setContributorError(
        err instanceof ApiError ? err.message : 'Unable to remove this contributor'
      );
    }
  }

  async function handleLinkContact(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const contactId = Number(form.get('contactId'));
    if (!Number.isInteger(contactId) || contactId <= 0) return;

    setContactError(null);
    try {
      const updated = await api.post<LinkedContact[]>(`/cases/${caseId}/contacts`, { contactId });
      setLinkedContacts(updated);
      setShowLinkForm(false);
      formEl.reset();
    } catch (err) {
      setContactError(err instanceof ApiError ? err.message : 'Unable to link this contact');
    }
  }

  async function handleUnlinkContact(contactId: number) {
    setContactError(null);
    try {
      await api.delete(`/cases/${caseId}/contacts/${contactId}`);
      setLinkedContacts((prev) => prev.filter((c) => c.id !== contactId));
    } catch (err) {
      setContactError(err instanceof ApiError ? err.message : 'Unable to unlink this contact');
    }
  }

  async function handleLinkTag(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const tagId = Number(form.get('tagId'));
    if (!Number.isInteger(tagId) || tagId <= 0) return;

    setTagError(null);
    try {
      const updated = await api.post<CaseTag[]>(`/cases/${caseId}/tags`, { tagId });
      setCaseTags(updated);
      setShowTagLinkForm(false);
      formEl.reset();
    } catch (err) {
      setTagError(err instanceof ApiError ? err.message : 'Unable to link this tag');
    }
  }

  async function handleCreateAndLinkTag(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const name = String(form.get('name') ?? '').trim();
    const type = String(form.get('type') ?? 'tag') as TagType;
    if (!name) return;

    setTagError(null);
    try {
      const tag = await api.post<Tag>('/tags', { name, type });
      const updated = await api.post<CaseTag[]>(`/cases/${caseId}/tags`, { tagId: tag.id });
      setCaseTags(updated);
      setAllTags((prev) => (prev.some((t) => t.id === tag.id) ? prev : [...prev, tag]));
      setShowNewTagForm(false);
      formEl.reset();
    } catch (err) {
      setTagError(err instanceof ApiError ? err.message : 'Unable to create this tag');
    }
  }

  async function handleUnlinkTag(tagId: number) {
    setTagError(null);
    try {
      await api.delete(`/cases/${caseId}/tags/${tagId}`);
      setCaseTags((prev) => prev.filter((t) => t.id !== tagId));
    } catch (err) {
      setTagError(err instanceof ApiError ? err.message : 'Unable to unlink this tag');
    }
  }

  async function handleUploadDocument(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const fileInput = formEl.elements.namedItem('file') as HTMLInputElement | null;
    const file = fileInput?.files?.[0];
    if (!file) return;

    const form = new FormData(formEl);
    // FormData already picked up the file under "file"; just carry the
    // rest of the fields through as-is (fileType, sourceDescription, ...).

    setDocumentError(null);
    setUploading(true);
    try {
      const created = await api.post<CaseDocument>(`/cases/${caseId}/documents`, form);
      setDocuments((prev) => [created, ...prev]);
      setShowUploadForm(false);
      formEl.reset();
    } catch (err) {
      setDocumentError(err instanceof ApiError ? err.message : 'Unable to upload this file');
    } finally {
      setUploading(false);
    }
  }

  async function handleDownloadDocument(documentId: number, fileName: string) {
    setDocumentError(null);
    try {
      const { blob, filename } = await requestBlob(`/cases/${caseId}/documents/${documentId}/download`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDocumentError(err instanceof ApiError ? err.message : 'Unable to download this file');
    }
  }

  async function handleDownloadAuditLog() {
    setError(null);
    try {
      const { blob, filename } = await requestBlob(`/cases/${caseId}/audit-log/export`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || `case-${caseId}-audit-log.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to export the activity log');
    }
  }

  async function handleDownloadReport(redacted: boolean) {
    setReportError(null);
    try {
      const { blob, filename } = await requestBlob(
        `/cases/${caseId}/report${redacted ? '?redacted=true' : ''}`
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || `case-${caseId}-report${redacted ? '-redacted' : ''}.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setReportError(err instanceof ApiError ? err.message : 'Unable to generate this report');
    }
  }

  async function handleDeleteDocument(documentId: number) {
    if (!window.confirm('Delete this document?')) return;
    setDocumentError(null);
    try {
      await api.delete(`/cases/${caseId}/documents/${documentId}`);
      setDocuments((prev) => prev.filter((d) => d.id !== documentId));
    } catch (err) {
      setDocumentError(err instanceof ApiError ? err.message : 'Unable to delete this document');
    }
  }

  async function handlePostComment(e: FormEvent<HTMLFormElement>, parentCommentId?: number) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const body = String(form.get('body') ?? '').trim();
    const visibility = String(form.get('visibility') ?? 'shared') as CommentVisibility;
    const mentionContactIds = form
      .getAll('mentionContactIds')
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n));
    const mentionEventIds = form
      .getAll('mentionEventIds')
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n));

    if (!body) return;

    setCommentError(null);
    try {
      const updated = await api.post<Comment[]>(`/cases/${caseId}/comments`, {
        body,
        visibility,
        parentCommentId,
        mentions:
          mentionContactIds.length || mentionEventIds.length
            ? { contactIds: mentionContactIds, eventIds: mentionEventIds }
            : undefined,
      });
      setComments(updated);
      setReplyingToId(null);
      formEl.reset();
    } catch (err) {
      setCommentError(err instanceof ApiError ? err.message : 'Unable to post this comment');
    }
  }

  async function handleUpdateComment(e: FormEvent<HTMLFormElement>, commentId: number) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const body = String(form.get('body') ?? '').trim();
    if (!body) return;

    setCommentError(null);
    try {
      const updated = await api.put<Comment[]>(`/cases/${caseId}/comments/${commentId}`, { body });
      setComments(updated);
      setEditingCommentId(null);
    } catch (err) {
      setCommentError(err instanceof ApiError ? err.message : 'Unable to update this comment');
    }
  }

  async function handleDeleteComment(commentId: number) {
    if (!window.confirm('Delete this comment?')) return;
    setCommentError(null);
    try {
      await api.delete(`/cases/${caseId}/comments/${commentId}`);
      const updated = await api.get<Comment[]>(`/cases/${caseId}/comments`);
      setComments(updated);
    } catch (err) {
      setCommentError(err instanceof ApiError ? err.message : 'Unable to delete this comment');
    }
  }

  if (loading) {
    return (
      <AppShell activeNav="cases" activeRail="cases">
        <p>Loading...</p>
      </AppShell>
    );
  }

  if (totpGate) {
    return (
      <AppShell activeNav="cases" activeRail="cases">
        <header className="page-header">
          <div>
            <h1>Two-factor authentication required</h1>
            <Link to="/cases" className="back-link">
              &larr; My cases
            </Link>
          </div>
        </header>
        <div className="totp-gate">
          <p>{totpGate.message}</p>
          {totpGate.code === 'TOTP_SETUP_REQUIRED' ? (
            <Link to="/security" className="btn-primary">
              Set up two-factor authentication
            </Link>
          ) : (
            <form className="inline-form totp-gate-form" onSubmit={handleStepUpSubmit}>
              <input
                value={stepUpCode}
                onChange={(e) => setStepUpCode(e.target.value)}
                placeholder="6-digit code or recovery code"
                autoFocus
                required
              />
              <button type="submit" className="btn-primary" disabled={stepUpSubmitting}>
                {stepUpSubmitting ? 'Verifying...' : 'Verify'}
              </button>
            </form>
          )}
          {stepUpError && <p className="form-error">{stepUpError}</p>}
        </div>
      </AppShell>
    );
  }

  if (!caseItem) {
    return (
      <AppShell activeNav="cases" activeRail="cases">
        <p>Case not found.</p>
      </AppShell>
    );
  }

  const isLead = caseItem.myRole === 'lead';
  const canEditCase = caseItem.myRole === 'lead' || caseItem.myRole === 'collaborator';
  const linkableContacts = allContacts.filter((c) => !linkedContacts.some((lc) => lc.id === c.id));
  const linkableTags = allTags.filter((t) => !caseTags.some((ct) => ct.id === t.id));
  const canComment = caseItem.myRole !== 'read_only' && caseItem.myRole !== undefined;
  const topLevelComments = comments.filter((c) => c.parentCommentId === null);
  const repliesByParent = new Map<number, Comment[]>();
  comments.forEach((c) => {
    if (c.parentCommentId !== null) {
      const list = repliesByParent.get(c.parentCommentId) ?? [];
      list.push(c);
      repliesByParent.set(c.parentCommentId, list);
    }
  });

  function describeMentions(mentions: Comment['mentions']): string[] {
    if (!mentions) return [];
    const parts: string[] = [];
    (mentions.contactIds ?? []).forEach((id) => {
      const c = linkedContacts.find((lc) => lc.id === id) ?? allContacts.find((ac) => ac.id === id);
      if (c) parts.push(`@${c.fullName}`);
    });
    (mentions.eventIds ?? []).forEach((id) => {
      const ev = events.find((e) => e.id === id);
      if (ev) parts.push(`#${EVENT_TYPE_LABELS[ev.type]} (${new Date(ev.eventDate).toLocaleDateString('en-US')})`);
    });
    return parts;
  }

  function renderCommentItem(c: Comment) {
    const isAuthor = user?.id === c.authorId;
    const isEditing = editingCommentId === c.id;
    const mentionChips = describeMentions(c.mentions);
    const replies = repliesByParent.get(c.id) ?? [];

    return (
      <li key={c.id} className="comment-item">
        {isEditing ? (
          <form className="inline-form" onSubmit={(e) => handleUpdateComment(e, c.id)}>
            <textarea name="body" defaultValue={c.body} required />
            <div className="contact-edit-actions">
              <button type="submit" className="btn-primary">
                Save
              </button>
              <button type="button" className="btn-secondary" onClick={() => setEditingCommentId(null)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="comment-meta">
              <strong>{c.authorName}</strong>
              <span className="audit-log-date">{new Date(c.createdAt).toLocaleString('en-US')}</span>
              {c.visibility === 'private' && <span className="badge">Private</span>}
            </div>
            <p className="comment-body">{c.body}</p>
            {mentionChips.length > 0 && <p className="contributor-email">{mentionChips.join(' · ')}</p>}
            <div className="contributor-actions">
              {canComment && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setReplyingToId(replyingToId === c.id ? null : c.id)}
                >
                  {replyingToId === c.id ? 'Cancel' : 'Reply'}
                </button>
              )}
              {isAuthor && (
                <button type="button" className="btn-secondary" onClick={() => setEditingCommentId(c.id)}>
                  Edit
                </button>
              )}
              {(isAuthor || isLead) && (
                <button type="button" className="btn-danger-small" onClick={() => handleDeleteComment(c.id)}>
                  Delete
                </button>
              )}
            </div>
          </>
        )}

        {replyingToId === c.id && (
          <form className="inline-form comment-reply-form" onSubmit={(e) => handlePostComment(e, c.id)}>
            <textarea name="body" placeholder="Write a reply..." required />
            <select name="visibility" defaultValue="shared">
              <option value="shared">Shared</option>
              <option value="private">Private</option>
            </select>
            <button type="submit" className="btn-primary">
              Reply
            </button>
          </form>
        )}

        {replies.length > 0 && <ul className="comment-replies">{replies.map((r) => renderCommentItem(r))}</ul>}
      </li>
    );
  }

  return (
    <AppShell activeNav="cases" activeRail="cases">
      <Link to="/cases" className="back-link">
        &larr; All cases
      </Link>

      <header className="page-header">
        <div>
          <h1>{caseItem.title}</h1>
          <div className="case-card-badges">
            <StatusBadge status={caseItem.status} />
            <SensitivityBadge sensitivity={caseItem.sensitivity} />
          </div>
        </div>
        <div className="page-header-actions">
          {/* Search / Portfolio / Security dropped here — the shared
              AppShell rail + top nav already link to those. Graph/Map/
              Calendar stay because they're scoped to this one case
              (?caseId=...), which the generic rail icons don't offer. */}
          <Link to={`/graph?caseId=${caseItem.id}`} className="btn-secondary">Graph</Link>
          <Link to={`/map?caseId=${caseItem.id}`} className="btn-secondary">Map</Link>
          <Link to={`/calendar?caseId=${caseItem.id}`} className="btn-secondary">Calendar</Link>
          <button onClick={() => handleDownloadReport(true)} className="btn-secondary">
            Report (redacted)
          </button>
          {!(caseItem.sensitivity === 'highly_sensitive' && !isLead) && (
            <button onClick={() => handleDownloadReport(false)} className="btn-secondary">
              Report (full)
            </button>
          )}
          {canEditCase && (
            <>
              <button onClick={() => setShowCaseEditForm((v) => !v)} className="btn-secondary">
                {showCaseEditForm ? 'Cancel' : 'Edit case'}
              </button>
              {isLead && (
                <button onClick={handleDeleteCase} className="btn-danger-small">
                  Delete case
                </button>
              )}
            </>
          )}
        </div>
      </header>

      {reportError && <p className="form-error">{reportError}</p>}

      <PresenceBar users={presenceUsers} />

      {canEditCase && showCaseEditForm && (
        <form className="inline-form contact-form" onSubmit={handleUpdateCase}>
          <input name="title" placeholder="Title" required defaultValue={caseItem.title} />
          <select name="status" defaultValue={caseItem.status}>
            {Object.entries(CASE_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select name="sensitivity" defaultValue={caseItem.sensitivity}>
            {Object.entries(SENSITIVITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input name="dueDate" type="date" defaultValue={caseItem.dueDate ?? ''} />
          <input name="publishedAt" type="date" defaultValue={caseItem.publishedAt ?? ''} />
          <textarea
            name="editorialContext"
            placeholder="Editorial context"
            defaultValue={caseItem.editorialContext ?? ''}
          />
          <textarea name="description" placeholder="Description" defaultValue={caseItem.description ?? ''} />
          <button type="submit" className="btn-primary">
            Save
          </button>
        </form>
      )}

      {caseEditError && <p className="form-error">{caseEditError}</p>}

      {caseItem.description && !showCaseEditForm && <p>{caseItem.description}</p>}

      <div className="tag-badges">
        {caseTags.map((t) => (
          <span key={t.id} className={`badge badge-tag-${t.type}`}>
            {t.name}
            {canEditCase && (
              <button
                type="button"
                className="tag-remove"
                aria-label={`Unlink tag ${t.name}`}
                onClick={() => handleUnlinkTag(t.id)}
              >
                &times;
              </button>
            )}
          </span>
        ))}
        {canEditCase && (
          <>
            <button type="button" className="btn-secondary btn-tiny" onClick={() => setShowTagLinkForm((v) => !v)}>
              {showTagLinkForm ? 'Cancel' : '+ Tag'}
            </button>
            <button type="button" className="btn-secondary btn-tiny" onClick={() => setShowNewTagForm((v) => !v)}>
              {showNewTagForm ? 'Cancel' : '+ New tag'}
            </button>
          </>
        )}
      </div>

      {canEditCase && showTagLinkForm && (
        <form className="inline-form" onSubmit={handleLinkTag}>
          <select name="tagId" required defaultValue="">
            <option value="" disabled>
              Choose an existing tag/theme
            </option>
            {linkableTags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.type})
              </option>
            ))}
          </select>
          <button type="submit" className="btn-primary">
            Link
          </button>
        </form>
      )}

      {canEditCase && showNewTagForm && (
        <form className="inline-form" onSubmit={handleCreateAndLinkTag}>
          <input name="name" placeholder="Tag or theme name" required />
          <select name="type" defaultValue="tag">
            <option value="tag">Tag</option>
            <option value="theme">Theme</option>
          </select>
          <button type="submit" className="btn-primary">
            Create &amp; link
          </button>
        </form>
      )}

      {tagError && <p className="form-error">{tagError}</p>}

      <div className="page-toolbar">
        <h2>Timeline</h2>
        {canEditCase && (
          <button onClick={() => setShowForm((v) => !v)} className="btn-primary">
            {showForm ? 'Cancel' : '+ Add event'}
          </button>
        )}
      </div>

      {showForm && (
        <form className="inline-form" onSubmit={handleCreateEvent}>
          <select name="type" required defaultValue="">
            <option value="" disabled>
              Event type
            </option>
            {Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input type="datetime-local" name="eventDate" required />
          <input name="reason" placeholder="Reason / context" />
          {linkedContacts.length > 0 && (
            <select name="contactIds" multiple size={Math.min(4, linkedContacts.length)}>
              {linkedContacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName}
                </option>
              ))}
            </select>
          )}
          <button type="submit" className="btn-primary">
            Add
          </button>
        </form>
      )}

      {error && <p className="form-error">{error}</p>}

      {events.length === 0 ? (
        <p className="empty-state">No events yet.</p>
      ) : (
        <ul className="timeline">
          {events.map((ev) =>
            editingEventId === ev.id ? (
              <li key={ev.id} className="timeline-item" data-event-type={ev.type}>
                <form className="inline-form contact-form" onSubmit={(e) => handleUpdateEvent(e, ev.id)}>
                  <select name="type" required defaultValue={ev.type}>
                    {Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="datetime-local"
                    name="eventDate"
                    required
                    defaultValue={toDatetimeLocalValue(ev.eventDate)}
                  />
                  <select name="followUpStatus" defaultValue={ev.followUpStatus}>
                    {Object.entries(FOLLOW_UP_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <textarea name="reason" placeholder="Reason / context" defaultValue={ev.reason ?? ''} />
                  {linkedContacts.length > 0 && (
                    <select
                      name="contactIds"
                      multiple
                      size={Math.min(4, linkedContacts.length)}
                      defaultValue={ev.contactIds.map(String)}
                    >
                      {linkedContacts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.fullName}
                        </option>
                      ))}
                    </select>
                  )}
                  <div className="contact-edit-actions">
                    <button type="submit" className="btn-primary">
                      Save
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => setEditingEventId(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              </li>
            ) : (
              <li key={ev.id} className="timeline-item" data-event-type={ev.type}>
                <div className="timeline-date">{new Date(ev.eventDate).toLocaleString('en-US')}</div>
                <div className="timeline-content">
                  <strong>{EVENT_TYPE_LABELS[ev.type]}</strong>
                  {ev.location && <span className="timeline-location"> · {ev.location}</span>}
                  <span className="badge">{FOLLOW_UP_LABELS[ev.followUpStatus]}</span>
                  {ev.reason && <p>{ev.reason}</p>}
                  {ev.contactIds.length > 0 && (
                    <p className="timeline-location">
                      Contacts:{' '}
                      {ev.contactIds
                        .map((id) => linkedContacts.find((c) => c.id === id)?.fullName ?? `#${id}`)
                        .join(', ')}
                    </p>
                  )}
                  {canEditCase && (
                    <div className="contributor-actions">
                      <button type="button" className="btn-secondary" onClick={() => setEditingEventId(ev.id)}>
                        Edit
                      </button>
                      {isLead && (
                        <button
                          type="button"
                          className="btn-danger-small"
                          onClick={() => handleDeleteEvent(ev.id)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            )
          )}
        </ul>
      )}

      <div className="page-toolbar">
        <h2>Linked contacts</h2>
        {canEditCase && (
          <button onClick={() => setShowLinkForm((v) => !v)} className="btn-secondary">
            {showLinkForm ? 'Cancel' : '+ Link a contact'}
          </button>
        )}
      </div>

      {canEditCase && showLinkForm && (
        <form className="inline-form" onSubmit={handleLinkContact}>
          <select name="contactId" required defaultValue="">
            <option value="" disabled>
              Choose a contact
            </option>
            {linkableContacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fullName}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-primary">
            Link
          </button>
          {linkableContacts.length === 0 && (
            <span className="contributor-email">
              All existing contacts are already linked. <Link to="/contacts">Create a new contact</Link>.
            </span>
          )}
        </form>
      )}

      {contactError && <p className="form-error">{contactError}</p>}

      {linkedContacts.length === 0 ? (
        <p className="empty-state">No contacts linked to this case.</p>
      ) : (
        <ul className="contributor-list">
          {linkedContacts.map((c) => (
            <li key={c.id} className="contributor-row">
              <div className="contributor-identity">
                <strong>{c.fullName}</strong>
                {(c.roleOrTitle || c.organization) && (
                  <span className="contributor-email">
                    {[c.roleOrTitle, c.organization].filter(Boolean).join(' · ')}
                  </span>
                )}
              </div>
              <ContactSensitivityBadge sensitivity={c.sensitivity} />
              {canEditCase && (
                <button
                  type="button"
                  className="btn-danger-small"
                  onClick={() => handleUnlinkContact(c.id)}
                >
                  Unlink
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="page-toolbar">
        <h2>Documents</h2>
        {canEditCase && (
          <button onClick={() => setShowUploadForm((v) => !v)} className="btn-secondary">
            {showUploadForm ? 'Cancel' : '+ Upload document'}
          </button>
        )}
      </div>

      {canEditCase && showUploadForm && (
        <form className="inline-form contact-form" onSubmit={handleUploadDocument}>
          <input name="file" type="file" required />
          <select name="fileType" defaultValue="other">
            {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select name="sensitivity" defaultValue="">
            <option value="">Sensitivity (defaults to case's)</option>
            <option value="public">Public</option>
            <option value="internal">Internal</option>
            <option value="confidential">Confidential</option>
            <option value="highly_sensitive">Highly sensitive</option>
          </select>
          <input name="sourceDescription" placeholder="Source (optional)" />
          <input name="extractedDate" type="date" />
          <button type="submit" className="btn-primary" disabled={uploading}>
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </form>
      )}

      {documentError && <p className="form-error">{documentError}</p>}

      {documents.length === 0 ? (
        <p className="empty-state">No documents yet.</p>
      ) : (
        <ul className="contributor-list">
          {documents.map((d) => (
            <li key={d.id} className="contributor-row">
              <div className="contributor-identity">
                <strong>{d.fileName}</strong>
                <span className="contributor-email">
                  {DOCUMENT_TYPE_LABELS[d.fileType]}
                  {d.sourceDescription ? ` · ${d.sourceDescription}` : ''} ·{' '}
                  {new Date(d.uploadedAt).toLocaleDateString('en-US')}
                  {d.ocrStatus === 'pending' && ' · Indexing text…'}
                  {d.ocrStatus === 'done' && ' · 🔍 Searchable by content'}
                  {d.ocrStatus === 'failed' && ' · Text extraction failed'}
                </span>
              </div>
              <div className="contributor-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => handleDownloadDocument(d.id, d.fileName)}
                >
                  Download
                </button>
                {isLead && (
                  <button
                    type="button"
                    className="btn-danger-small"
                    onClick={() => handleDeleteDocument(d.id)}
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="page-toolbar">
        <h2>Comments</h2>
      </div>

      {canComment && (
        <form className="inline-form contact-form" onSubmit={(e) => handlePostComment(e)}>
          <textarea name="body" placeholder="Write a comment..." required />
          <select name="visibility" defaultValue="shared">
            <option value="shared">Shared with the case</option>
            <option value="private">Private (only me)</option>
          </select>
          {linkedContacts.length > 0 && (
            <select name="mentionContactIds" multiple size={Math.min(3, linkedContacts.length)}>
              {linkedContacts.map((c) => (
                <option key={c.id} value={c.id}>
                  Mention: {c.fullName}
                </option>
              ))}
            </select>
          )}
          {events.length > 0 && (
            <select name="mentionEventIds" multiple size={Math.min(3, events.length)}>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  Mention: {EVENT_TYPE_LABELS[ev.type]} ({new Date(ev.eventDate).toLocaleDateString('en-US')})
                </option>
              ))}
            </select>
          )}
          <button type="submit" className="btn-primary">
            Post
          </button>
        </form>
      )}

      {commentError && <p className="form-error">{commentError}</p>}

      {topLevelComments.length === 0 ? (
        <p className="empty-state">No comments yet.</p>
      ) : (
        <ul className="comment-thread">{topLevelComments.map((c) => renderCommentItem(c))}</ul>
      )}

      <div className="page-toolbar">
        <h2>Contributors</h2>
        {isLead && (
          <button onClick={() => setShowContributorForm((v) => !v)} className="btn-secondary">
            {showContributorForm ? 'Cancel' : '+ Add contributor'}
          </button>
        )}
      </div>

      {isLead && showContributorForm && (
        <form className="inline-form" onSubmit={handleAddContributor}>
          <input name="email" type="email" required placeholder="Contributor's @mfwa.org email" />
          <select name="role" required defaultValue="collaborator">
            {Object.entries(ROLE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-primary">
            Add
          </button>
        </form>
      )}

      {contributorError && <p className="form-error">{contributorError}</p>}

      {contributors.length === 0 ? (
        <p className="empty-state">No contributors.</p>
      ) : (
        <ul className="contributor-list">
          {contributors.map((c) => (
            <li key={c.userId} className="contributor-row">
              <div className="contributor-identity">
                <strong>{c.fullName}</strong>
                <span className="contributor-email">{c.email}</span>
              </div>
              {isLead ? (
                <div className="contributor-actions">
                  <select
                    value={c.role}
                    onChange={(e) => handleChangeRole(c.userId, e.target.value as CaseRole)}
                  >
                    {Object.entries(ROLE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn-danger-small"
                    onClick={() => handleRemoveContributor(c.userId)}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <span className="badge">{ROLE_LABELS[c.role]}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="page-toolbar">
        <h2>Activity log</h2>
        {(caseItem.sensitivity !== 'highly_sensitive' || isLead) && (
          <button onClick={handleDownloadAuditLog} className="btn-secondary">
            Export CSV
          </button>
        )}
      </div>

      {caseItem.sensitivity === 'highly_sensitive' && !isLead ? (
        <p className="empty-state">
          This case is marked highly sensitive — its activity log is visible to the lead only.
        </p>
      ) : auditLog.length === 0 ? (
        <p className="empty-state">No activity recorded yet.</p>
      ) : (
        <ul className="audit-log-list">
          {auditLog.map((entry) => {
            const hasDiff = entry.before != null || entry.after != null;
            const expanded = expandedEntryId === entry.id;
            return (
              <li key={entry.id} className="audit-log-row">
                <div
                  className={`audit-log-summary${hasDiff ? ' audit-log-summary-clickable' : ''}`}
                  onClick={hasDiff ? () => setExpandedEntryId(expanded ? null : entry.id) : undefined}
                >
                  <span className="audit-log-date">{new Date(entry.createdAt).toLocaleString('en-US')}</span>
                  <span>
                    <strong>{entry.actorName ?? 'Unknown user'}</strong> {AUDIT_ACTION_LABELS[entry.action]}{' '}
                    {entry.resourceType} #{entry.resourceId}
                  </span>
                  {hasDiff && <span className="audit-log-toggle">{expanded ? 'Hide details' : 'Details'}</span>}
                </div>
                {expanded && hasDiff && (
                  <pre className="audit-log-diff">
                    {JSON.stringify({ before: entry.before, after: entry.after }, null, 2)}
                  </pre>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
