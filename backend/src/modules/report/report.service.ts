import { RowDataPacket } from 'mysql2';
import { pool } from '../../config/db';
import { AppError } from '../../utils/AppError';
import { CaseRole } from '../../middleware/auth';
import { getCaseById } from '../cases/cases.service';
import { listEventsForCase } from '../events/events.service';
import { listCaseContacts } from '../cases/caseContacts.service';
import { listCaseTags } from '../cases/caseTags.service';
import { EventType, FollowUpStatus } from '../events/events.types';
import { CaseStatus, Sensitivity } from '../cases/cases.types';

// Auto-generated investigation report (brief §4.2) — Markdown only for
// this first version (decision made with Yv: same "simple first" logic as
// search/presence/documents; a PDF renderer is a separate dependency and
// npm install for later if the need shows up). Built entirely from data
// already tracked on the case: the timeline, the linked contacts, the
// key-discovery events, and its tags — nothing new to maintain.
//
// The brief also asks for sensitivity to be maskable for handoff to an
// editor for fact-checking. `redacted` does that: contacts marked
// `protected_witness`/`at_risk_source` are replaced with a generic label
// and stripped of identifying details, and any event whose effective
// sensitivity (its own override, or the case's) is `highly_sensitive` has
// its content replaced with a placeholder. The full (non-redacted) report
// on a `highly_sensitive` case is further restricted to the case lead —
// same rule as the audit log (see caseAuditLog.service.ts) — since it's an
// explicit export a viewer could save or forward, not just an on-screen
// list.

const STATUS_LABELS: Record<CaseStatus, string> = {
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

export interface ReportOptions {
  redacted?: boolean;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString().slice(0, 10);
}

// findingsSummary is stored as free-form JSON (brief: "bullet points ou
// notes structurées") — there's no form field wired up to populate it yet
// (see backend/README.md), so this just renders whatever shape shows up
// rather than assuming one.
function renderFindings(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    return value.map((item) => `  - ${typeof item === 'string' ? item : JSON.stringify(item)}`).join('\n');
  }
  return `  \`${JSON.stringify(value)}\``;
}

export async function generateCaseReport(
  caseId: number,
  viewerId: number,
  viewerRole: CaseRole,
  options: ReportOptions = {}
): Promise<string> {
  const redacted = options.redacted ?? false;
  const caseItem = await getCaseById(caseId, viewerId);

  if (caseItem.sensitivity === 'highly_sensitive' && !redacted && viewerRole !== 'lead') {
    throw new AppError(
      403,
      'Only the case lead can generate the full report for a highly sensitive case — use the redacted version instead.'
    );
  }

  const [events, contacts, tags] = await Promise.all([
    listEventsForCase(caseId),
    listCaseContacts(caseId),
    listCaseTags(caseId),
  ]);

  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime()
  );
  const discoveries = sortedEvents.filter((e) => e.type === 'key_discovery');

  const lines: string[] = [];
  lines.push(`# Investigation report — ${caseItem.title}`);
  lines.push('');
  lines.push(
    `_Generated ${formatDate(new Date().toISOString())} · ${
      redacted ? 'Redacted version (for editorial fact-check handoff)' : 'Full version'
    }_`
  );
  lines.push('');
  lines.push(`**Status:** ${STATUS_LABELS[caseItem.status]}`);
  lines.push(`**Sensitivity:** ${SENSITIVITY_LABELS[caseItem.sensitivity]}`);
  lines.push(`**Editorial context:** ${caseItem.editorialContext?.trim() || '—'}`);
  lines.push(`**Due date:** ${formatDate(caseItem.dueDate)}`);
  lines.push(`**Published:** ${formatDate(caseItem.publishedAt)}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(caseItem.description?.trim() || '_No description provided._');
  lines.push('');

  lines.push('## Key discoveries');
  lines.push('');
  if (discoveries.length === 0) {
    lines.push('_No key discoveries recorded yet._');
  } else {
    for (const ev of discoveries) {
      const effectiveSensitivity = (ev.sensitivity as Sensitivity | null) ?? caseItem.sensitivity;
      if (redacted && effectiveSensitivity === 'highly_sensitive') {
        lines.push(`- **${formatDate(ev.eventDate)}** — _[Details redacted — highly sensitive]_`);
        continue;
      }
      lines.push(`- **${formatDate(ev.eventDate)}** — ${ev.reason?.trim() || 'Untitled discovery'}`);
      const findings = renderFindings(ev.findingsSummary);
      if (findings) lines.push(findings);
    }
  }
  lines.push('');

  lines.push('## Timeline');
  lines.push('');
  if (sortedEvents.length === 0) {
    lines.push('_No events recorded yet._');
  } else {
    for (const ev of sortedEvents) {
      const effectiveSensitivity = (ev.sensitivity as Sensitivity | null) ?? caseItem.sensitivity;
      if (redacted && effectiveSensitivity === 'highly_sensitive') {
        lines.push(`- **${formatDate(ev.eventDate)}** — ${EVENT_TYPE_LABELS[ev.type]} — _[Details redacted — highly sensitive]_`);
        continue;
      }
      const locationPart = ev.location ? ` (${ev.location})` : '';
      const reasonPart = ev.reason?.trim() || '—';
      lines.push(
        `- **${formatDate(ev.eventDate)}** — ${EVENT_TYPE_LABELS[ev.type]}${locationPart} — ${reasonPart} _[${FOLLOW_UP_LABELS[ev.followUpStatus]}]_`
      );
    }
  }
  lines.push('');

  lines.push('## Key contacts');
  lines.push('');
  if (contacts.length === 0) {
    lines.push('_No contacts linked to this case yet._');
  } else {
    let protectedCount = 0;
    for (const contact of contacts) {
      const isProtected = contact.sensitivity === 'protected_witness' || contact.sensitivity === 'at_risk_source';
      if (redacted && isProtected) {
        protectedCount += 1;
        lines.push(`- **Protected source #${protectedCount}** _(identity withheld — ${contact.sensitivity.replace('_', ' ')})_`);
        continue;
      }
      const orgPart = contact.organization ? `, ${contact.organization}` : '';
      const rolePart = contact.roleOrTitle ? ` — ${contact.roleOrTitle}` : '';
      const reliabilityPart = contact.reliability ? ` (reliability ${contact.reliability}/5)` : '';
      lines.push(`- **${contact.fullName}**${orgPart}${rolePart}${reliabilityPart}`);
    }
  }
  lines.push('');

  lines.push('## Tags / themes');
  lines.push('');
  lines.push(tags.length ? tags.map((t) => t.name).join(', ') : '_None._');
  lines.push('');

  lines.push('---');
  lines.push(
    '_This report reflects only what is already tracked on this case (events, contacts, tags). Comments are not included._'
  );

  return lines.join('\n');
}
