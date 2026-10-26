import { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { NotificationsBell } from './NotificationsBell';
import { useAuth } from '../auth/AuthContext';
import { Icon, IconName } from './icons';

/* ============================================================
   Shell partagé par toutes les pages connectées — structure reprise
   du portfolio (portfolio-app, workspace v3) :
   - ligne du haut : logo dans la colonne latérale + barre-pilule
     (titre, date du jour, navigation en segments, actions rondes) ;
   - corps en grille : colonne latérale de 88px (bouton retour rond +
     pile d'icônes) et colonne de contenu.
   Styles : styles.css > « LAYOUT PORTFOLIO ».
   ============================================================ */

export type DashNavKey = 'cases' | 'portfolio' | 'graph';
export type DashRailKey = 'cases' | 'search' | 'contacts' | 'map' | 'calendar' | 'security';

interface AppShellProps {
  activeNav?: DashNavKey;
  activeRail?: DashRailKey;
  children: ReactNode;
}

const NAV: { key: DashNavKey; to: string; label: string; hint: string; icon: IconName }[] = [
  { key: 'cases', to: '/cases', label: 'Cases', hint: 'Investigations', icon: 'grid' },
  { key: 'portfolio', to: '/portfolio', label: 'Portfolio', hint: 'Editorial projects', icon: 'layers' },
  { key: 'graph', to: '/graph', label: 'Graph', hint: 'Relations', icon: 'share' },
];

const RAIL: { key: DashRailKey; to: string; label: string; icon: IconName }[] = [
  { key: 'cases', to: '/cases', label: 'Cases', icon: 'home' },
  { key: 'search', to: '/search', label: 'Search', icon: 'search' },
  { key: 'contacts', to: '/contacts', label: 'Contacts', icon: 'users' },
  { key: 'map', to: '/map', label: 'Map', icon: 'map' },
  { key: 'calendar', to: '/calendar', label: 'Calendar', icon: 'calendar' },
];

export function AppShell({ activeNav, activeRail, children }: AppShellProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === '/cases';
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  function goBack() {
    // react-router garde l'index d'historique dans history.state.idx :
    // s'il n'y a rien avant (lien ouvert directement), on revient aux dossiers.
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate('/cases');
  }

  return (
    <div className="dash-root ws">
      <header className="ws-top">
        <Link to="/cases" className="ws-logo" aria-label="Home">
          <span>4</span>
          <i />
        </Link>

        <div className="ws-topbar">
          <div className="ws-topbar-head">
            <span className="ws-topbar-title">4th Estate</span>
            <span className="ws-topbar-date">
              <Icon name="calendar" size={14} />
              {today}
            </span>
          </div>

          <nav className="ws-navtrack" aria-label="Main">
            {NAV.map((n) => (
              <Link key={n.key} to={n.to} className={`ws-navseg${activeNav === n.key ? ' is-on' : ''}`}>
                <span className="ws-thumb ws-thumb--icon" style={{ width: 40, height: 40 }}>
                  <Icon name={n.icon} size={17} />
                </span>
                <span className="ws-navseg-label">
                  {n.label}
                  <small>{n.hint}</small>
                </span>
              </Link>
            ))}
          </nav>

          <div className="ws-topbar-actions">
            <NotificationsBell />
            <button type="button" className="ws-circle" aria-label="Sign out" title="Sign out" onClick={logout}>
              <Icon name="logout" size={17} />
            </button>
            <span className="ws-circle ws-circle--dark ws-me" title={user?.fullName ?? undefined} aria-label={user?.fullName ?? 'Account'}>
              {(user?.fullName ?? '?').slice(0, 1).toUpperCase()}
            </span>
          </div>
        </div>
      </header>

      <div className="ws-body">
        <nav className="ws-side" aria-label="Sections">
          {isHome ? (
            <span className="ws-back-spacer" aria-hidden="true" />
          ) : (
            <button type="button" className="ws-circle ws-circle--white" onClick={goBack} aria-label="Back" title="Back">
              <Icon name="arrowLeft" size={18} />
            </button>
          )}
          <div className="ws-side-stack">
            {RAIL.map((r) => (
              <Link
                key={r.key}
                to={r.to}
                className={`ws-side-btn${activeRail === r.key ? ' is-on' : ''}`}
                aria-label={r.label}
                title={r.label}
              >
                <Icon name={r.icon} size={17} />
              </Link>
            ))}
            <span className="ws-side-sep" aria-hidden="true" />
            <Link
              to="/security"
              className={`ws-side-btn${activeRail === 'security' ? ' is-on' : ''}`}
              aria-label="Security"
              title="Security"
            >
              <Icon name="shield" size={17} />
            </Link>
          </div>
        </nav>

        <div className="ws-main-col">{children}</div>
      </div>
    </div>
  );
}
