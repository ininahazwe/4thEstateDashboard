import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { NotificationsBell } from './NotificationsBell';
import { useAuth } from '../auth/AuthContext';

/* ============================================================
   Shared chrome for every redesigned page: top bar (logo-less nav
   tabs + notifications + account) and the left icon rail. Extracted
   out of CasesListPage so every page adopts the exact same shell
   instead of re-declaring it — one place to fix nav, one visual
   language app-wide. Pages render their own content as `children`,
   inside the scrolling `.dash-col` column.
   ============================================================ */

export type DashNavKey = 'cases' | 'portfolio' | 'graph';
export type DashRailKey = 'cases' | 'search' | 'contacts' | 'map' | 'calendar' | 'security';

interface AppShellProps {
  activeNav?: DashNavKey;
  activeRail?: DashRailKey;
  children: ReactNode;
}

export function AppShell({ activeNav, activeRail, children }: AppShellProps) {
  const { user, logout } = useAuth();

  return (
    <div className="dash-root">
      <header className="dash-topbar">
        <nav className="dash-nav">
          <Link to="/cases" className={`dash-tab${activeNav === 'cases' ? ' is-active' : ''}`}>
            <svg className="dash-i" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="2.2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2.2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2.2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2.2"/></svg>
            <span>Cases</span>
          </Link>
          <Link to="/portfolio" className={`dash-tab${activeNav === 'portfolio' ? ' is-active' : ''}`}>
            <svg className="dash-i" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.6" y="5.6" width="18.8" height="12.8" rx="4"/><path d="M2.8 10.4h9"/></svg>
            <span>Portfolio</span>
          </Link>
          <Link to="/graph" className={`dash-tab${activeNav === 'graph' ? ' is-active' : ''}`}>
            <svg className="dash-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5.4 21V3.6"/><path d="M5.4 4.4h11.4c.9 0 1.4 1 .8 1.7l-1.9 2.3c-.3.4-.3.9 0 1.3l1.9 2.3c.6.7.1 1.7-.8 1.7H5.4"/></svg>
            <span>Graph</span>
          </Link>
        </nav>

        <div className="dash-topbar-right">
          <NotificationsBell />
          <button
            type="button"
            className="dash-icon-btn"
            aria-label="Sign out"
            onClick={logout}
            title="Sign out"
          >
            <svg className="dash-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4.5h3.4c1 0 1.8.8 1.8 1.8v11.4c0 1-.8 1.8-1.8 1.8H15"/><path d="M11 8.4 15 12l-4 3.6"/><path d="M15 12H3.6"/></svg>
          </button>
          <span className="dash-me" aria-label={user?.fullName ?? 'Account'} title={user?.fullName ?? undefined}>
            {(user?.fullName ?? '?').slice(0, 1).toUpperCase()}
          </span>
        </div>
      </header>

      <div className="dash-shell">
        <aside className="dash-rail">
          <Link to="/cases" className={`dash-rail-btn${activeRail === 'cases' ? ' is-active' : ''}`} aria-label="Cases" title="Cases">
            <svg className="dash-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.7 10.4 12 3.6l8.3 6.8v8.2c0 1-.8 1.8-1.8 1.8H5.5c-1 0-1.8-.8-1.8-1.8v-8.2Z"/></svg>
          </Link>
          <Link to="/search" className={`dash-rail-btn${activeRail === 'search' ? ' is-active' : ''}`} aria-label="Search" title="Search">
            <svg className="dash-i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7.1"/><path d="M16.3 16.3 20.6 20.6"/></svg>
          </Link>
          <Link to="/contacts" className={`dash-rail-btn${activeRail === 'contacts' ? ' is-active' : ''}`} aria-label="Contacts" title="Contacts">
            <svg className="dash-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.2c0-1.5 1.2-2.7 2.7-2.7h10.6c1.5 0 2.7 1.2 2.7 2.7v6.2c0 1.5-1.2 2.7-2.7 2.7H10l-4.4 3.3v-3.3H6.7A2.7 2.7 0 0 1 4 13.4V7.2Z"/></svg>
          </Link>
          <Link to="/map" className={`dash-rail-btn${activeRail === 'map' ? ' is-active' : ''}`} aria-label="Map" title="Map">
            <svg className="dash-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.4 8.2c0-1.5 1.2-2.7 2.7-2.7h11.8c1.5 0 2.7 1.2 2.7 2.7v8.2c0 1.5-1.2 2.7-2.7 2.7H6.1a2.7 2.7 0 0 1-2.7-2.7V8.2Z"/><path d="M15.2 12.3h2.2"/><path d="M3.4 9.8h5.4"/></svg>
          </Link>
          <Link to="/calendar" className={`dash-rail-btn${activeRail === 'calendar' ? ' is-active' : ''}`} aria-label="Calendar" title="Calendar">
            <svg className="dash-i" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.6" y="5.2" width="16.8" height="15.2" rx="3.2"/><path d="M3.8 10h16.4M8.4 3.4v3.6M15.6 3.4v3.6"/></svg>
          </Link>
          <Link to="/security" className={`dash-rail-btn dash-rail-security${activeRail === 'security' ? ' is-active' : ''}`} aria-label="Security" title="Security">
            <svg className="dash-i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 14.4a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H2.8a2 2 0 0 1 0-4h.2a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V2.8a2 2 0 0 1 4 0V3a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1h.2a2 2 0 0 1 0 4H21a1.7 1.7 0 0 0-1.5 1Z"/></svg>
          </Link>
        </aside>

        <div className="dash-col">{children}</div>
      </div>
    </div>
  );
}
