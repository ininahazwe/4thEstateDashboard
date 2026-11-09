import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { EditorialProjectSummary, PortfolioKpis, ProjectStatus, Tag } from '../api/types';
import { AppShell } from '../components/AppShell';
import { PageHead, initials } from '../components/PageHead';
import {
  ActiveChips,
  DockPrimary,
  Panel,
  PanelFootButton,
  PanelOption,
  PanelSearch,
  PanelSection,
  ToolButton,
  ToolSep,
  compactDate,
} from '../components/Shell';

/* ============================================================
   Portfolio éditorial — maquette « canevas » (nov. 2026) :
   cartes dont la teinte = l'étape éditoriale, filtres (étape,
   thème, tri) dans le panneau de droite. Statut, thème et tri
   restent filtrés côté serveur (GET /editorial-projects), la
   recherche texte côté client.
   ============================================================ */

const STATUS_LABELS: Record<ProjectStatus, string> = {
  pitch: 'Pitch',
  researching: 'Researching',
  writing: 'Writing',
  fact_check: 'Fact-check',
  editing: 'Editing',
  ready: 'Ready',
  published: 'Published',
};
const STATUS_HINTS: Record<ProjectStatus, string> = {
  pitch: 'Idea to be validated',
  researching: 'Gathering facts and sources',
  writing: 'Draft in progress',
  fact_check: 'Claims being verified',
  editing: 'With the editor',
  ready: 'Waiting for publication',
  published: 'Out',
};
const STATUS_ORDER: ProjectStatus[] = ['pitch', 'researching', 'writing', 'fact_check', 'editing', 'ready', 'published'];

type SortKey = 'date' | 'urgency' | 'progress';
const SORT_LABELS: Record<SortKey, string> = {
  date: 'Publication date',
  urgency: 'Urgency',
  progress: 'Progress',
};

