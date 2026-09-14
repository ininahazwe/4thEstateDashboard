import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { EditorialProjectSummary, PortfolioKpis, ProjectStatus, Tag } from '../api/types';
import { NotificationsBell } from '../components/NotificationsBell';
import { useAuth } from '../auth/AuthContext';

const STATUS_LABELS: Record<ProjectStatus, string> = {
  pitch: 'Pitch',
  researching: 'Researching',
  writing: 'Writing',
  fact_check: 'Fact-check',
  editing: 'Editing',
  ready: 'Ready',
  published: 'Published',
};

const SORT_LABELS: Record<'date' | 'urgency' | 'progress', string> = {
  date: 'Publication date',
  urgency: 'Urgency',
  progress: 'Progress',
};

export function PortfolioPage() {
  const { user, logout } = useAuth();
  const [projects, setProjects] = useState<EditorialProjectSummary[]>([]);
  const [kpis, setKpis] = useState<PortfolioKpis | null>(null);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState('');
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
      <header className="page-header">
        <div>
          <h1>Editorial portfolio</h1>
          <Link to="/cases" className="back-link">
            &larr; My cases
          </Link>
        </div>
        <div className="page-header-actions">
          <Link to="/search" className="btn-secondary">Search</Link>
          <Link to="/graph" className="btn-secondary">Graph</Link>
          <Link to="/map" className="btn-secondary">Map</Link>
          <Link to="/calendar" className="btn-secondary">Calendar</Link>
          <Link to="/security" className="btn-secondary">Security</Link>
          <NotificationsBell />
          <span className="current-user">{user?.fullName}</span>
          <button onClick={logout} className="btn-secondary">Sign out</button>
        </div>
      </header>

      <p className="portfolio-hint">
        Editorial projects (brief §2.1) group one or more investigation cases under a single story,
        with per-step milestones and a status pipeline from pitch to publication. A case only shows
        up here if you also have access to it directly.
      </p>

      {kpis && (
        <div className="portfolio-kpis">
          <div className="portfolio-kpi">
            <strong>{kpis.active}</strong>
            <span>Active</span>
          </div>
          <div className="portfolio-kpi">
            <strong>{kpis.toLaunch}</strong>
            <span>To launch</span>
          </div>
          <div className="portfolio-kpi">
            <strong>{kpis.publishedThisMonth}</strong>
            <span>Published this month</span>
          </div>
        </div>
      )}

      <div className="page-toolbar">
        <button onClick={() => setShowForm((v) => !v)} className="btn-primary">
          {showForm ? 'Cancel' : '+ New editorial project'}
        </button>
      </div>

      {showForm && (
        <form className="inline-form" onSubmit={handleCreate}>
          <input name="title" placeholder="Project title" required />
          <input name="targetPublication" placeholder="Target publication (outlet)" />
          <input name="targetDate" type="date" />
          <button type="submit" className="btn-primary">Create</button>
        </form>
      )}
      {createError && <p className="form-error">{createError}</p>}

      <div className="portfolio-filters">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
          <option value="">All themes</option>
          {allTags.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          {Object.entries(SORT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>Sort: {label}</option>
          ))}
        </select>
      </div>

      {error && <p className="form-error">{error}</p>}

      {loading ? (
        <p>Loading...</p>
      ) : projects.length === 0 ? (
        <p className="empty-state">No editorial projects yet. Create the first one above.</p>
      ) : (
        <div className="portfolio-grid">
          {projects.map((p) => {
            const progress = p.milestoneTotal > 0 ? Math.round((p.milestoneDone / p.milestoneTotal) * 100) : null;
            return (
              <Link to={`/editorial-projects/${p.id}`} key={p.id} className="portfolio-card">
                <div className="portfolio-card-header">
                  <h2>{p.title}</h2>
                  <span className={`badge badge-project-status-${p.status}`}>{STATUS_LABELS[p.status]}</span>
                </div>
                {p.targetPublication && <p className="portfolio-card-meta">{p.targetPublication}</p>}
                {p.targetDate && (
                  <p className="portfolio-card-meta">
                    Target: {new Date(p.targetDate).toLocaleDateString('en-US')}
                  </p>
                )}
                <p className="portfolio-card-stats">
                  {p.contributorCount} contributor{p.contributorCount === 1 ? '' : 's'} ·{' '}
                  {p.linkedCaseCount} case{p.linkedCaseCount === 1 ? '' : 's'}
                  {progress !== null && ` · ${progress}% milestones done`}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
