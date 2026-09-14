import { RowDataPacket } from 'mysql2';
import { pool } from '../../config/db';
import { EventType } from '../events/events.types';
import { Sensitivity } from '../cases/cases.types';

// Geolocation map (Phase 4 of the roadmap). Built entirely from
// investigation_events.location_lat/location_lng, which the events module
// already collects on every event form — no new column, no new table.
//
// Same cross-case access model as search/graph: every row comes only from
// a case the viewer actually contributes to (resolveAccessibleCaseIds is
// deliberately duplicated from graph.service.ts rather than shared, so
// each module's access query stays simple and self-contained). Cross-case
// by default, or scoped to one case via ?caseId= — a case the viewer isn't
// on simply yields an empty list rather than a 403, same behavior as the
// graph and search endpoints.

export interface GeoFilters {
  caseId?: number;
}

export interface GeoEvent {
  id: number;
  caseId: number;
  caseTitle: string;
  sensitivity: Sensitivity;
  type: EventType;
  eventDate: string;
  // location (the free-text label) and the lat/lng pair are independent
  // columns on investigation_events — an event can have coordinates
  // without a text label, so this stays nullable even though lat/lng
  // below are guaranteed set by the WHERE clause.
  location: string | null;
  lat: number;
  lng: number;
  reason: string | null;
}

interface GeoEventRow extends RowDataPacket {
  id: number;
  case_id: number;
  case_title: string;
  case_sensitivity: Sensitivity;
  type: EventType;
  event_date: string;
  location: string | null;
  location_lat: string;
  location_lng: string;
  reason: string | null;
}

async function resolveAccessibleCaseIds(viewerId: number, filters: GeoFilters): Promise<number[]> {
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

export async function listGeolocatedEvents(viewerId: number, filters: GeoFilters = {}): Promise<GeoEvent[]> {
  const caseIds = await resolveAccessibleCaseIds(viewerId, filters);
  if (caseIds.length === 0) return [];

  const [rows] = await pool.query<GeoEventRow[]>(
    `SELECT ev.id, ev.case_id, c.title AS case_title, c.sensitivity AS case_sensitivity,
            ev.type, ev.event_date, ev.location, ev.location_lat, ev.location_lng, ev.reason
     FROM investigation_events ev
     JOIN cases c ON c.id = ev.case_id AND c.deleted_at IS NULL
     WHERE ev.case_id IN (:caseIds)
       AND ev.location_lat IS NOT NULL
       AND ev.location_lng IS NOT NULL
     ORDER BY ev.event_date DESC`,
    { caseIds }
  );

  return rows.map((row) => ({
    id: row.id,
    caseId: row.case_id,
    caseTitle: row.case_title,
    sensitivity: row.case_sensitivity,
    type: row.type,
    eventDate: row.event_date,
    location: row.location,
    lat: Number(row.location_lat),
    lng: Number(row.location_lng),
    reason: row.reason,
  }));
}
