import { PageHead, PillButton, initials, shortDate } from '../components/PageHead';
import { Icon } from '../components/icons';
import { CSSProperties, FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { CalendarData, CaseStatus, CaseSummary, Sensitivity } from '../api/types';
import { SensitivityBadge, StatusBadge } from '../components/StatusBadge';
import { AppShell } from '../components/AppShell';
import { useAuth } from '../auth/AuthContext';

/* ============================================================
   Cases dashboard — visual redesign of the app's landing page
   (the default route, "/cases"). Adapted from a client-supplied
   HTML/CSS/JS mockup: same rounded-card / Manrope look, but every
   number on this page comes from real data (GET /cases and
   GET /calendar, both already used elsewhere in the app) rather
   than the mockup's placeholder fintech content. No new backend
   endpoints were needed. See styles.css > "Cases dashboard —
   redesign" for the companion CSS (all classes are dash-* and
   scoped under .dash-root, so no other page is affected).

   The top bar + rail (AppShell) used to be declared right here;
   they're now shared with every other page via
   src/components/AppShell.tsx, so this file only owns what's
   actually specific to the cases dashboard.
   ============================================================ */

const STATUS_LABELS: Record<CaseStatus, string> = {
  preparing: 'Preparing',
  in_progress: 'In progress',
  paused: 'Paused',
  published: 'Published',
  closed: 'Closed',
};

const STATUS_ORDER: CaseStatus[] = ['preparing', 'in_progress', 'paused', 'published', 'closed'];
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}
function startOfWeek(d: Date): Date {
  // Monday-based week, to match the rest of the app's date conventions.
  const day = (d.getDay() + 6) % 7;
  return addDays(startOfDay(d), -day);
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000);
}
function timeAgo(iso: string): string {
  const days = daysBetween(new Date(iso), new Date());
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(iso).toLocaleDateString('en-US');
}
function buildSparkline(values: number[], width: number, height: number): string {
  if (values.length === 0) return '';
  const max = Math.max(1, ...values);
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  return values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - (v / max) * height;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}
function bubbleSize(count: number, total: number): number {
  if (total === 0) return 60;
  const pct = (count / total) * 100;
  return Math.max(54, Math.min(170, 54 + Math.sqrt(pct) * 12));
}

