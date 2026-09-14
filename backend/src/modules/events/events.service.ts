import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../../config/db';
import { AppError } from '../../utils/AppError';
import { recordAudit } from '../../middleware/auditLog';
import { EventType, FollowUpStatus } from './events.types';
import { Sensitivity } from '../cases/cases.types';
import { toMysqlDateTime } from '../../utils/toMysqlDateTime';

interface EventRow extends RowDataPacket {
  id: number;
  case_id: number;
  type: EventType;
  event_date: string;
  location: string | null;
  location_lat: string | null;
  location_lng: string | null;
  reason: string | null;
  findings_summary: unknown | null;
  sensitivity: Sensitivity | null;
  follow_up_status: FollowUpStatus;
  created_by: number;
  created_at: string;
  updated_at: string;
}

interface EventContactRow extends RowDataPacket {
  event_id: number;
  contact_id: number;
}

function mapEvent(row: EventRow, contactIds: number[]) {
  return {
    id: row.id,
    caseId: row.case_id,
    type: row.type,
    eventDate: row.event_date,
    location: row.location,
    // DECIMAL columns come back from mysql2 as strings; convert for the API.
    locationLat: row.location_lat !== null ? Number(row.location_lat) : null,
    locationLng: row.location_lng !== null ? Number(row.location_lng) : null,
    reason: row.reason,
    findingsSummary: row.findings_summary,
    sensitivity: row.sensitivity,
    followUpStatus: row.follow_up_status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    contactIds,
  };
}

async function getContactIds(eventId: number): Promise<number[]> {
  const [rows] = await pool.query<EventContactRow[]>(
    'SELECT contact_id FROM event_contacts WHERE event_id = :eventId',
    { eventId }
  );
  return rows.map((r) => r.contact_id);
}

async function assertCaseExists(caseId: number) {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM cases WHERE id = :caseId AND deleted_at IS NULL',
    { caseId }
  );
  if (!rows[0]) {
    throw new AppError(404, 'Case not found');
  }
}

async function setEventContacts(conn: import('mysql2/promise').PoolConnection, eventId: number, contactIds: number[]) {
  await conn.query('DELETE FROM event_contacts WHERE event_id = :eventId', { eventId });
  for (const contactId of contactIds) {
    await conn.query(
      'INSERT INTO event_contacts (event_id, contact_id) VALUES (:eventId, :contactId)',
      { eventId, contactId }
    );
  }
}

export interface EventInput {
  type: EventType;
  eventDate: string;
  location?: string;
  locationLat?: number;
  locationLng?: number;
  reason?: string;
  findingsSummary?: unknown;
  sensitivity?: Sensitivity;
  followUpStatus?: FollowUpStatus;
  contactIds?: number[];
}

