import { ReactNode, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { NotificationsBell } from './NotificationsBell';
import { useAuth } from '../auth/AuthContext';
import { Icon, IconName } from './icons';

/* ============================================================
   Shell « canevas » partagé par toutes les pages connectées
   (maquette validée par Yv, nov. 2026) :
   - rail noir à gauche : navigation principale + compte ;
   - colonne d'outils (facultative) : actions de la page ;
   - canevas blanc à pointillés : contenu, avec une barre flottante
     en bas (facultative) ;
   - panneau sauge à droite (facultatif) : recherche + filtres.
     Sous 1040px il devient un tiroir, ouvert par « Filters ».
   Briques : components/Shell.tsx. Styles : styles.css > « SHELL CANEVAS ».
   ============================================================ */

export type DashNavKey = 'cases' | 'portfolio' | 'graph';
export type DashRailKey = 'cases' | 'search' | 'contacts' | 'map' | 'calendar' | 'security';
type RailKey = DashNavKey | DashRailKey;

interface AppShellProps {
  activeNav?: DashNavKey;
  activeRail?: DashRailKey;
  tools?: ReactNode;
  panel?: ReactNode;
  dock?: ReactNode;
  children: ReactNode;
}

const RAIL: { key: RailKey; to: string; label: string; icon: IconName }[] = [
  { key: 'cases', to: '/cases', label: 'Cases', icon: 'home' },
  { key: 'search', to: '/search', label: 'Search', icon: 'search' },
  { key: 'graph', to: '/graph', label: 'Relations graph', icon: 'share' },
  { key: 'portfolio', to: '/portfolio', label: 'Editorial portfolio', icon: 'layers' },
  { key: 'contacts', to: '/contacts', label: 'Contacts', icon: 'users' },
  { key: 'map', to: '/map', label: 'Map', icon: 'map' },
  { key: 'calendar', to: '/calendar', label: 'Calendar', icon: 'calendar' },
];

export function AppShell({ activeNav, activeRail, tools, panel, dock, children }: AppShellProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [panelOpen, setPanelOpen] = useState(false);
  const active: RailKey | undefined = activeRail ?? activeNav;

  useEffect(() => {
    setPanelOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!panelOpen) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPanelOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panelOpen]);

  const cls = ['dash-root', 'ws', 'sh', tools ? 'has-tools' : '', panel ? 'has-panel' : '', panelOpen ? 'is-panel-open' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cls}>
      <nav className="sh-rail" aria-label="Main">
        <Link to="/cases" className="sh-logo" aria-label="Home">
          4<i />
        </Link>
        {RAIL.map((r) => (
          <Link
            key={r.key}
            to={r.to}
            className={`sh-rail-btn${active === r.key ? ' is-on' : ''}`}
            aria-label={r.label}
            title={r.label}
            aria-current={active === r.key ? 'page' : undefined}
          >
            <Icon name={r.icon} size={20} />
          </Link>
        ))}
        <span className="sh-rail-space" aria-hidden="true" />
        <NotificationsBell />
        <Link
          to="/security"
          className={`sh-rail-btn${active === 'security' ? ' is-on' : ''}`}
          aria-label="Security"
          title="Security"
          aria-current={active === 'security' ? 'page' : undefined}
        >
          <Icon name="shield" size={20} />
        </Link>
        <button type="button" className="sh-rail-btn" onClick={logout} aria-label="Sign out" title="Sign out">
          <Icon name="logout" size={20} />
        </button>
        <span className="sh-avatar" title={user?.fullName ?? undefined} aria-label={user?.fullName ?? 'Account'}>
          {(user?.fullName ?? '?').slice(0, 1).toUpperCase()}
        </span>
      </nav>

      {tools && (
        <aside className="sh-tools" aria-label="Page actions">
          {tools}
        </aside>
      )}

      <main className="sh-canvas">
        <div className="sh-content">{children}</div>
        {(dock || panel) && (
          <div className="sh-dock">
            {dock}
            {panel && (
              <button type="button" className="sh-filters-btn" onClick={() => setPanelOpen(true)} aria-label="Open search and filters">
                <Icon name="sliders" size={20} />
                <span>Filters</span>
              </button>
            )}
          </div>
        )}
      </main>

      {panel && (
        <>
          <aside className="sh-side" aria-label="Search and filters">
            <button type="button" className="sh-side-close" onClick={() => setPanelOpen(false)} aria-label="Close filters">
              <Icon name="x" size={18} />
            </button>
            {panel}
          </aside>
          <div className="sh-scrim" onClick={() => setPanelOpen(false)} aria-hidden="true" />
        </>
      )}
    </div>
  );
}
