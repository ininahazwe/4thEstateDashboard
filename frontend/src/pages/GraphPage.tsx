import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as d3 from 'd3';
import { api } from '../api/client';
import { ApiError } from '../api/client';
import { GraphData, GraphEdgeType, GraphNode, GraphNodeType } from '../api/types';
import { NotificationsBell } from '../components/NotificationsBell';
import { useAuth } from '../auth/AuthContext';

// Relationship graph (brief §1.5). Auto-derived on the backend from data
// that already exists elsewhere (contacts <-> cases/events, tags, comment
// mentions, shared-event "met" inference) — nothing here is manually
// curated, see graph.service.ts and claude/etat-avancement.md for the
// scope decision made with Yv.

const NODE_TYPE_LABELS: Record<GraphNodeType, string> = {
  case: 'Case',
  event: 'Event',
  contact: 'Contact',
  tag: 'Tag / theme',
  location: 'Location',
};

// Same color family as the existing search-result badges (badge-resource-*
// in styles.css) — case and event reuse those exact colors, contact/tag/
// location are new but picked from the same palette.
const NODE_TYPE_COLORS: Record<GraphNodeType, string> = {
  case: '#6b7280',
  event: '#2563eb',
  contact: '#059669',
  tag: '#7c3aed',
  location: '#b45309',
};

const EDGE_TYPE_LABELS: Record<GraphEdgeType, string> = {
  linked_to_case: 'Linked to case',
  involved_in_event: 'Involved in event',
  interviewed_at: 'Interviewed at',
  discovered_at: 'Linked to discovery',
  part_of_case: 'Part of case',
  tagged_with: 'Tagged with',
  took_place_at: 'Took place at',
  met: 'Met (shared event)',
  mentioned_in: 'Mentioned in',
};

const ALL_EDGE_TYPES = Object.keys(EDGE_TYPE_LABELS) as GraphEdgeType[];
const CLUSTER_COLORS = d3.schemeTableau10 as readonly string[];

interface SimNode extends GraphNode, d3.SimulationNodeDatum {
  clusterId: number;
}
interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  type: GraphEdgeType;
  label: string;
}

// Cheap union-find over the currently-visible edges — this is the graph's
// "automatic cluster detection" (brief §1.5): color connected components
// distinctly rather than pulling in a community-detection library, on top
// of the force layout already visually grouping connected nodes together.
function computeClusters(nodes: GraphNode[], edgePairs: { source: string; target: string }[]): Map<string, number> {
  const parent = new Map<string, string>();
  nodes.forEach((n) => parent.set(n.id, n.id));

  function find(x: string): string {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root) as string;
    let cur = x;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur) as string;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  }
  function union(a: string, b: string) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  edgePairs.forEach((e) => {
    if (parent.has(e.source) && parent.has(e.target)) union(e.source, e.target);
  });

  const clusterIds = new Map<string, number>();
  const rootIndex = new Map<string, number>();
  nodes.forEach((n) => {
    const root = find(n.id);
    if (!rootIndex.has(root)) rootIndex.set(root, rootIndex.size);
    clusterIds.set(n.id, rootIndex.get(root)!);
  });
  return clusterIds;
}