export async function createEvent(caseId: number, input: EventInput, actorId: number) {
  await assertCaseExists(caseId);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query<ResultSetHeader>(
      `INSERT INTO investigation_events
        (case_id, type, event_date, location, location_lat, location_lng, reason,
         findings_summary, sensitivity, follow_up_status, created_by)
       VALUES
        (:caseId, :type, :eventDate, :location, :locationLat, :locationLng, :reason,
         :findingsSummary, :sensitivity, :followUpStatus, :createdBy)`,
      {
        caseId,
        type: input.type,
        eventDate: toMysqlDateTime(input.eventDate),
        location: input.location ?? null,
        locationLat: input.locationLat ?? null,
        locationLng: input.locationLng ?? null,
        reason: input.reason ?? null,
        findingsSummary: input.findingsSummary !== undefined ? JSON.stringify(input.findingsSummary) : null,
        sensitivity: input.sensitivity ?? null,
        followUpStatus: input.followUpStatus ?? 'to_process',
        createdBy: actorId,
      }
    );

    const eventId = result.insertId;

    if (input.contactIds?.length) {
      await setEventContacts(conn, eventId, input.contactIds);
    }

    await conn.commit();

    await recordAudit({
      actorId,
      caseId,
      action: 'create',
      resourceType: 'investigation_event',
      resourceId: eventId,
      after: input,
    });

    return getEventById(caseId, eventId);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function listEventsForCase(caseId: number) {
  await assertCaseExists(caseId);

  const [rows] = await pool.query<EventRow[]>(
    'SELECT * FROM investigation_events WHERE case_id = :caseId AND deleted_at IS NULL ORDER BY event_date DESC',
    { caseId }
  );

  if (rows.length === 0) {
    return [];
  }

  const eventIds = rows.map((r) => r.id);
  const [contactRows] = await pool.query<EventContactRow[]>(
    'SELECT event_id, contact_id FROM event_contacts WHERE event_id IN (:eventIds)',
    { eventIds }
  );

  const contactsByEvent = new Map<number, number[]>();
  for (const row of contactRows) {
    const list = contactsByEvent.get(row.event_id) ?? [];
    list.push(row.contact_id);
    contactsByEvent.set(row.event_id, list);
  }

  return rows.map((row) => mapEvent(row, contactsByEvent.get(row.id) ?? []));
}

export async function getEventById(caseId: number, eventId: number, readerId?: number) {
  const [rows] = await pool.query<EventRow[]>(
    'SELECT * FROM investigation_events WHERE id = :eventId AND case_id = :caseId AND deleted_at IS NULL',
    { eventId, caseId }
  );

  const row = rows[0];
  if (!row) {
    throw new AppError(404, 'Event not found');
  }

  if (readerId) {
    await recordAudit({
      actorId: readerId,
      caseId,
      action: 'read',
      resourceType: 'investigation_event',
      resourceId: eventId,
    });
  }

  return mapEvent(row, await getContactIds(eventId));
}

type EventUpdateInput = Partial<EventInput>;

const UPDATABLE_FIELDS: {
  key: keyof EventInput;
  column: string;
  serialize?: (value: unknown) => string;
}[] = [
  { key: 'type', column: 'type' },
  { key: 'eventDate', column: 'event_date', serialize: (v) => toMysqlDateTime(v as string) },
  { key: 'location', column: 'location' },
  { key: 'locationLat', column: 'location_lat' },
  { key: 'locationLng', column: 'location_lng' },
  { key: 'reason', column: 'reason' },
  { key: 'findingsSummary', column: 'findings_summary', serialize: (v) => JSON.stringify(v) },
  { key: 'sensitivity', column: 'sensitivity' },
  { key: 'followUpStatus', column: 'follow_up_status' },
];

export async function updateEvent(
  caseId: number,
  eventId: number,
  input: EventUpdateInput,
  actorId: number
) {
  const before = await getEventById(caseId, eventId);

  const setClauses: string[] = [];
  const params: Record<string, string | number | boolean | null> = { caseId, eventId };

  for (const { key, column, serialize } of UPDATABLE_FIELDS) {
    if (input[key] !== undefined) {
      setClauses.push(`${column} = :${key}`);
      // findingsSummary is typed unknown (free-form JSON) on EventInput,
      // which — being keyof-indexed alongside the other, concrete-typed
      // fields — collapses this whole expression's inferred type down to
      // unknown. UPDATABLE_FIELDS guarantees findingsSummary always goes
      // through serialize (-> string) and every other field is already
      // one of string/number/boolean/null, so this cast just states what
      // is already true by construction.
      params[key] = (serialize ? serialize(input[key]) : input[key]) as string | number | boolean | null;
    }
  }

  if (setClauses.length > 0) {
    await pool.query(
      `UPDATE investigation_events SET ${setClauses.join(', ')} WHERE id = :eventId AND case_id = :caseId`,
      params
    );
  }

  if (input.contactIds !== undefined) {
    const conn = await pool.getConnection();
    try {
      await setEventContacts(conn, eventId, input.contactIds);
    } finally {
      conn.release();
    }
  }

  const after = await getEventById(caseId, eventId);

  await recordAudit({
    actorId,
    caseId,
    action: 'update',
    resourceType: 'investigation_event',
    resourceId: eventId,
    before,
    after,
  });

  return after;
}

export async function deleteEvent(caseId: number, eventId: number, actorId: number) {
  const before = await getEventById(caseId, eventId);

  await pool.query(
    'UPDATE investigation_events SET deleted_at = NOW() WHERE id = :eventId AND case_id = :caseId',
    { eventId, caseId }
  );

  await recordAudit({
    actorId,
    caseId,
    action: 'delete',
    resourceType: 'investigation_event',
    resourceId: eventId,
    before,
  });
}
