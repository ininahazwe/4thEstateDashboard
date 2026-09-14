import { RowDataPacket } from 'mysql2';
import { pool } from '../../config/db';
import { EventType, FollowUpStatus } from '../events/events.types';
import { CaseStatus, Sensitivity } from '../cases/cases.types';

// Calendar / agenda (Phase 4, brief §4.3) — month/week view of
// investigation_events (scheduled/logged actions) and case due dates. Both
// are data already tracked since Phase 1 (event_date, due_date); this is
// purely a read view, no new table.
//
// Scope decision made with Yv: the view only for this first version — no
// iCal export, no reminders (a "deadline_approaching" reminder needs a
// scheduled job, which doesn't exist yet — see notifications module and
// claude/etat-avancement.md). "Jalons éditoriaux" (brief §2.1, per editorial
// project) aren't included either since editorial_projects itself hasn't
// been built — a case's own due_date is the closest equivalent available
// today.
//
// Same cross-case access model as geo/graph/search: every case/event shown
// here is one the viewer already contributes to.

export interface CalendarFilters {
  caseId?: number;
}

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

interface CalendarEventRow extends RowDataPacket {
  id: number;
  case_id: number;
  case_title: string;
  case_sensitivity: Sensitivity;
  type: EventType;
  event_date: string;
  location: string | null;
  reason: string | null;
  follow_up_status: FollowUpStatus;
}

interface CalendarDueDateRow extends RowDataPacket {
  id: number;
  title: string;
  sensitivity: Sensitivity;
  status: CaseStatus;
  due_date: string;
}

async function resolveAccessibleCaseIds(viewerId: number, filters: CalendarFilters): Promise<number[]> {
  if (filters.caseId) {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT case_id FROM case_contributors WHERE case_id = :caseId AND user_id = :viewerId',
      { caseId: filters.caseId, viewerId }
    );
    return rows.length ? [filters.caseId] : [];
  }

  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT DISTINCT case_id FROM case_contributors WHERE user_id = :viewerId',
    { viewerId }
  );
  return rows.map((r) => r.case_id as number);
}

export async function getCalendarData(viewerId: number, filters: CalendarFilters = {}): Promise<CalendarData> {
  const caseIds = await resolveAccessibleCaseIds(viewerId, filters);
  if (caseIds.length === 0) return { events: [], dueDates: [] };

  const [eventRows] = await pool.query<CalendarEventRow[]>(
    `SELECT ev.id, ev.case_id, c.title AS case_title, c.sensitivity AS case_sensitivity,
            ev.type, ev.event_date, ev.location, ev.reason, ev.follow_up_status
     FROM investigation_events ev
     JOIN cases c ON c.id = ev.case_id AND c.deleted_at IS NULL
     WHERE ev.case_id IN (:caseIds)`,
    { caseIds }
  );

  const [dueDateRows] = await pool.query<CalendarDueDateRow[]>(
    `SELECT id, title, sensitivity, status, due_date
     FROM cases
     WHERE id IN (:caseIds) AND deleted_at IS NULL AND due_date IS NOT NULL`,
    { caseIds }
  );

  return {
    events: eventRows.map((row) => ({
      id: row.id,
      caseId: row.case_id,
      caseTitle: row.case_title,
      sensitivity: row.case_sensitivity,
      type: row.type,
      eventDate: row.event_date,
      location: row.location,
      reason: row.reason,
      followUpStatus: row.follow_up_status,
    })),
    dueDates: dueDateRows.map((row) => ({
      caseId: row.id,
      caseTitle: row.title,
      sensitivity: row.sensitivity,
      status: row.status,
      dueDate: row.due_date,
    })),
  };
}