export function GraphPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const caseId = searchParams.get('caseId');

  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleTypes, setVisibleTypes] = useState<Set<GraphEdgeType>>(new Set(ALL_EDGE_TYPES));
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Populated by the simulation effect, read by the focus effect — kept as
  // refs so toggling focus doesn't have to tear down and restart the whole
  // force simulation.
  const selectionsRef = useRef<{
    node: d3.Selection<SVGCircleElement, SimNode, SVGGElement, unknown>;
    link: d3.Selection<SVGLineElement, SimLink, SVGGElement, unknown>;
    label: d3.Selection<SVGTextElement, SimNode, SVGGElement, unknown>;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = caseId ? `?caseId=${encodeURIComponent(caseId)}` : '';
    api
      .get<GraphData>(`/graph${qs}`)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Unable to load the graph');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  function toggleType(type: GraphEdgeType) {
    setVisibleTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  // Builds (or rebuilds) the force simulation whenever the data or the
  // edge-type filter changes.
  useEffect(() => {
    if (!data || !svgRef.current || !containerRef.current) return;
    setFocusId(null);

    const width = containerRef.current.clientWidth || 800;
    const height = 600;

    const links = data.edges.filter((e) => visibleTypes.has(e.type));
    const clusterIds = computeClusters(data.nodes, links);
    const nodes: SimNode[] = data.nodes.map((n) => ({ ...n, clusterId: clusterIds.get(n.id) ?? 0 }));
    const nodeIds = new Set(nodes.map((n) => n.id));
    const simLinks: SimLink[] = links
      .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
      .map((e) => ({ source: e.source, target: e.target, type: e.type, label: e.label }));

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const root = svg.append('g');
    svg.call(
      d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.2, 4])
        .on('zoom', (event) => root.attr('transform', event.transform.toString()))
    );

    const simulation = d3
      .forceSimulation<SimNode>(nodes)
      .force(
        'link',
        d3
          .forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance(70)
          .strength(0.4)
      )
      .force('charge', d3.forceManyBody().strength(-180))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide(22));

    const link = root
      .append('g')
      .attr('stroke', '#c4c9d4')
      .selectAll<SVGLineElement, SimLink>('line')
      .data(simLinks)
      .join('line')
      .attr('stroke-width', 1.4)
      .attr('stroke-opacity', 0.6)
      .on('mouseenter', (event: MouseEvent, d) => setHover({ x: event.clientX, y: event.clientY, text: d.label }))
      .on('mousemove', (event: MouseEvent) => setHover((h) => (h ? { ...h, x: event.clientX, y: event.clientY } : h)))
      .on('mouseleave', () => setHover(null));

    const node = root
      .append('g')
      .selectAll<SVGCircleElement, SimNode>('circle')
      .data(nodes)
      .join('circle')
      .attr('r', (d) => (d.type === 'case' ? 12 : 8))
      .attr('fill', (d) => NODE_TYPE_COLORS[d.type])
      .attr('stroke', (d) => CLUSTER_COLORS[d.clusterId % CLUSTER_COLORS.length])
      .attr('stroke-width', 2.5)
      .style('cursor', 'pointer')
      .on('mouseenter', (event: MouseEvent, d) =>
        setHover({ x: event.clientX, y: event.clientY, text: `${NODE_TYPE_LABELS[d.type]}: ${d.label}` })
      )
      .on('mousemove', (event: MouseEvent) => setHover((h) => (h ? { ...h, x: event.clientX, y: event.clientY } : h)))
      .on('mouseleave', () => setHover(null))
      .on('click', (_event: MouseEvent, d) => {
        const targetCaseId = (d.meta as { caseId?: number } | undefined)?.caseId;
        if ((d.type === 'case' || d.type === 'event') && targetCaseId) {
          navigate(`/cases/${targetCaseId}`);
        } else if (d.type === 'contact') {
          navigate('/contacts');
        } else {
          setFocusId((prev) => (prev === d.id ? null : d.id));
        }
      })
      .call(
        d3
          .drag<SVGCircleElement, SimNode>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.2).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    const label = root
      .append('g')
      .selectAll<SVGTextElement, SimNode>('text')
      .data(nodes)
      .join('text')
      .text((d) => d.label)
      .attr('font-size', 10)
      .attr('dx', 12)
      .attr('dy', 4)
      .attr('fill', '#3a3f47')
      .style('pointer-events', 'none');

    selectionsRef.current = { node, link, label };

    simulation.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as SimNode).x ?? 0)
        .attr('y1', (d) => (d.source as SimNode).y ?? 0)
        .attr('x2', (d) => (d.target as SimNode).x ?? 0)
        .attr('y2', (d) => (d.target as SimNode).y ?? 0);
      node.attr('cx', (d) => d.x ?? 0).attr('cy', (d) => d.y ?? 0);
      label.attr('x', (d) => d.x ?? 0).attr('y', (d) => d.y ?? 0);
    });

    return () => {
      simulation.stop();
      selectionsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, visibleTypes, navigate]);

  // Focus mode: dims everything except the focused node and its direct
  // neighbors. This is the only "open detail" behavior contact/tag/location
  // nodes get on click — unlike cases and events, there's no dedicated page
  // to navigate to for a single contact/tag/location today.
  useEffect(() => {
    const sel = selectionsRef.current;
    if (!sel) return;
    const { node, link, label } = sel;

    if (!focusId) {
      node.attr('opacity', 1);
      link.attr('opacity', 0.6);
      label.attr('opacity', 1);
      return;
    }

    const neighbors = new Set<string>([focusId]);
    link.each((d) => {
      const s = typeof d.source === 'string' ? d.source : (d.source as SimNode).id;
      const t = typeof d.target === 'string' ? d.target : (d.target as SimNode).id;
      if (s === focusId) neighbors.add(t);
      if (t === focusId) neighbors.add(s);
    });

    node.attr('opacity', (d) => (neighbors.has(d.id) ? 1 : 0.12));
    label.attr('opacity', (d) => (neighbors.has(d.id) ? 1 : 0.12));
    link.attr('opacity', (d) => {
      const s = typeof d.source === 'string' ? d.source : (d.source as SimNode).id;
      const t = typeof d.target === 'string' ? d.target : (d.target as SimNode).id;
      return s === focusId || t === focusId ? 0.9 : 0.05;
    });
  }, [focusId]);

  const nodeCount = data?.nodes.length ?? 0;
  const edgeCount = data?.edges.filter((e) => visibleTypes.has(e.type)).length ?? 0;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Relationship graph</h1>
          {caseId ? (
            <Link to={`/cases/${caseId}`} className="back-link">
              &larr; Back to case
            </Link>
          ) : (
            <Link to="/cases" className="back-link">
              &larr; My cases
            </Link>
          )}
        </div>
        <div className="page-header-actions">
          <Link to="/search" className="btn-secondary">Search</Link>
          <NotificationsBell />
          <span className="current-user">{user?.fullName}</span>
          <button onClick={logout} className="btn-secondary">Sign out</button>
        </div>
      </header>

      <p className="graph-hint">
        {caseId
          ? 'Relations for this case only.'
          : 'Relations across every case you contribute to — auto-derived from contacts, events, tags and comment mentions (nothing here is manually entered).'}{' '}
        Drag nodes to rearrange, scroll/pinch to zoom, click a case or event to open it, click a contact/tag/location to
        highlight its connections.
      </p>

      <div className="graph-filters">
        {ALL_EDGE_TYPES.map((type) => (
          <label key={type} className="graph-filter-chip">
            <input type="checkbox" checked={visibleTypes.has(type)} onChange={() => toggleType(type)} />
            {EDGE_TYPE_LABELS[type]}
          </label>
        ))}
      </div>

      <div className="graph-legend">
        {(Object.keys(NODE_TYPE_LABELS) as GraphNodeType[]).map((type) => (
          <span key={type} className="graph-legend-item">
            <span className="graph-legend-dot" style={{ background: NODE_TYPE_COLORS[type] }} />
            {NODE_TYPE_LABELS[type]}
          </span>
        ))}
      </div>

      {error && <p className="form-error">{error}</p>}

      {loading ? (
        <p>Loading graph...</p>
      ) : !data || data.nodes.length === 0 ? (
        <p className="empty-state">
          No relations to show yet — this builds up automatically as cases get contacts, events, tags and comments.
        </p>
      ) : (
        <>
          <p className="graph-stats">
            {nodeCount} node{nodeCount === 1 ? '' : 's'} · {edgeCount} relation{edgeCount === 1 ? '' : 's'} shown
            {focusId && (
              <button type="button" className="btn-tiny graph-clear-focus" onClick={() => setFocusId(null)}>
                Clear focus
              </button>
            )}
          </p>
          <div className="graph-canvas" ref={containerRef}>
            <svg ref={svgRef} width="100%" height={600} />
          </div>
        </>
      )}

      {hover && (
        <div className="graph-tooltip" style={{ left: hover.x + 12, top: hover.y + 12 }}>
          {hover.text}
        </div>
      )}
    </div>
  );
}
