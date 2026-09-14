import { RowDataPacket } from 'mysql2';
import { pool } from '../../config/db';
import { EventType } from '../events/events.types';
import { Sensitivity } from '../cases/cases.types';

// Relationship graph (brief §1.5) — deliberately auto-derived from data
// that already exists, rather than a separately-curated `graph_edges`
// table (decision made with Yv: simple first, same logic as search,
// presence and documents). Every edge below is computed from a link that
// was already being recorded for some other reason:
//   - contact <-> case      from case_contacts
//   - contact <-> event     from event_contacts (labelled by event type)
//   - event   <-> case      an event always belongs to its case
//   - case    <-> tag/theme from case_tags
//   - event   <-> location  from investigation_events.location
//   - contact <-> contact   inferred: two contacts who both appear on the
//                           same event's contact list "met" there
//   - contact <-> case      inferred from comment mentions (mentions.contactIds)
//                           on a comment attached anywhere in that case
//
// One deliberate gap: the brief also lists "a collaboré sur" as an edge
// verb. There's no reliable signal for that in the current data model
// (case_contacts records investigation subjects/sources, not who worked
// together) so it's left out rather than guessed at — see
// claude/etat-avancement.md.
//
// Cross-case by default (same access model as search: every node/edge is
// drawn only from cases the viewer actually contributes to), or scoped to
// one case via `caseId` — still filtered by contributorship, so passing a
// case the viewer isn't on simply yields an empty graph rather than a 403,
// consistent with how every other cross-cutting query in this app behaves.

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

