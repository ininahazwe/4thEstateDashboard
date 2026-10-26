import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { EditorialProjectSummary, PortfolioKpis, ProjectStatus, Tag } from '../api/types';
import { PageHead, PillButton, initials, shortDate } from '../components/PageHead';
import { Icon } from '../components/icons';

/* ============================================================
   Portfolio éditorial — structure reprise du portfolio (workspace v3) :
   en-tête (titre + bouton pilule + KPI), section « All projects »
   (compteur, filtres en pilules) et grille de cartes « task ».
   Même logique de données qu'avant (GET /editorial-projects).
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

const STATUS_ORDER: ProjectStatus[] = ['pitch', 'researching', 'writing', 'fact_check', 'editing', 'ready', 'published'];

const SORT_LABELS: Record<'date' | 'urgency' | 'progress', string> = {
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
  const [sort, setSort] = useState<'date' | 'urgency' | 'progress'>('date');

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

  return (
    <div className="page">
      <PageHead
        title="Portfolio"
        action={
          <PillButton icon={showForm ? 'x' : 'plus'} onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cancel' : 'New editorial project'}
          </PillButton>
        }
        kpis={
          kpis
            ? [
                { value: kpis.active, label: 'active' },
                { value: kpis.toLaunch, label: 'to launch' },
                { value: kpis.publishedThisMonth, label: 'published this month' },
              ]
            : undefined
        }
      />

      <p className="portfolio-hint ws-head-note">
        Editorial projects group one or more investigation cases under a single story, with per-step milestones
        and a status pipeline from pitch to publication. A case only shows up here if you also have access to it
        directly.
      </p>

      {showForm && (
        <form className="inline-form ws-form" onSubmit={handleCreate}>
          <input name="title" placeholder="Project title" required />
          <input name="targetPublication" placeholder="Target publication (outlet)" />
          <input name="targetDate" type="date" />
          <button type="submit" className="btn-primary">Create</button>
        </form>
      )}
      {createError && <p className="form-error">{createError}</p>}

      <section className="ws-section" id="projects">
        <div className="ws-section-head">
          <h2>{statusFilter ? STATUS_LABELS[statusFilter] : 'All projects'}</h2>
          <span className="ws-count">
            <b>{projects.length}</b> project{projects.length === 1 ? '' : 's'}
          </span>
          <select className="ws-select" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} aria-label="Theme">
            <option value="">All themes</option>
            {allTags.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <select
            className="ws-select"
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            aria-label="Sort"
          >
            {Object.entries(SORT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>Sort: {label}</option>
            ))}
          </select>
          <div className="ws-pills" role="tablist" aria-label="Filter by status">
            <button
              type="button"
              className={`ws-pill${statusFilter === '' ? ' is-on' : ''}`}
              onClick={() => setStatusFilter('')}
            >
              All
            </button>
            {STATUS_ORDER.map((s) => (
              <button
                key={s}
                type="button"
                className={`ws-pill${statusFilter === s ? ' is-on' : ''}`}
                onClick={() => setStatusFilter(s)}
              >
                <i className={`ws-status-dot is-${s}`} />
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="form-error">{error}</p>}

        {loading ? (
          <div className="ws-empty">Loading...</div>
        ) : projects.length === 0 ? (
          <div className="ws-empty">
            {statusFilter || tagFilter
              ? 'No editorial project matches this filter.'
              : 'No editorial projects yet. Create the first one with “New editorial project”.'}
          </div>
        ) : (
          <div className="ws-grid">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ProjectCard({ project: p }: { project: EditorialProjectSummary }) {
  const progress = p.milestoneTotal > 0 ? Math.round((p.milestoneDone / p.milestoneTotal) * 100) : null;
  return (
    <Link to={`/editorial-projects/${p.id}`} className="ws-card ws-task">
      <div className="ws-notch">
        <span className="ws-circle" aria-hidden="true">
          <Icon name="arrowUpRight" />
        </span>
      </div>

      <div className="ws-task-who">
        <span className="ws-thumb ws-thumb--icon" style={{ width: 44, height: 44 }}>
          <Icon name="file" />
        </span>
        <div>
          <b>{p.targetPublication || 'No outlet yet'}</b>
          <small>
            {p.contributorCount} contributor{p.contributorCount === 1 ? '' : 's'} · {p.linkedCaseCount} case
            {p.linkedCaseCount === 1 ? '' : 's'}
          </small>
        </div>
      </div>

      <div className="ws-task-main">
        <span className="ws-thumb ws-thumb--initials" style={{ width: 44, height: 44 }}>
          <b style={{ fontSize: 15 }}>{initials(p.title)}</b>
        </span>
        <div className="ws-task-text">
          <h3 className="ws-task-title">{p.title}</h3>
          <p className="ws-task-date">
            {p.targetDate ? <span>Target {shortDate(p.targetDate)}</span> : <span>No target date</span>}
          </p>
        </div>
      </div>

      <span className="ws-label">Status</span>
      <div className="ws-task-foot">
        <span className="ws-status">
          <i className={`ws-status-dot is-${p.status}`} />
          {STATUS_LABELS[p.status]}
        </span>
        {progress !== null && (
          <span
            className="ws-circle ws-circle--dark ws-progress"
            title={`${p.milestoneDone} of ${p.milestoneTotal} milestones done`}
          >
            {progress}%
          </span>
        )}
      </div>
    </Link>
  );
}
