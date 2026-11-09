import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, IconName } from './icons';

/* ============================================================
   Briques du shell « canevas » (maquette validée par Yv, nov. 2026) :
   colonne d'outils, panneau de recherche/filtres, barre flottante.
   Styles : styles.css > « SHELL CANEVAS ».
   ============================================================ */

/* ---------- Colonne d'outils ---------- */
interface ToolButtonProps {
  icon: IconName;
  label: string;
  to?: string;
  onClick?: () => void;
  active?: boolean;
}
export function ToolButton({ icon, label, to, onClick, active }: ToolButtonProps) {
  const cls = `sh-tool${active ? ' is-on' : ''}`;
  return to ? (
    <Link to={to} className={cls} aria-label={label} title={label}>
      <Icon name={icon} size={20} />
    </Link>
  ) : (
    <button type="button" className={cls} onClick={onClick} aria-label={label} title={label} aria-pressed={active}>
      <Icon name={icon} size={20} />
    </button>
  );
}
export function ToolSep() {
  return <span className="sh-tool-sep" aria-hidden="true" />;
}

/* ---------- Panneau droit ---------- */
export function PanelSearch({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="sh-search">
      <Icon name="search" size={22} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {value && (
        <button type="button" className="sh-search-clear" onClick={() => onChange('')} aria-label="Clear search">
          <Icon name="x" size={14} />
        </button>
      )}
    </label>
  );
}

export function Panel({ children, foot }: { children: ReactNode; foot?: ReactNode }) {
  return (
    <div className="sh-panel">
      <div className="sh-panel-body">{children}</div>
      {foot && <div className="sh-panel-foot">{foot}</div>}
    </div>
  );
}

export function PanelSection({ title, count, defaultOpen = false, children }: { title: string; count?: number; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details className="sh-acc" open={defaultOpen}>
      <summary>
        <Icon name="chevron" size={16} />
        {title}
        {count !== undefined && <span className="sh-acc-count">{count}</span>}
      </summary>
      <div className="sh-acc-body">{children}</div>
    </details>
  );
}

export function PanelGroupLabel({ children }: { children: ReactNode }) {
  return <div className="sh-group-label">{children}</div>;
}

interface PanelOptionProps {
  title: string;
  desc?: string;
  count?: number;
  active?: boolean;
  swatch?: string;
  icon?: IconName;
  onClick?: () => void;
  /* Interrupteur affiché / masqué (ex. types de liens du graphe) : l'état « actif » reste clair. */
  toggle?: boolean;
}
/* Ligne pastille ronde + titre + description + compteur. Sans onClick, c'est une ligne de légende (non cliquable). */
export function PanelOption({ title, desc, count, active, swatch, icon, onClick, toggle }: PanelOptionProps) {
  const inner = (
    <>
      <span className="sh-opt-ic">
        {swatch ? <span className="sh-swatch" style={{ background: swatch }} /> : icon ? <Icon name={icon} size={18} /> : null}
      </span>
      <span className="sh-opt-text">
        <b>{title}</b>
        {desc && <small>{desc}</small>}
      </span>
      {count !== undefined && <span className="sh-opt-n">{count}</span>}
    </>
  );
  return onClick ? (
    <button
      type="button"
      className={`sh-opt${toggle ? ' sh-opt--toggle' : ''}${active ? ' is-on' : ''}`}
      onClick={onClick}
      aria-pressed={!!active}
      title={toggle ? (active ? 'Shown — click to hide' : 'Hidden — click to show') : undefined}
    >
      {inner}
    </button>
  ) : (
    <div className="sh-opt sh-opt--static">{inner}</div>
  );
}

export function PanelFootButton({ children, badge, onClick, disabled }: { children: ReactNode; badge?: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="sh-foot-btn" onClick={onClick} disabled={disabled}>
      {children}
      {badge !== undefined && badge !== null && <span className="sh-foot-badge">{badge}</span>}
    </button>
  );
}

/* ---------- Filtres actifs (pastilles retirables sous le titre) ---------- */
export function ActiveChips({ chips }: { chips: { key: string; label: string; onRemove: () => void }[] }) {
  if (chips.length === 0) return null;
  return (
    <div className="sh-chips">
      {chips.map((c) => (
        <span key={c.key} className="sh-chip">
          {c.label}
          <button type="button" onClick={c.onRemove} aria-label={`Remove filter ${c.label}`}>
            <Icon name="x" size={13} />
          </button>
        </span>
      ))}
    </div>
  );
}

/* ---------- Barre flottante ---------- */
export function DockPrimary({ icon = 'plus', children, onClick, to }: { icon?: IconName; children: ReactNode; onClick?: () => void; to?: string }) {
  const inner = (
    <>
      <span className="sh-run-ic">
        <Icon name={icon} size={20} />
      </span>
      <span className="sh-run-label">{children}</span>
    </>
  );
  return to ? (
    <Link to={to} className="sh-run">{inner}</Link>
  ) : (
    <button type="button" className="sh-run" onClick={onClick}>{inner}</button>
  );
}

export function DockBar({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="sh-dockbar" role="toolbar" aria-label={label}>
      {children}
    </div>
  );
}

export function DockButton({ icon, label, to, onClick, active }: { icon: IconName; label: string; to?: string; onClick?: () => void; active?: boolean }) {
  const cls = `sh-db${active ? ' is-on' : ''}`;
  return to ? (
    <Link to={to} className={cls} aria-label={label} title={label} aria-current={active ? 'page' : undefined}>
      <Icon name={icon} size={20} />
    </Link>
  ) : (
    <button type="button" className={cls} onClick={onClick} aria-label={label} title={label}>
      <Icon name={icon} size={20} />
    </button>
  );
}

/* Barre de vues commune aux pages « collection » : cartes, graphe, carte, calendrier. */
export function ViewSwitcher({ current }: { current: 'cases' | 'graph' | 'map' | 'calendar' }) {
  return (
    <DockBar label="Views">
      <DockButton icon="grid" label="Cases" to="/cases" active={current === 'cases'} />
      <DockButton icon="share" label="Relations graph" to="/graph" active={current === 'graph'} />
      <DockButton icon="map" label="Map" to="/map" active={current === 'map'} />
      <DockButton icon="calendar" label="Calendar" to="/calendar" active={current === 'calendar'} />
    </DockBar>
  );
}

/* Date courte : « 24 Oct », ou « 24 Oct 2025 » hors de l'année en cours. */
export function compactDate(value: string): string {
  const d = new Date(value);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-GB', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}