export function PortfolioPage() {
  const [projects, setProjects] = useState<EditorialProjectSummary[]>([]);
  const [kpis, setKpis] = useState<PortfolioKpis | null>(null);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<ProjectStatus | ''>('');
  const [tagFilter, setTagFilter] = useState('');
  const [sort, setSort] = useState<SortKey>('date');
  const [query, setQuery] = useState('');

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (tagFilter) params.set('tagId', tagFilter);
    if (sort) params.set('sort', sort);
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  }, [statusFilter, tagFilter, sort]);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<{ projects: EditorialProjectSummary[]; kpis: PortfolioKpis }>(
        `/editorial-projects${queryString}`
      );
      setProjects(data.projects);
      setKpis(data.kpis);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load editorial projects');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString]);

  useEffect(() => {
    api
      .get<Tag[]>('/tags?type=theme')
      .then(setAllTags)
      .catch(() => undefined);
  }, []);

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const title = String(form.get('title') ?? '').trim();
    const targetPublication = String(form.get('targetPublication') ?? '').trim() || undefined;
    const targetDate = String(form.get('targetDate') ?? '').trim() || undefined;
    if (!title) return;

    setCreateError(null);
    try {
      await api.post('/editorial-projects', { title, targetPublication, targetDate });
      setShowForm(false);
      formEl.reset();
      load();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Unable to create the editorial project');
    }
  }

  const q = query.trim().toLowerCase();
  const visible = projects.filter(
    (p) => !q || [p.title, p.targetPublication ?? ''].join(' ').toLowerCase().includes(q)
  );
  const tagName = allTags.find((t) => String(t.id) === tagFilter)?.name;

  const chips = [
    ...(statusFilter ? [{ key: 's', label: `Stage: ${STATUS_LABELS[statusFilter]}`, onRemove: () => setStatusFilter('') }] : []),
    ...(tagFilter ? [{ key: 't', label: `Theme: ${tagName ?? tagFilter}`, onRemove: () => setTagFilter('') }] : []),
    ...(q ? [{ key: 'q', label: `“${query.trim()}”`, onRemove: () => setQuery('') }] : []),
  ];
  function clearFilters() {
    setStatusFilter('');
    setTagFilter('');
    setQuery('');
  }

  const panel = (
    <>
      <PanelSearch value={query} onChange={setQuery} placeholder="Search editorial projects" />
      <Panel
        foot={
          <PanelFootButton onClick={clearFilters} disabled={chips.length === 0} badge={chips.length > 0 ? `${chips.length} active` : null}>
            Clear all filters
          </PanelFootButton>
        }
      >
        <PanelSection title="Stage" count={STATUS_ORDER.length} defaultOpen>
          {STATUS_ORDER.map((s) => (
            <PanelOption
              key={s}
              title={STATUS_LABELS[s]}
              desc={STATUS_HINTS[s]}
              swatch={`var(--pst-${s})`}
              active={statusFilter === s}
              onClick={() => setStatusFilter((cur) => (cur === s ? '' : s))}
            />
          ))}
        </PanelSection>
        <PanelSection title="Themes" count={allTags.length}>
          {allTags.length === 0 ? (
            <p className="sh-panel-empty">No theme exists yet.</p>
          ) : (
            allTags.map((t) => (
              <PanelOption
                key={t.id}
                title={t.name}
                icon="tag"
                active={tagFilter === String(t.id)}
                onClick={() => setTagFilter((cur) => (cur === String(t.id) ? '' : String(t.id)))}
              />
            ))
          )}
        </PanelSection>
        <PanelSection title="Sort by">
          {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
            <PanelOption key={k} title={SORT_LABELS[k]} icon="sliders" active={sort === k} onClick={() => setSort(k)} />
          ))}
        </PanelSection>
      </Panel>
    </>
  );

  const openForm = () => setShowForm(true);

  return (
    <AppShell
      activeNav="portfolio"
      panel={panel}
      tools={
        <>
          <ToolButton icon="plus" label="New editorial project" onClick={openForm} active={showForm} />
          <ToolButton icon="search" label="Search everything" to="/search" />
          <ToolSep />
          <ToolButton icon="folder" label="Cases" to="/cases" />
          <ToolButton icon="calendar" label="Calendar" to="/calendar" />
        </>
      }
      dock={<DockPrimary onClick={openForm}>New editorial project</DockPrimary>}
    >
      <PageHead
        title="Portfolio"
        kpis={
          kpis
            ? [
                { value: kpis.active, label: 'active' },
                { value: kpis.toLaunch, label: 'to launch' },
                { value: kpis.publishedThisMonth, label: 'published this month' },
              ]
            : undefined
        }
      >
        <ActiveChips chips={chips} />
      </PageHead>

      <p className="sh-note">
        Each editorial project groups one or more investigation cases under a single story. A case only shows up here
        if you also have access to it directly.
      </p>

      {showForm && (
        <form className="sh-create" onSubmit={handleCreate}>
          <h2>New editorial project</h2>
          <input name="title" placeholder="Project title" required autoFocus aria-label="Project title" />
          <input name="targetPublication" placeholder="Target outlet" aria-label="Target outlet" />
          <input name="targetDate" type="date" aria-label="Target publication date" />
          <button type="submit" className="btn-primary">Create</button>
          <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          {createError && <p className="form-error">{createError}</p>}
        </form>
      )}

      {error && <p className="form-error">{error}</p>}

      {loading ? (
        <div className="sh-nodes" aria-busy="true">
          {Array.from({ length: 4 }, (_, i) => (
            <span key={i} className="sh-node sh-node--skel" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="sh-empty">
          {chips.length > 0 ? (
            <>
              <b>No editorial project matches these filters</b>
              <button type="button" className="btn-secondary" onClick={clearFilters}>Clear all filters</button>
            </>
          ) : (
            <>
              <b>No editorial projects yet</b>
              <span>Group one or more cases into a story to follow it from pitch to publication.</span>
              <button type="button" className="btn-primary" onClick={openForm}>New editorial project</button>
            </>
          )}
        </div>
      ) : (
        <div className="sh-nodes">
          {visible.map((p) => (
            <ProjectNode key={p.id} project={p} />
          ))}
        </div>
      )}
    </AppShell>
  );
}

function ProjectNode({ project: p }: { project: EditorialProjectSummary }) {
  return (
    <Link to={`/editorial-projects/${p.id}`} className={`sh-node pst-${p.status}`}>
      <span className="sh-node-ic" aria-hidden="true">{initials(p.title)}</span>
      <b className="sh-node-title">{p.title}</b>
      <small className="sh-node-sub">
        {p.targetPublication ? `${p.targetPublication} · ` : ''}
        {STATUS_LABELS[p.status]}
      </small>
      <span className="sh-node-foot">
        {p.milestoneTotal > 0 ? `${p.milestoneDone}/${p.milestoneTotal} milestones` : `${p.linkedCaseCount} case${p.linkedCaseCount === 1 ? '' : 's'}`}
        {p.targetDate ? ` · Target ${compactDate(p.targetDate)}` : ''}
      </span>
    </Link>
  );
}