export function CasesListPage() {
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [calendarData, setCalendarData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<CaseStatus | null>(null);

  async function loadAll() {
    setLoading(true);
    try {
      const [caseData, calendar] = await Promise.all([
        api.get<CaseSummary[]>('/cases'),
        api.get<CalendarData>('/calendar').catch(() => ({ events: [], dueDates: [] })),
      ]);
      setCases(caseData);
      setCalendarData(calendar);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load cases');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const title = String(form.get('title') ?? '').trim();
    const sensitivity = String(form.get('sensitivity') ?? 'internal') as Sensitivity;
    if (!title) return;

    setCreateError(null);
    try {
      await api.post('/cases', { title, sensitivity });
      setShowForm(false);
      formEl.reset();
      loadAll();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Unable to create the case');
    }
  }

  // ---------- KPIs, derived from the cases + calendar data already
  // fetched above — no extra endpoints, always computed on the FULL
  // (unfiltered) dataset, so the status filter below only narrows the
  // case grid at the bottom, never the overview numbers.
  const stats = useMemo(() => {
    const total = cases.length;
    const activeStatuses: CaseStatus[] = ['preparing', 'in_progress', 'paused'];
    const activeCount = cases.filter((c) => activeStatuses.includes(c.status)).length;

    const now = new Date();
    const weekAgo = addDays(now, -7);
    const createdThisWeek = cases.filter((c) => new Date(c.createdAt) >= weekAgo).length;

    const confidentialCount = cases.filter((c) => c.sensitivity === 'confidential').length;
    const highlySensitiveCount = cases.filter((c) => c.sensitivity === 'highly_sensitive').length;
    const pctOfTotal = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));

    const statusCounts = STATUS_ORDER.map((status) => ({
      status,
      count: cases.filter((c) => c.status === status).length,
    })).filter((s) => s.count > 0);
    const topStatuses = [...statusCounts].sort((a, b) => b.count - a.count).slice(0, 3);

    const allTagIds = new Set<number>();
    cases.forEach((c) => c.tags?.forEach((t) => allTagIds.add(t.id)));

    const events = calendarData?.events ?? [];
    const dueDates = calendarData?.dueDates ?? [];

    // Events logged this week, bucketed Mon..Sun, for the "Activity" card.
    const weekStart = startOfWeek(now);
    const weekdayCounts = new Array(7).fill(0);
    events.forEach((ev) => {
      const diff = daysBetween(weekStart, new Date(ev.eventDate));
      if (diff >= 0 && diff < 7) weekdayCounts[diff] += 1;
    });
    const weekTotal = weekdayCounts.reduce((a, b) => a + b, 0);
    const peakDay = weekTotal > 0 ? weekdayCounts.indexOf(Math.max(...weekdayCounts)) : -1;

    // Nearest upcoming due date, for the "Next deadline" card.
    const today = startOfDay(now);
    const upcoming = dueDates
      .filter((d) => startOfDay(new Date(d.dueDate)) >= today)
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    const nextDeadline = upcoming[0] ?? null;
    const daysRemaining = nextDeadline ? daysBetween(today, new Date(nextDeadline.dueDate)) : null;

    // Events over the last 14 days, for the "Investigation events" trend.
    const trendStart = addDays(today, -13);
    const trendCounts = new Array(14).fill(0);
    events.forEach((ev) => {
      const diff = daysBetween(trendStart, new Date(ev.eventDate));
      if (diff >= 0 && diff < 14) trendCounts[diff] += 1;
    });
    const last7 = trendCounts.slice(7).reduce((a, b) => a + b, 0);
    const prev7 = trendCounts.slice(0, 7).reduce((a, b) => a + b, 0);

    const recentCases = [...cases]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 3);

    return {
      total,
      activeCount,
      createdThisWeek,
      confidentialPct: pctOfTotal(confidentialCount),
      highlySensitivePct: pctOfTotal(highlySensitiveCount),
      statusCounts,
      topStatuses,
      tagsUsed: allTagIds.size,
      closedCount: statusCounts.find((s) => s.status === 'closed')?.count ?? 0,
      inProgressCount: statusCounts.find((s) => s.status === 'in_progress')?.count ?? 0,
      publishedCount: statusCounts.find((s) => s.status === 'published')?.count ?? 0,
      weekdayCounts,
      weekTotal,
      peakDay,
      nextDeadline,
      daysRemaining,
      trendTotal: last7 + prev7,
      trendUp: last7 >= prev7,
      trendDelta: Math.abs(last7 - prev7),
      trendPath: buildSparkline(trendCounts, 480, 150),
      recentCases,
    };
  }, [cases, calendarData]);

  const visibleCases = useMemo(
    () => (statusFilter ? cases.filter((c) => c.status === statusFilter) : cases),
    [cases, statusFilter]
  );

  return (
    <AppShell activeNav="cases" activeRail="cases">
      <PageHead
        title="Cases"
        action={
          <PillButton icon={showForm ? 'x' : 'plus'} onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cancel' : 'New case'}
          </PillButton>
        }
        kpis={[
          { value: stats.total, label: 'cases' },
          { value: stats.activeCount, label: 'active' },
          { value: stats.publishedCount, label: 'published' },
        ]}
      />

      {error && <p className="dash-error">{error}</p>}

      {/* ══════════════════ KPI GRID ══════════════════ */}
      {!loading && (
        <div className="dash-grid">
          {/* ─── HERO ─── */}
          <section className="dash-card dash-hero">
            <div className="dash-card-head">
              <h2 className="dash-card-title">Investigations</h2>
            </div>
            <p className="dash-hero-sub">
              {stats.activeCount} active case{stats.activeCount === 1 ? '' : 's'} &middot; {stats.total} total
            </p>

            {!showForm ? (
              <>
                <button type="button" className="dash-hero-cta" onClick={() => setShowForm(true)}>
                  <svg className="dash-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5.2v13.6M5.2 12h13.6"/></svg>
                  <span>New case</span>
                </button>
                {stats.recentCases.length > 0 ? (
                  <div className="dash-hero-recent">
                    {stats.recentCases.map((c) => (
                      <Link to={`/cases/${c.id}`} key={c.id} className="dash-hero-recent-item">
                        <span className="dash-hero-recent-title">{c.title}</span>
                        <span className="dash-hero-recent-date">{timeAgo(c.updatedAt)}</span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="dash-hero-empty">No cases yet — create the first one.</p>
                )}
              </>
            ) : (
              <form className="dash-hero-form" onSubmit={handleCreate}>
                <input name="title" placeholder="Case title" required autoFocus />
                <select name="sensitivity" defaultValue="internal">
                  <option value="public">Public</option>
                  <option value="internal">Internal</option>
                  <option value="confidential">Confidential</option>
                  <option value="highly_sensitive">Highly sensitive</option>
                </select>
                {createError && <p className="dash-hero-error">{createError}</p>}
                <div className="dash-hero-form-actions">
                  <button type="submit" className="dash-submit">Create</button>
                  <button type="button" className="dash-cancel" onClick={() => setShowForm(false)}>Cancel</button>
                </div>
              </form>
            )}
          </section>

          {/* ─── ACTIVITY ─── */}
          <section className="dash-card dash-activity">
            <div className="dash-card-head">
              <h2 className="dash-card-title">Activity</h2>
            </div>
            <p className="dash-label">Events logged this week</p>
            <p className="dash-metric"><span className="dash-metric-main">{stats.weekTotal}</span></p>
            <div className="dash-bars">
              {WEEKDAY_LABELS.map((label, i) => {
                const count = stats.weekdayCounts[i];
                const max = Math.max(1, ...stats.weekdayCounts);
                const h = count === 0 ? 6 : Math.max(10, (count / max) * 100);
                const isPeak = i === stats.peakDay && count > 0;
                return (
                  <div className={`dash-bar-col${isPeak ? ' is-peak' : ''}`} key={label}>
                    {isPeak && <span className="dash-bar-tip">{count}</span>}
                    <span className="dash-bar" style={{ '--h': `${h}%` } as CSSProperties} />
                    <span className="dash-bar-x">{label}</span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ─── MY CASES (sensitivity mix) ─── */}
          <section className="dash-card dash-virtual">
            <div className="dash-card-head">
              <h2 className="dash-card-title">My cases</h2>
            </div>
            <p className="dash-label">Total accessible</p>
            <p className="dash-metric"><span className="dash-metric-main">{stats.total}</span></p>
            {stats.createdThisWeek > 0 && (
              <p className="dash-delta dash-delta--up">
                <svg className="dash-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.4 16.6 16.6 7.4M9.2 7.4h7.4v7.4"/></svg>
                <span>{stats.createdThisWeek} new this week</span>
              </p>
            )}
            <div className="dash-meters">
              <div className="dash-meter-row">
                <span className="dash-meter-name">Confid.</span>
                <div className="dash-meter">
                  <div className="dash-meter-fill" style={{ '--w': `${stats.confidentialPct}%` } as CSSProperties}>
                    <span className="dash-meter-chip">{stats.confidentialPct}<i>%</i></span>
                  </div>
                </div>
              </div>
              <div className="dash-meter-row">
                <span className="dash-meter-name">High sens.</span>
                <div className="dash-meter">
                  <div className="dash-meter-fill" style={{ '--w': `${stats.highlySensitivePct}%` } as CSSProperties}>
                    <span className="dash-meter-chip">{stats.highlySensitivePct}<i>%</i></span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ─── NEXT DEADLINE ─── */}
          <section className="dash-card dash-next">
            <div className="dash-card-head">
              <h2 className="dash-card-title">Next deadline</h2>
            </div>
            {stats.nextDeadline ? (
              <>
                <p className="dash-label">Days remaining</p>
                <p className="dash-metric">
                  <span className="dash-metric-main">{stats.daysRemaining}</span>
                  <span className="dash-metric-unit">d</span>
                </p>
                <div className="dash-next-foot">
                  <span className="dash-next-case">{stats.nextDeadline.caseTitle}</span>
                  <span className="dash-next-date">
                    {new Date(stats.nextDeadline.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
                <Link
                  to={`/cases/${stats.nextDeadline.caseId}`}
                  className="dash-next-link"
                  aria-label={`Open ${stats.nextDeadline.caseTitle}`}
                />
              </>
            ) : (
              <p className="dash-next-empty">No upcoming deadlines.</p>
            )}
          </section>

          {/* ─── INVESTIGATION EVENTS (trend) ─── */}
          <section className="dash-card dash-events">
            <div className="dash-card-head">
              <h2 className="dash-card-title">Investigation events</h2>
            </div>
            {stats.trendTotal > 0 ? (
              <div className="dash-events-body">
                <div className="dash-events-left">
                  <p className="dash-label">Last 14 days</p>
                  <p className="dash-metric"><span className="dash-metric-main">{stats.trendTotal}</span></p>
                  <p className={`dash-delta ${stats.trendUp ? 'dash-delta--up' : 'dash-delta--down'}`}>
                    <svg className="dash-i" viewBox="0 0 24 24" aria-hidden="true">
                      {stats.trendUp
                        ? <path d="M7.4 16.6 16.6 7.4M9.2 7.4h7.4v7.4" />
                        : <path d="M7.4 7.4 16.6 16.6M16.6 9.2v7.4H9.2" />}
                    </svg>
                    <span>{stats.trendDelta} vs prior week</span>
                  </p>
                  <div className="dash-chips">
                    <div className="dash-chip"><b>{stats.tagsUsed}</b><span>Themes</span></div>
                    <div className="dash-chip"><b>{stats.closedCount}</b><span>Closed</span></div>
                  </div>
                </div>
                <div className="dash-events-chart">
                  <svg viewBox="0 0 480 150" preserveAspectRatio="none" className="dash-events-svg">
                    <path
                      className="dash-events-line"
                      d={stats.trendPath}
                      fill="none"
                      stroke="#1B1B1A"
                      strokeWidth={2}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="dash-events-x">
                    <span>14d ago</span><span>Today</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="dash-events-empty">No investigation events logged in the last 14 days.</p>
            )}
          </section>

          {/* ─── CASES BY STATUS ─── */}
          <section className="dash-card dash-contract">
            <div className="dash-card-head">
              <h2 className="dash-card-title">Cases by status</h2>
            </div>
            {stats.topStatuses.length > 0 ? (
              <div className="dash-bubbles">
                {stats.topStatuses.map(({ status, count }) => {
                  const size = bubbleSize(count, stats.total);
                  const pct = stats.total ? Math.round((count / stats.total) * 100) : 0;
                  return (
                    <div
                      key={status}
                      className="dash-bubble"
                      style={{ width: size, height: size, background: `var(--status-${status})` }}
                    >
                      <span>{pct}%</span>
                      <small>{STATUS_LABELS[status]}</small>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="dash-events-empty">No cases yet.</p>
            )}
            <div className="dash-contract-stats">
              <div className="dash-cstat"><b>{stats.inProgressCount}</b><span>In progress</span></div>
              <div className="dash-cstat"><b>{stats.publishedCount}</b><span>Published</span></div>
              <div className="dash-cstat"><b>{stats.closedCount}</b><span>Closed</span></div>
            </div>
          </section>
        </div>
      )}

      {/* ══════════════════ CASE LIST ══════════════════ */}
      <section className="ws-section" id="cases">
        <div className="ws-section-head">
          <h2>{statusFilter ? STATUS_LABELS[statusFilter] : 'All cases'}</h2>
          <span className="ws-count">
            <b>{visibleCases.length}</b> case{visibleCases.length === 1 ? '' : 's'}
          </span>
          <Link to="/search" className="ws-circle" aria-label="Search across cases" title="Search across cases">
            <Icon name="search" size={17} />
          </Link>
          <div className="ws-pills" role="tablist" aria-label="Filter by status">
            <button
              type="button"
              className={`ws-pill${statusFilter === null ? ' is-on' : ''}`}
              onClick={() => setStatusFilter(null)}
            >
              All<small>{cases.length}</small>
            </button>
            {STATUS_ORDER.map((st) => {
              const n = cases.filter((c) => c.status === st).length;
              return (
                <button
                  key={st}
                  type="button"
                  className={`ws-pill${statusFilter === st ? ' is-on' : ''}`}
                  onClick={() => setStatusFilter(st)}
                  disabled={!n}
                >
                  <i className={`ws-status-dot is-${st}`} />
                  {STATUS_LABELS[st]}
                  <small>{n}</small>
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div className="ws-empty">Loading...</div>
        ) : visibleCases.length === 0 ? (
          <div className="ws-empty">
            {statusFilter ? 'No cases with this status.' : 'No cases yet. Create the first one with “New case”.'}
          </div>
        ) : (
          <div className="ws-grid">
            {visibleCases.map((c) => (
              <CaseCard key={c.id} item={c} />
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}

const CARD_SENSITIVITY_LABELS: Record<Sensitivity, string> = {
  public: 'Public',
  internal: 'Internal',
  confidential: 'Confidential',
  highly_sensitive: 'Highly sensitive',
};

/* Carte dossier — structure « task » du portfolio : rangée sensibilité/thème,
   flèche ronde en coin, pastille d'initiales + titre + dates, pied « Status ». */
function CaseCard({ item: c }: { item: CaseSummary }) {
  const theme = c.tags?.find((t) => t.type === 'theme') ?? c.tags?.[0];
  const locked = c.sensitivity === 'confidential' || c.sensitivity === 'highly_sensitive';
  return (
    <Link to={`/cases/${c.id}`} className="ws-card ws-task">
      <div className="ws-notch">
        <span className="ws-circle" aria-hidden="true">
          <Icon name="arrowUpRight" />
        </span>
      </div>

      <div className="ws-task-who">
        <span className={`ws-thumb ws-thumb--icon ws-sens is-${c.sensitivity}`} style={{ width: 44, height: 44 }}>
          <Icon name={locked ? 'lock' : 'folder'} />
        </span>
        <div>
          <b>{CARD_SENSITIVITY_LABELS[c.sensitivity]}</b>
          <small>{theme ? theme.name : 'No theme yet'}</small>
        </div>
      </div>

      <div className="ws-task-main">
        <span className="ws-thumb ws-thumb--initials" style={{ width: 44, height: 44 }}>
          <b style={{ fontSize: 15 }}>{initials(c.title)}</b>
        </span>
        <div className="ws-task-text">
          <h3 className="ws-task-title">{c.title}</h3>
          <p className="ws-task-date">
            <span>Updated {shortDate(c.updatedAt)}</span>
            {c.dueDate && (
              <>
                {' → '}
                <span>Due {shortDate(c.dueDate)}</span>
              </>
            )}
          </p>
        </div>
      </div>

      <span className="ws-label">Status</span>
      <div className="ws-task-foot">
        <span className="ws-status">
          <i className={`ws-status-dot is-${c.status}`} />
          {STATUS_LABELS[c.status]}
        </span>
        {c.sensitivity === 'highly_sensitive' && (
          <span className="ws-circle ws-circle--dark" title="Two-factor verification required">
            <Icon name="shield" size={16} />
          </span>
        )}
      </div>
    </Link>
  );
}
