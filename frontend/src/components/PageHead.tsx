import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, IconName } from './icons';

/* ============================================================
   En-tête de page — structure reprise du portfolio (workspace v3) :
   grand titre fin + bouton pilule + indicateurs en ligne.
   `entity` : pour le titre d'un objet (dossier, projet), en casse
   normale et plus petit, au lieu du titre de section en capitales.
   `children` : rangée d'outils sous le titre (pilules d'action).
   ============================================================ */

export interface HeadKpi {
  value: ReactNode;
  label: string;
}

interface PageHeadProps {
  title: ReactNode;
  entity?: boolean;
  sub?: ReactNode;
  action?: ReactNode;
  kpis?: HeadKpi[];
  children?: ReactNode;
}

export function PageHead({ title, entity = false, sub, action, kpis, children }: PageHeadProps) {
  return (
    <section className={`ws-head${entity ? ' ws-head--entity' : ''}`}>
      <div className="ws-head-text">
        <h1 className={`ws-title${entity ? ' ws-title--entity' : ''}`}>{title}</h1>
        {sub && <div className="ws-head-sub">{sub}</div>}
      </div>
      {action}
      {kpis && kpis.length > 0 && (
        <div className="ws-kpis">
          {kpis.map((k) => (
            <div className="ws-kpi" key={k.label}>
              <span className="ws-kpi-value">{k.value}</span>
              <span className="ws-kpi-label">{k.label}</span>
            </div>
          ))}
        </div>
      )}
      {children && <div className="ws-head-tools">{children}</div>}
    </section>
  );
}

interface PillButtonProps {
  icon?: IconName;
  children: ReactNode;
  onClick?: () => void;
  to?: string;
}

/* Bouton pilule avec pastille ronde à gauche (« Period summary » du portfolio). */
export function PillButton({ icon = 'plus', children, onClick, to }: PillButtonProps) {
  const inner = (
    <>
      <span className="ws-pill-plus">
        <Icon name={icon} size={14} />
      </span>
      {children}
    </>
  );
  return to ? (
    <Link to={to} className="ws-pill-btn">{inner}</Link>
  ) : (
    <button type="button" className="ws-pill-btn" onClick={onClick}>{inner}</button>
  );
}

/* Étiquette de filtre retirable (vue limitée à un dossier, etc.). */
export function ScopeTag({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="ws-filter-tag" title="Remove this filter">
      {children}
      <Icon name="x" size={13} />
    </Link>
  );
}

/* Initiales d'un titre, pour les pastilles rondes des cartes. */
export function initials(title: string): string {
  return title
    .split(/\s+/)
    .filter((w) => /^[A-Za-zÀ-ÿ0-9]/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

export function shortDate(value: string): string {
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
