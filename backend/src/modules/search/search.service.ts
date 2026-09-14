import { RowDataPacket } from 'mysql2';
import { pool } from '../../config/db';
import { EventType } from '../events/events.types';
import { Sensitivity } from '../cases/cases.types';

// Cross-case search (brief §4.1). Every subquery below is scoped to cases
// the viewer actually contributes to — this is the one place in the app
// that reaches across cases, so leaking a case the caller isn't on would
// be a real access-control bug, not just a UI glitch.

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

export interface SearchFilters {
  q: string;
  sensitivity?: Sensitivity;
  eventType?: EventType;
  contributor?: string;
  dateFrom?: string;
  dateTo?: string;
  resourceTypes?: SearchResourceType[];
}

const RESULTS_PER_TYPE = 50;
const ALL_TYPES: SearchResourceType[] = ['case', 'event', 'comment', 'document'];

// '!' is used as the LIKE escape character instead of the default
// backslash — one less layer of escaping to get right between SQL and JS
// string literals. Escaping '!' itself first means a literal '!' in the
// search term is treated as a normal character, not an escape marker.
function likeTerm(q: string): string {
  return `%${q.replace(/[!%_]/g, (c) => `!${c}`)}%`;
}

function snippet(text: string | null | undefined, max = 160): string {
  if (!text) return '';
  const flat = String(text).replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

// The index signature is what lets this satisfy mysql2's named-placeholder
// params type below — every value here is already a plain string/number,
// so it doesn't change what actually gets sent to the query.
interface QueryParams {
  term: string;
  viewerId: number;
  sensitivity?: Sensitivity;
  contributorTerm?: string;
  dateFrom?: string;
  dateTo?: string;
  eventType?: EventType;
  [key: string]: string | number | undefined;
}

function buildParams(viewerId: number, filters: SearchFilters): QueryParams {
  return {
    term: likeTerm(filters.q),
    viewerId,
    sensitivity: filters.sensitivity,
    contributorTerm: filters.contributor ? likeTerm(filters.contributor) : undefined,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    eventType: filters.eventType,
  };
}

// Narrows to cases where a specific contributor (matched by name or email)
// is on the team — appended only when the `contributor` filter is set.
const CONTRIBUTOR_CLAUSE = `AND c.id IN (
      SELECT cc.case_id FROM case_contributors cc JOIN users u ON u.id = cc.user_id
      WHERE u.full_name LIKE :contributorTerm ESCAPE '!' OR u.email LIKE :contributorTerm ESCAPE '!'
    )`;

async function searchCases(viewerId: number, filters: SearchFilters): Promise<SearchResult[]> {
  const params = buildParams(viewerId, filters);
  let sql = `
    SELECT c.id AS resource_id, c.title, c.description, c.sensitivity, c.created_at AS date
    FROM cases c
    WHERE c.deleted_at IS NULL
      AND c.id IN (SELECT case_id FROM case_contributors WHERE user_id = :viewerId)
      AND (c.title LIKE :term ESCAPE '!' OR c.description LIKE :term ESCAPE '!' OR c.editorial_context LIKE :term ESCAPE '!')
  `;
  if (filters.sensitivity) sql += ' AND c.sensitivity = :sensitivity';
  if (filters.contributor) sql += ` ${CONTRIBUTOR_CLAUSE}`;
  if (filters.dateFrom) sql += ' AND c.created_at >= :dateFrom';
  if (filters.dateTo) sql += ' AND c.created_at <= :dateTo';
  sql += ` ORDER BY c.created_at DESC LIMIT ${RESULTS_PER_TYPE}`;

  const [rows] = await pool.query<RowDataPacket[]>(sql, params);
  return rows.map((row) => ({
    resourceType: 'case' as const,
    caseId: row.resource_id,
    caseTitle: row.title,
    resourceId: row.resource_id,
    title: row.title,
    snippet: snippet(row.description),
    sensitivity: row.sensitivity,
    date: row.date,
  }));
}

async function searchEvents(viewerId: number, filters: SearchFilters): Promise<SearchResult[]> {
  const params = buildParams(viewerId, filters);
  let sql = `
    SELECT c.id AS case_id, c.title AS case_title, ie.id AS resource_id, ie.reason, ie.location,
           ie.event_date AS date, COALESCE(ie.sensitivity, c.sensitivity) AS sensitivity
    FROM investigation_events ie
    JOIN cases c ON c.id = ie.case_id AND c.deleted_at IS NULL
    WHERE ie.deleted_at IS NULL
      AND c.id IN (SELECT case_id FROM case_contributors WHERE user_id = :viewerId)
      AND (ie.reason LIKE :term ESCAPE '!' OR ie.location LIKE :term ESCAPE '!' OR ie.findings_summary LIKE :term ESCAPE '!')
  `;
  if (filters.eventType) sql += ' AND ie.type = :eventType';
  if (filters.sensitivity) sql += ' AND COALESCE(ie.sensitivity, c.sensitivity) = :sensitivity';
  if (filters.contributor) sql += ` ${CONTRIBUTOR_CLAUSE}`;
  if (filters.dateFrom) sql += ' AND ie.event_date >= :dateFrom';
  if (filters.dateTo) sql += ' AND ie.event_date <= :dateTo';
  sql += ` ORDER BY ie.event_date DESC LIMIT ${RESULTS_PER_TYPE}`;

  const [rows] = await pool.query<RowDataPacket[]>(sql, params);
  return rows.map((row) => ({
    resourceType: 'event' as const,
    caseId: row.case_id,
    caseTitle: row.case_title,
    resourceId: row.resource_id,
    title: row.reason ? snippet(row.reason, 80) : row.location ?? 'Event',
    snippet: snippet([row.reason, row.location].filter(Boolean).join(' — ')),
    sensitivity: row.sensitivity,
    date: row.date,
  }));
}

// Comments have no case_id column of their own (see caseComments.service.ts
// — they're attached to a case, an event, or a document via
// resource_type/resource_id). The derived table below resolves each
// comment's case_id depending on what it's actually attached to, so the
// outer query can join `cases` and apply the same access/sensitivity/
// contributor filters as everything else.
async function searchComments(viewerId: number, filters: SearchFilters): Promise<SearchResult[]> {
  const params = buildParams(viewerId, filters);
  let sql = `
    SELECT c.id AS case_id, c.title AS case_title, x.id AS resource_id, x.body, x.created_at AS date, c.sensitivity
    FROM (
      SELECT com.id, com.body, com.created_at,
             COALESCE(
               CASE WHEN com.resource_type = 'case' THEN com.resource_id END,
               ie.case_id,
               cd.case_id
             ) AS case_id
      FROM comments com
      LEFT JOIN investigation_events ie ON com.resource_type = 'event' AND ie.id = com.resource_id
      LEFT JOIN case_documents cd ON com.resource_type = 'document' AND cd.id = com.resource_id
      WHERE com.deleted_at IS NULL
        AND (com.visibility = 'shared' OR com.author_id = :viewerId)
        AND com.body LIKE :term ESCAPE '!'
    ) x
    JOIN cases c ON c.id = x.case_id AND c.deleted_at IS NULL
    WHERE c.id IN (SELECT case_id FROM case_contributors WHERE user_id = :viewerId)
  `;
  if (filters.sensitivity) sql += ' AND c.sensitivity = :sensitivity';
  if (filters.contributor) sql += ` ${CONTRIBUTOR_CLAUSE}`;
  if (filters.dateFrom) sql += ' AND x.created_at >= :dateFrom';
  if (filters.dateTo) sql += ' AND x.created_at <= :dateTo';
  sql += ` ORDER BY x.created_at DESC LIMIT ${RESULTS_PER_TYPE}`;

  const [rows] = await pool.query<RowDataPacket[]>(sql, params);
  return rows.map((row) => ({
    resourceType: 'comment' as const,
    caseId: row.case_id,
    caseTitle: row.case_title,
    resourceId: row.resource_id,
    title: 'Comment',
    snippet: snippet(row.body),
    sensitivity: row.sensitivity,
    date: row.date,
  }));
}

async function searchDocuments(viewerId: number, filters: SearchFilters): Promise<SearchResult[]> {
  const params = buildParams(viewerId, filters);
  let sql = `
    SELECT c.id AS case_id, c.title AS case_title, cd.id AS resource_id, cd.file_name, cd.source_description,
           cd.extracted_text, cd.uploaded_at AS date, COALESCE(cd.sensitivity, c.sensitivity) AS sensitivity
    FROM case_documents cd
    JOIN cases c ON c.id = cd.case_id AND c.deleted_at IS NULL
    WHERE cd.deleted_at IS NULL
      AND c.id IN (SELECT case_id FROM case_contributors WHERE user_id = :viewerId)
      AND (cd.file_name LIKE :term ESCAPE '!' OR cd.source_description LIKE :term ESCAPE '!'
           OR cd.extracted_text LIKE :term ESCAPE '!')
  `;
  if (filters.sensitivity) sql += ' AND COALESCE(cd.sensitivity, c.sensitivity) = :sensitivity';
  if (filters.contributor) sql += ` ${CONTRIBUTOR_CLAUSE}`;
  if (filters.dateFrom) sql += ' AND cd.uploaded_at >= :dateFrom';
  if (filters.dateTo) sql += ' AND cd.uploaded_at <= :dateTo';
  sql += ` ORDER BY cd.uploaded_at DESC LIMIT ${RESULTS_PER_TYPE}`;

  const [rows] = await pool.query<RowDataPacket[]>(sql, params);
  return rows.map((row) => ({
    resourceType: 'document' as const,
    caseId: row.case_id,
    caseTitle: row.case_title,
    resourceId: row.resource_id,
    title: row.file_name,
    // Prefer the source-description snippet; fall back to a snippet of the
    // OCR'd/extracted text so a match found only inside the document's
    // content still shows the reader why it matched.
    snippet: snippet(row.source_description || row.extracted_text),
    sensitivity: row.sensitivity,
    date: row.date,
  }));
}

// eventType only narrows the events subquery — it doesn't hide the other
// resource types, since "field visit" isn't a meaningful filter for a case
// or a document. resourceTypes, on the other hand, does hide whole
// categories: it's how the UI lets someone search "documents only", etc.
export async function crossCaseSearch(viewerId: number, filters: SearchFilters): Promise<SearchResult[]> {
  const types = filters.resourceTypes?.length ? filters.resourceTypes : ALL_TYPES;
  const tasks: Promise<SearchResult[]>[] = [];
  if (types.includes('case')) tasks.push(searchCases(viewerId, filters));
  if (types.includes('event')) tasks.push(searchEvents(viewerId, filters));
  if (types.includes('comment')) tasks.push(searchComments(viewerId, filters));
  if (types.includes('document')) tasks.push(searchDocuments(viewerId, filters));

  const resultSets = await Promise.all(tasks);
  return resultSets.flat().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// One row per match, for the "export results" requirement (brief §4.1).
export function toCsv(results: SearchResult[]): string {
  const header = ['type', 'case', 'title', 'snippet', 'sensitivity', 'date'];
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const lines = results.map((r) =>
    [r.resourceType, r.caseTitle, r.title, r.snippet, r.sensitivity ?? '', r.date]
      .map((v) => escape(String(v)))
      .join(',')
  );
  return [header.map(escape).join(','), ...lines].join('\r\n');
}
