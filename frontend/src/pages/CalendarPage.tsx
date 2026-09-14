import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { CalendarData, CalendarDueDate, CalendarEvent, EventType } from '../api/types';
import { NotificationsBell } from '../components/NotificationsBell';
import { useAuth } from '../auth/AuthContext';

// Calendar / agenda (Phase 4, brief §4.3). Month/week view built entirely
// from data already tracked — investigation_events.eventDate and
// cases.dueDate — nothing new to enter. Scope decision made with Yv: the
// view only for this first version, no iCal export and no reminders (a
// "deadline_approaching" reminder needs a scheduled job that doesn't exist
// yet — see the notifications module).

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

// Same palette as MapPage's markers, for visual consistency between the
// two views of the same events.
const EVENT_TYPE_COLORS: Record<EventType, string> = {
  interview: '#2563eb',
  meeting: '#0891b2',
  call: '#059669',
  field_visit: '#65a30d',
  document_analysis: '#7c3aed',
  key_discovery: '#dc2626',
  dead_end: '#6b7280',
  pivot: '#d97706',
  publication: '#db2777',
};

const ALL_EVENT_TYPES = Object.keys(EVENT_TYPE_LABELS) as EventType[];
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type ViewMode = 'month' | 'week';

interface DayBucket {
  date: Date;
  key: string;
  events: CalendarEvent[];
  dueDates: CalendarDueDate[];
}

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfWeek(d: Date): Date {
  // Weeks start Monday.
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (copy.getDay() + 6) % 7; // 0 = Monday
  copy.setDate(copy.getDate() - dow);
  return copy;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function CalendarPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const caseId = searchParams.get('caseId');

  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleTypes, setVisibleTypes] = useState<Set<EventType>>(new Set(ALL_EVENT_TYPES));
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [selectedDay, setSelectedDay] = useState<Date>(() => new Date());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = caseId ? `?caseId=${encodeURIComponent(caseId)}` : '';
    api
      .get<CalendarData>(`/calendar${qs}`)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Unable to load the calendar');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  function toggleType(type: EventType) {
    setVisibleTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  // Index events/due dates by local calendar day, filtered to the visible
  // event types (due dates are always shown — they aren't event types).
  const byDay = useMemo(() => {
    const map = new Map<string, { events: CalendarEvent[]; dueDates: CalendarDueDate[] }>();
    if (!data) return map;

    const get = (key: string) => {
      let bucket = map.get(key);
      if (!bucket) {
        bucket = { events: [], dueDates: [] };
        map.set(key, bucket);
      }
      return bucket;
    };

    for (const ev of data.events) {
      if (!visibleTypes.has(ev.type)) continue;
      const d = new Date(ev.eventDate);
      if (Number.isNaN(d.getTime())) continue;
      get(dateKey(d)).events.push(ev);
    }
    for (const dd of data.dueDates) {
      const d = new Date(dd.dueDate);
      if (Number.isNaN(d.getTime())) continue;
      get(dateKey(d)).dueDates.push(dd);
    }
    return map;
  }, [data, visibleTypes]);

  function bucketFor(d: Date): DayBucket {
    const key = dateKey(d);
    const found = byDay.get(key);
    return { date: d, key, events: found?.events ?? [], dueDates: found?.dueDates ?? [] };
  }

  // ---- Month grid: full weeks (Mon-Sun) covering every day of the month ----
  const monthDays = useMemo<DayBucket[]>(() => {
    if (viewMode !== 'month') return [];
    const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const lastOfMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    const gridStart = startOfWeek(firstOfMonth);
    const gridEnd = addDays(startOfWeek(lastOfMonth), 6);
    const days: DayBucket[] = [];
    for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) {
      days.push(bucketFor(d));
    }
    return days;
  }, [viewMode, anchor, byDay]);

  // ---- Week agenda: the 7 days of the week containing `anchor` ----
  const weekDays = useMemo<DayBucket[]>(() => {
    if (viewMode !== 'week') return [];
    const start = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => bucketFor(addDays(start, i)));
  }, [viewMode, anchor, byDay]);

  function goToday() {
    const today = new Date();
    setAnchor(today);
    setSelectedDay(today);
  }
  function goPrev() {
    setAnchor((a) => (viewMode === 'month' ? new Date(a.getFullYear(), a.getMonth() - 1, 1) : addDays(a, -7)));
  }
  function goNext() {
    setAnchor((a) => (viewMode === 'month' ? new Date(a.getFullYear(), a.getMonth() + 1, 1) : addDays(a, 7)));
  }

  const monthLabel = anchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const selectedBucket = bucketFor(selectedDay);
  const today = new Date();

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Calendar</h1>
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
          <Link to="/graph" className="btn-secondary">Graph</Link>
          <Link to="/map" className="btn-secondary">Map</Link>
          <Link to="/portfolio" className="btn-secondary">Portfolio</Link>
          <Link to="/security" className="btn-secondary">Security</Link>
          <NotificationsBell />
          <span className="current-user">{user?.fullName}</span>
          <button onClick={logout} className="btn-secondary">Sign out</button>
        </div>
      </header>

      <p className="calendar-hint">
        {caseId ? 'Events and due date for this case only.' : 'Every event and case due date across every case you contribute to.'}{' '}
        Click a day to see its full list below, click an item to open its case.
      </p>

      <div className="calendar-toolbar">
        <div className="calendar-nav">
          <button className="btn-secondary" onClick={goPrev}>&larr;</button>
          <button className="btn-secondary" onClick={goToday}>Today</button>
          <button className="btn-secondary" onClick={goNext}>&rarr;</button>
          <span className="calendar-period-label">
            {viewMode === 'month' ? monthLabel : `Week of ${startOfWeek(anchor).toLocaleDateString('en-US')}`}
          </span>
        </div>
        <div className="calendar-view-toggle">
          <button
            className={viewMode === 'month' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setViewMode('month')}
          >
            Month
          </button>
          <button
            className={viewMode === 'week' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setViewMode('week')}
          >
            Week
          </button>
        </div>
      </div>

      <div className="calendar-filters">
        {ALL_EVENT_TYPES.map((type) => (
          <label key={type} className="calendar-filter-chip">
            <input type="checkbox" checked={visibleTypes.has(type)} onChange={() => toggleType(type)} />
            <span className="graph-legend-dot" style={{ background: EVENT_TYPE_COLORS[type] }} />
            {EVENT_TYPE_LABELS[type]}
          </label>
        ))}
        <label className="calendar-filter-chip">
          <span className="calendar-due-marker" />
          Case due date
        </label>
      </div>

      {error && <p className="form-error">{error}</p>}

      {loading ? (
        <p>Loading calendar...</p>
      ) : (
        <>
          {viewMode === 'month' ? (
            <div className="calendar-month-grid">
              {WEEKDAY_LABELS.map((label) => (
                <div key={label} className="calendar-weekday-label">
                  {label}
                </div>
              ))}
              {monthDays.map((day) => {
                const inMonth = day.date.getMonth() === anchor.getMonth();
                const isToday = isSameDay(day.date, today);
                const isSelected = isSameDay(day.date, selectedDay);
                const items = [...day.dueDates, ...day.events];
                const overflow = items.length - 3;
                return (
                  <button
                    key={day.key}
                    className={[
                      'calendar-day-cell',
                      inMonth ? '' : 'calendar-day-outside',
                      isToday ? 'calendar-day-today' : '',
                      isSelected ? 'calendar-day-selected' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => setSelectedDay(day.date)}
                  >
                    <span className="calendar-day-number">{day.date.getDate()}</span>
                    <span className="calendar-day-chips">
                      {day.dueDates.slice(0, 3).map((dd) => (
                        <span key={`due-${dd.caseId}`} className="calendar-chip calendar-chip-due">
                          <span className="calendar-due-marker" />
                          {dd.caseTitle}
                        </span>
                      ))}
                      {day.events.slice(0, Math.max(0, 3 - day.dueDates.length)).map((ev) => (
                        <span key={`ev-${ev.id}`} className="calendar-chip">
                          <span className="graph-legend-dot" style={{ background: EVENT_TYPE_COLORS[ev.type] }} />
                          {ev.caseTitle}
                        </span>
                      ))}
                      {overflow > 0 && <span className="calendar-chip-more">+{overflow} more</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="calendar-week-grid">
              {weekDays.map((day) => {
                const isToday = isSameDay(day.date, today);
                const isSelected = isSameDay(day.date, selectedDay);
                return (
                  <button
                    key={day.key}
                    className={[
                      'calendar-week-day',
                      isToday ? 'calendar-day-today' : '',
                      isSelected ? 'calendar-day-selected' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => setSelectedDay(day.date)}
                  >
                    <div className="calendar-week-day-header">
                      {day.date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}
                    </div>
                    {day.dueDates.map((dd) => (
                      <span key={`due-${dd.caseId}`} className="calendar-chip calendar-chip-due">
                        <span className="calendar-due-marker" />
                        {dd.caseTitle}
                      </span>
                    ))}
                    {day.events.map((ev) => (
                      <span key={`ev-${ev.id}`} className="calendar-chip">
                        <span className="graph-legend-dot" style={{ background: EVENT_TYPE_COLORS[ev.type] }} />
                        {EVENT_TYPE_LABELS[ev.type]}
                      </span>
                    ))}
                  </button>
                );
              })}
            </div>
          )}

          <div className="calendar-selected-day">
            <h2>{selectedDay.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</h2>
            {selectedBucket.dueDates.length === 0 && selectedBucket.events.length === 0 ? (
              <p className="empty-state">Nothing scheduled this day.</p>
            ) : (
              <ul className="calendar-agenda-list">
                {selectedBucket.dueDates.map((dd) => (
                  <li key={`due-${dd.caseId}`}>
                    <button className="calendar-agenda-item" onClick={() => navigate(`/cases/${dd.caseId}`)}>
                      <span className="calendar-due-marker" />
                      <strong>Due date</strong> — {dd.caseTitle}
                    </button>
                  </li>
                ))}
                {selectedBucket.events.map((ev) => (
                  <li key={`ev-${ev.id}`}>
                    <button className="calendar-agenda-item" onClick={() => navigate(`/cases/${ev.caseId}`)}>
                      <span className="graph-legend-dot" style={{ background: EVENT_TYPE_COLORS[ev.type] }} />
                      <strong>{EVENT_TYPE_LABELS[ev.type]}</strong> — {ev.caseTitle}
                      {ev.location ? ` (${ev.location})` : ''}
                      {ev.reason ? `: ${ev.reason}` : ''}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