export interface GraphFilters {
  caseId?: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

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

function snippet(text: string | null | undefined, max = 60): string {
  if (!text) return '';
  const flat = String(text).replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function caseNodeId(id: number) {
  return `case:${id}`;
}
function eventNodeId(id: number) {
  return `event:${id}`;
}
function contactNodeId(id: number) {
  return `contact:${id}`;
}
function tagNodeId(id: number) {
  return `tag:${id}`;
}
function locationNodeId(value: string) {
  return `location:${value.trim().toLowerCase()}`;
}

// Comments have no case_id of their own — they're attached to a case, an
// event or a document via resource_type/resource_id (same shape reused
// from search.service.ts's searchComments).
interface MentionRow extends RowDataPacket {
  case_id: number;
  mentions: string | null;
}

async function resolveAccessibleCaseIds(viewerId: number, filters: GraphFilters): Promise<number[]> {
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

export async function buildRelationshipGraph(viewerId: number, filters: GraphFilters = {}): Promise<GraphData> {
  const caseIds = await resolveAccessibleCaseIds(viewerId, filters);
  if (caseIds.length === 0) {
    return { nodes: [], edges: [] };
  }

  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const addNode = (node: GraphNode) => {
    if (!nodes.has(node.id)) nodes.set(node.id, node);
  };
  const addEdge = (source: string, target: string, type: GraphEdgeType, label: string) => {
    edges.push({ source, target, type, label });
  };

  // --- cases ---
  const [caseRows] = await pool.query<RowDataPacket[]>(
    `SELECT id, title, sensitivity FROM cases WHERE id IN (:caseIds) AND deleted_at IS NULL`,
    { caseIds }
  );
  for (const row of caseRows) {
    addNode({
      id: caseNodeId(row.id),
      type: 'case',
      label: row.title,
      sensitivity: row.sensitivity,
      meta: { caseId: row.id },
    });
  }
  // caseIds may include ids that no longer resolve (soft-deleted) — keep
  // edges scoped to the cases that actually loaded.
  const liveCaseIds = caseRows.map((r) => r.id as number);
  if (liveCaseIds.length === 0) {
    return { nodes: [], edges: [] };
  }

  // --- events (+ their case + their location) ---
  const [eventRows] = await pool.query<RowDataPacket[]>(
    `SELECT id, case_id, type, event_date, location, reason
     FROM investigation_events
     WHERE case_id IN (:liveCaseIds)`,
    { liveCaseIds }
  );
  for (const row of eventRows) {
    const label = `${EVENT_TYPE_LABELS[row.type as EventType] ?? row.type}: ${
      snippet(row.reason) || row.location || new Date(row.event_date).toLocaleDateString()
    }`;
    addNode({
      id: eventNodeId(row.id),
      type: 'event',
      label,
      meta: { eventType: row.type, eventDate: row.event_date, caseId: row.case_id },
    });
    addEdge(eventNodeId(row.id), caseNodeId(row.case_id), 'part_of_case', 'part of');

    if (row.location && String(row.location).trim()) {
      const locId = locationNodeId(row.location);
      addNode({ id: locId, type: 'location', label: row.location });
      addEdge(eventNodeId(row.id), locId, 'took_place_at', 'took place at');
    }
  }

  // --- tags/themes on cases ---
  const [tagRows] = await pool.query<RowDataPacket[]>(
    `SELECT ct.case_id, t.id AS tag_id, t.name, t.type
     FROM case_tags ct
     JOIN tags t ON t.id = ct.tag_id
     WHERE ct.case_id IN (:liveCaseIds)`,
    { liveCaseIds }
  );
  for (const row of tagRows) {
    addNode({ id: tagNodeId(row.tag_id), type: 'tag', label: row.name, meta: { tagType: row.type } });
    addEdge(caseNodeId(row.case_id), tagNodeId(row.tag_id), 'tagged_with', 'tagged with');
  }

  // --- contacts linked to cases ---
  const [caseContactRows] = await pool.query<RowDataPacket[]>(
    `SELECT cc.case_id, c.id AS contact_id, c.full_name
     FROM case_contacts cc
     JOIN contacts c ON c.id = cc.contact_id AND c.deleted_at IS NULL
     WHERE cc.case_id IN (:liveCaseIds)`,
    { liveCaseIds }
  );
  for (const row of caseContactRows) {
    addNode({ id: contactNodeId(row.contact_id), type: 'contact', label: row.full_name });
    addEdge(contactNodeId(row.contact_id), caseNodeId(row.case_id), 'linked_to_case', 'linked to case');
  }

  // --- contacts linked to events (+ pairwise "met" inference) ---
  const eventIds = eventRows.map((r) => r.id as number);
  const eventTypeById = new Map<number, EventType>(eventRows.map((r) => [r.id as number, r.type as EventType]));
  if (eventIds.length > 0) {
    const [eventContactRows] = await pool.query<RowDataPacket[]>(
      `SELECT ec.event_id, c.id AS contact_id, c.full_name
       FROM event_contacts ec
       JOIN contacts c ON c.id = ec.contact_id AND c.deleted_at IS NULL
       WHERE ec.event_id IN (:eventIds)`,
      { eventIds }
    );

    const contactsByEvent = new Map<number, number[]>();
    for (const row of eventContactRows) {
      addNode({ id: contactNodeId(row.contact_id), type: 'contact', label: row.full_name });

      const evType = eventTypeById.get(row.event_id);
      const edgeType: GraphEdgeType =
        evType === 'interview' ? 'interviewed_at' : evType === 'key_discovery' ? 'discovered_at' : 'involved_in_event';
      const edgeLabel =
        edgeType === 'interviewed_at' ? 'interviewed at' : edgeType === 'discovered_at' ? 'linked to discovery at' : 'involved in';
      addEdge(contactNodeId(row.contact_id), eventNodeId(row.event_id), edgeType, edgeLabel);

      const list = contactsByEvent.get(row.event_id) ?? [];
      list.push(row.contact_id as number);
      contactsByEvent.set(row.event_id, list);
    }

    const metPairs = new Set<string>();
    for (const contactIds of contactsByEvent.values()) {
      for (let i = 0; i < contactIds.length; i++) {
        for (let j = i + 1; j < contactIds.length; j++) {
          const [a, b] = [contactIds[i], contactIds[j]].sort((x, y) => x - y);
          const key = `${a}-${b}`;
          if (metPairs.has(key)) continue;
          metPairs.add(key);
          addEdge(contactNodeId(a), contactNodeId(b), 'met', 'met');
        }
      }
    }
  }

  // --- contacts mentioned in a comment, resolved back to their case ---
  const [mentionRows] = await pool.query<MentionRow[]>(
    `SELECT
       COALESCE(
         CASE WHEN com.resource_type = 'case' THEN com.resource_id END,
         ie.case_id,
         cd.case_id
       ) AS case_id,
       com.mentions
     FROM comments com
     LEFT JOIN investigation_events ie ON com.resource_type = 'event' AND ie.id = com.resource_id
     LEFT JOIN case_documents cd ON com.resource_type = 'document' AND cd.id = com.resource_id
     WHERE com.deleted_at IS NULL
       AND com.mentions IS NOT NULL
       AND (com.visibility = 'shared' OR com.author_id = :viewerId)`,
    { viewerId }
  );

  const mentionedContactIds = new Set<number>();
  const mentionEdges: { caseId: number; contactId: number }[] = [];
  for (const row of mentionRows) {
    if (!row.case_id || !liveCaseIds.includes(row.case_id)) continue;
    let parsed: { contactIds?: number[] } | null = null;
    try {
      parsed = typeof row.mentions === 'string' ? JSON.parse(row.mentions) : (row.mentions as unknown as { contactIds?: number[] });
    } catch {
      continue;
    }
    for (const contactId of parsed?.contactIds ?? []) {
      mentionedContactIds.add(contactId);
      mentionEdges.push({ caseId: row.case_id, contactId });
    }
  }

  if (mentionedContactIds.size > 0) {
    const [contactRows] = await pool.query<RowDataPacket[]>(
      `SELECT id, full_name FROM contacts WHERE id IN (:ids) AND deleted_at IS NULL`,
      { ids: Array.from(mentionedContactIds) }
    );
    for (const row of contactRows) {
      addNode({ id: contactNodeId(row.id), type: 'contact', label: row.full_name });
    }
    const seen = new Set<string>();
    for (const { caseId, contactId } of mentionEdges) {
      const key = `${contactId}-${caseId}`;
      if (seen.has(key) || !nodes.has(contactNodeId(contactId))) continue;
      seen.add(key);
      addEdge(contactNodeId(contactId), caseNodeId(caseId), 'mentioned_in', 'mentioned in');
    }
  }

  return { nodes: Array.from(nodes.values()), edges };
}
