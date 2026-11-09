import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as d3 from 'd3';
import { api } from '../api/client';
import { ApiError } from '../api/client';
import { GraphData, GraphEdgeType, GraphNode, GraphNodeType } from '../api/types';
import { AppShell } from '../components/AppShell';
import { PageHead, ScopeTag } from '../components/PageHead';
import {
  DockBar,
  DockButton,
  DockPrimary,
  Panel,
  PanelFootButton,
  PanelGroupLabel,
  PanelOption,
  PanelSearch,
  PanelSection,
  ViewSwitcher,
} from '../components/Shell';

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

// Maquette « canevas » : les dossiers sont des cartes noires (élément principal),
// les autres nœuds des cartes pastel claires, une teinte par type.
const NODE_FILL: Record<GraphNodeType, string> = {
  case: '#18191B',
  event: '#E6EFF8',
  contact: '#E5F0E6',
  tag: '#EEEAF6',
  location: '#F6EEDC',
};
const NODE_SYMBOL: Record<GraphNodeType, string> = {
  case: 'g-folder',
  event: 'g-calendar',
  contact: 'g-person',
  tag: 'g-tag',
  location: 'g-pin',
};
const NODE_HINTS: Record<GraphNodeType, string> = {
  case: 'Opens the case',
  event: 'Opens its case',
  contact: 'Highlights its connections',
  tag: 'Highlights its connections',
  location: 'Highlights its connections',
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

// Couleur des liens par famille : personnes (bleu), lieux (vert), dossier (encre),
// thèmes (violet), découvertes et mentions (rose / ocre).
const EDGE_COLORS: Record<GraphEdgeType, string> = {
  linked_to_case: '#18191B',
  part_of_case: '#18191B',
  involved_in_event: '#3F86B5',
  interviewed_at: '#3F86B5',
  met: '#3F86B5',
  took_place_at: '#4E8A5C',
  tagged_with: '#7A62A3',
  discovered_at: '#B4506E',
  mentioned_in: '#9A7432',
};
const EDGE_GROUPS: { label: string; types: GraphEdgeType[] }[] = [
  { label: 'People', types: ['involved_in_event', 'interviewed_at', 'met'] },
  { label: 'Case', types: ['linked_to_case', 'part_of_case', 'discovered_at'] },
  { label: 'Context', types: ['took_place_at', 'tagged_with', 'mentioned_in'] },
];

function shortLabel(text: string, max = 24): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const caseId = searchParams.get('caseId');

  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleTypes, setVisibleTypes] = useState<Set<GraphEdgeType>>(new Set(ALL_EDGE_TYPES));
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Remplis par l'effet de simulation, lus par l'effet de focus et par les
  // boutons de zoom — gardés en refs pour ne pas relancer la simulation.
  const selectionsRef = useRef<{
    node: d3.Selection<SVGGElement, SimNode, SVGGElement, unknown>;
    link: d3.Selection<SVGPathElement, SimLink, SVGGElement, unknown>;
  } | null>(null);
  const zoomRef = useRef<{
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    zoom: d3.ZoomBehavior<SVGSVGElement, unknown>;
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

  // Construit (ou reconstruit) la simulation quand les données ou les types de lien visibles changent.
  useEffect(() => {
    if (!data || !svgRef.current || !containerRef.current) return;
    setFocusId(null);

    const width = containerRef.current.clientWidth || 800;
    const height = containerRef.current.clientHeight || 600;

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
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on('zoom', (event) => root.attr('transform', event.transform.toString()));
    svg.call(zoom);
    zoomRef.current = { svg, zoom };

    const size = (d: SimNode) => (d.type === 'case' ? 52 : 40);

    const simulation = d3
      .forceSimulation<SimNode>(nodes)
      .force(
        'link',
        d3
          .forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance(110)
          .strength(0.35)
      )
      .force('charge', d3.forceManyBody().strength(-320))
      .force('center', d3.forceCenter(width / 2, height / 2))
      // Légère attraction vers le centre : un nœud isolé (ses liens masqués) reste dans le cadre.
      .force('x', d3.forceX<SimNode>(width / 2).strength(0.03))
      .force('y', d3.forceY<SimNode>(height / 2).strength(0.045))
      .force('collide', d3.forceCollide<SimNode>((d) => size(d) / 2 + 26));

    const link = root
      .append('g')
      .attr('fill', 'none')
      .selectAll<SVGPathElement, SimLink>('path')
      .data(simLinks)
      .join('path')
      .attr('stroke', (d) => EDGE_COLORS[d.type])
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.55)
      .on('mouseenter', (event: MouseEvent, d) => setHover({ x: event.clientX, y: event.clientY, text: d.label }))
      .on('mousemove', (event: MouseEvent) => setHover((h) => (h ? { ...h, x: event.clientX, y: event.clientY } : h)))
      .on('mouseleave', () => setHover(null));

    const node = root
      .append('g')
      .selectAll<SVGGElement, SimNode>('g')
      .data(nodes)
      .join('g')
      .attr('class', (d) => `graph-node graph-node--${d.type}`)
      .style('cursor', 'pointer')
      .on('mouseenter', (event: MouseEvent, d) =>
        setHover({ x: event.clientX, y: event.clientY, text: `${NODE_TYPE_LABELS[d.type]}: ${d.label} — ${NODE_HINTS[d.type]}` })
      )
      .on('mousemove', (event: MouseEvent) => setHover((h) => (h ? { ...h, x: event.clientX, y: event.clientY } : h)))
      .on('mouseleave', () => setHover(null))
      .on('click', (_event: MouseEvent, d) => {
        const targetCaseId = (d.meta as { caseId?: number } | undefined)?.caseId;
        if ((d.type === 'case' || d.type === 'event') && targetCaseId) {
          navigate(`/cases/${targetCaseId}`);
        } else {
          setFocusId((prev) => (prev === d.id ? null : d.id));
        }
      })
      .call(
        d3
          .drag<SVGGElement, SimNode>()
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

    node
      .append('rect')
      .attr('x', (d) => -size(d) / 2)
      .attr('y', (d) => -size(d) / 2)
      .attr('width', size)
      .attr('height', size)
      .attr('rx', (d) => (d.type === 'case' ? 16 : 13))
      .attr('fill', (d) => NODE_FILL[d.type]);

    node
      .append('use')
      .attr('href', (d) => `#${NODE_SYMBOL[d.type]}`)
      .attr('x', -9)
      .attr('y', -9)
      .attr('width', 18)
      .attr('height', 18)
      .attr('color', (d) => (d.type === 'case' ? '#FFFFFF' : '#18191B'));

    node
      .append('text')
      .text((d) => shortLabel(d.label))
      .attr('y', (d) => size(d) / 2 + 16)
      .attr('text-anchor', 'middle')
      .attr('font-size', (d) => (d.type === 'case' ? 12.5 : 11.5))
      .attr('font-weight', (d) => (d.type === 'case' ? 500 : 400))
      .attr('fill', (d) => (d.type === 'case' ? '#18191B' : '#4A4944'))
      .attr('paint-order', 'stroke')
      .attr('stroke', '#FFFFFF')
      .attr('stroke-width', 4)
      .attr('stroke-linejoin', 'round')
      .style('pointer-events', 'none');

    selectionsRef.current = { node, link };

    simulation.on('tick', () => {
      link.attr('d', (d) => {
        const s = d.source as SimNode;
        const t = d.target as SimNode;
        const sx = s.x ?? 0;
        const sy = s.y ?? 0;
        const tx = t.x ?? 0;
        const ty = t.y ?? 0;
        // Courbe douce, comme les liaisons de la maquette.
        const mx = (sx + tx) / 2;
        return `M${sx},${sy} C${mx},${sy} ${mx},${ty} ${tx},${ty}`;
      });
      node.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => {
      simulation.stop();
      selectionsRef.current = null;
      zoomRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, visibleTypes, navigate]);

  // Focus (clic sur un contact / thème / lieu) et recherche : estompe tout sauf
  // le nœud ciblé et ses voisins directs, ou les nœuds qui correspondent au texte.
  useEffect(() => {
    const sel = selectionsRef.current;
    if (!sel) return;
    const { node, link } = sel;
    const q = query.trim().toLowerCase();

    if (!focusId && !q) {
      node.attr('opacity', 1);
      link.attr('opacity', 1);
      return;
    }

    if (!focusId) {
      node.attr('opacity', (d) => (d.label.toLowerCase().includes(q) ? 1 : 0.15));
      link.attr('opacity', 0.15);
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
    link.attr('opacity', (d) => {
      const s = typeof d.source === 'string' ? d.source : (d.source as SimNode).id;
      const t = typeof d.target === 'string' ? d.target : (d.target as SimNode).id;
      return s === focusId || t === focusId ? 1 : 0.08;
    });
  }, [focusId, query]);

  function zoomBy(k: number) {
    const z = zoomRef.current;
    if (z) z.svg.transition().duration(200).call(z.zoom.scaleBy, k);
  }
  function zoomReset() {
    const z = zoomRef.current;
    if (z) z.svg.transition().duration(250).call(z.zoom.transform, d3.zoomIdentity);
  }

  const nodeCount = data?.nodes.length ?? 0;
  const edgeCount = data?.edges.filter((e) => visibleTypes.has(e.type)).length ?? 0;
  const edgeCountByType = new Map<GraphEdgeType, number>();
  data?.edges.forEach((e) => edgeCountByType.set(e.type, (edgeCountByType.get(e.type) ?? 0) + 1));
  const nodeCountByType = new Map<GraphNodeType, number>();
  data?.nodes.forEach((n) => nodeCountByType.set(n.type, (nodeCountByType.get(n.type) ?? 0) + 1));
  const hiddenTypes = ALL_EDGE_TYPES.length - visibleTypes.size;
  const focusLabel = focusId ? data?.nodes.find((n) => n.id === focusId)?.label : null;

  const panel = (
    <>
      <PanelSearch value={query} onChange={setQuery} placeholder="Find a node" />
      <Panel
        foot={
          focusId ? (
            <PanelFootButton onClick={() => setFocusId(null)} badge={focusLabel ? shortLabel(focusLabel, 16) : null}>
              Clear focus
            </PanelFootButton>
          ) : (
            <PanelFootButton
              onClick={() => setVisibleTypes(new Set(ALL_EDGE_TYPES))}
              disabled={hiddenTypes === 0}
              badge={hiddenTypes > 0 ? `${hiddenTypes} hidden` : null}
            >
              Show all link types
            </PanelFootButton>
          )
        }
      >
        <PanelSection title="Links" count={edgeCount} defaultOpen>
          {EDGE_GROUPS.map((g) => (
            <div key={g.label}>
              <PanelGroupLabel>{g.label}</PanelGroupLabel>
              {g.types.map((t) => (
                <PanelOption
                  key={t}
                  title={EDGE_TYPE_LABELS[t]}
                  swatch={EDGE_COLORS[t]}
                  count={edgeCountByType.get(t) ?? 0}
                  active={visibleTypes.has(t)}
                  onClick={() => toggleType(t)}
                  toggle
                />
              ))}
            </div>
          ))}
        </PanelSection>
        <PanelSection title="Node types" count={nodeCount}>
          {(Object.keys(NODE_TYPE_LABELS) as GraphNodeType[]).map((t) => (
            <PanelOption
              key={t}
              title={NODE_TYPE_LABELS[t]}
              desc={NODE_HINTS[t]}
              swatch={NODE_FILL[t]}
              count={nodeCountByType.get(t) ?? 0}
            />
          ))}
        </PanelSection>
      </Panel>
    </>
  );

  return (
    <AppShell
      activeNav="graph"
      panel={panel}
      dock={
        <>
          {caseId ? (
            <DockPrimary icon="arrowLeft" to={`/cases/${caseId}`}>Back to case</DockPrimary>
          ) : null}
          <ViewSwitcher current="graph" />
          <DockBar label="Zoom">
            <DockButton icon="minus" label="Zoom out" onClick={() => zoomBy(0.8)} />
            <DockButton icon="fit" label="Reset view" onClick={zoomReset} />
            <DockButton icon="plus" label="Zoom in" onClick={() => zoomBy(1.25)} />
          </DockBar>
        </>
      }
    >
      {/* Pictogrammes utilisés par les nœuds D3 (<use href="#g-…">). */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <defs>
          <symbol id="g-folder" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 7.5c0-1.1.9-2 2-2h4l2 2.5h7c1.1 0 2 .9 2 2v7.5c0 1.1-.9 2-2 2h-13c-1.1 0-2-.9-2-2V7.5Z" /></symbol>
          <symbol id="g-calendar" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M3.5 10h17M8.5 3v4M15.5 3v4" /></symbol>
          <symbol id="g-person" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.8" /><path d="M4.5 20.5c1-4 4-6 7.5-6s6.5 2 7.5 6" /></symbol>
          <symbol id="g-tag" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 12.6V5.5c0-1.1.9-2 2-2h7.1l8 8-9.1 9.1-8-8Z" /><circle cx="8.3" cy="8.3" r="1.4" /></symbol>
          <symbol id="g-pin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.3" /></symbol>
        </defs>
      </svg>

      <PageHead
        title="Relations"
        sub={
          caseId ? (
            <>
              <Link to={`/cases/${caseId}`} className="ws-filter-tag">Back to case</Link>
              <ScopeTag to="/graph">This case only</ScopeTag>
            </>
          ) : undefined
        }
        kpis={
          data
            ? [
                { value: nodeCount, label: nodeCount === 1 ? 'node' : 'nodes' },
                { value: edgeCount, label: edgeCount === 1 ? 'link' : 'links' },
              ]
            : undefined
        }
      />

      <p className="sh-note">
        {caseId ? 'Relations for this case only, ' : 'Relations across every case you contribute to, '}
        built automatically from contacts, events, themes and comment mentions. Drag a node to move it; click a case or
        an event to open it; click a contact, theme or place to highlight its connections.
      </p>

      {error && <p className="form-error">{error}</p>}

      {loading ? (
        <div className="graph-canvas sh-graph is-loading" aria-busy="true" />
      ) : !data || data.nodes.length === 0 ? (
        <div className="sh-empty">
          <b>No relations to show yet</b>
          <span>The graph builds itself as cases get contacts, events, themes and comments.</span>
          <Link to="/cases" className="btn-secondary">Go to cases</Link>
        </div>
      ) : (
        <div className="graph-canvas sh-graph" ref={containerRef}>
          <svg ref={svgRef} width="100%" height="100%" role="img" aria-label={`Relations graph: ${nodeCount} nodes, ${edgeCount} links`} />
        </div>
      )}

      {hover && (
        <div className="graph-tooltip" style={{ left: hover.x + 12, top: hover.y + 12 }}>
          {hover.text}
        </div>
      )}
    </AppShell>
  );
}
