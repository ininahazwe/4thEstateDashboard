import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { CaseStatus, CaseSummary, Sensitivity } from '../api/types';
import { AppShell } from '../components/AppShell';
import { PageHead, initials } from '../components/PageHead';
import { Icon } from '../components/icons';
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
  ViewSwitcher,
  compactDate,
} from '../components/Shell';

/* ============================================================
   Liste des dossiers — page d'accueil (/cases), maquette « canevas »
   validée par Yv (nov. 2026) :
   - cartes arrondies dont la teinte pastel = le statut ;
   - recherche + filtres (statut, sensibilité, thème, échéance)
     dans le panneau de droite, tous calculés côté client sur
     GET /cases (aucun nouvel endpoint) ;
   - « New case » dans la barre flottante et la colonne d'outils.
   L'ancien tableau de bord à widgets (activité de la semaine,
   jauges, prochaine échéance) a été retiré avec ce changement.
   ============================================================ */

const STATUS_LABELS: Record<CaseStatus, string> = {
  preparing: 'Preparing',
  in_progress: 'In progress',
  paused: 'Paused',
  published: 'Published',
  closed: 'Closed',
};
const STATUS_HINTS: Record<CaseStatus, string> = {
  preparing: 'Not started yet',
  in_progress: 'Active investigation',
  paused: 'Waiting on a source or document',
  published: 'Story is out',
  closed: 'Archived',
};
const STATUS_ORDER: CaseStatus[] = ['preparing', 'in_progress', 'paused', 'published', 'closed'];

const SENSITIVITY_LABELS: Record<Sensitivity, string> = {
  public: 'Public',
  internal: 'Internal',
  confidential: 'Confidential',
  highly_sensitive: 'Highly sensitive',
};
const SENSITIVITY_HINTS: Record<Sensitivity, string> = {
  public: 'Can be shared openly',
  internal: 'Team only',
  confidential: 'Restricted contributors',
  highly_sensitive: 'Protected source · two-factor required',
};
const SENSITIVITY_ORDER: Sensitivity[] = ['public', 'internal', 'confidential', 'highly_sensitive'];

type DueFilter = 'overdue' | 'soon' | 'none';
const DUE_LABELS: Record<DueFilter, string> = {
  overdue: 'Overdue',
  soon: 'Due in the next 30 days',
  none: 'No due date',
};
const DONE: CaseStatus[] = ['published', 'closed'];

function dueBucket(c: CaseSummary): DueFilter | null {
  if (!c.dueDate) return 'none';
  if (DONE.includes(c.status)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(c.dueDate);
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return 'overdue';
  if (days <= 30) return 'soon';
  return null;
}

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export function CasesListPage() {
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [statuses, setStatuses] = useState<Set<CaseStatus>>(new Set());
  const [sensitivities, setSensitivities] = useState<Set<Sensitivity>>(new Set());
  const [themes, setThemes] = useState<Set<number>>(new Set());
  const [dues, setDues] = useState<Set<DueFilter>>(new Set());

  async function loadAll() {
    setLoading(true);
    try {
      setCases(await api.get<CaseSummary[]>('/cases'));
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

  // Thèmes réellement utilisés par les dossiers visibles (tags de type « theme » en priorité).
  const themeOptions = useMemo(() => {
    const map = new Map<number, { id: number; name: string; count: number; isTheme: boolean }>();
    cases.forEach((c) =>
      c.tags?.forEach((t) => {
        const cur = map.get(t.id) ?? { id: t.id, name: t.name, count: 0, isTheme: t.type === 'theme' };
        cur.count += 1;
        map.set(t.id, cur);
      })
    );
    return [...map.values()].sort((a, b) => Number(b.isTheme) - Number(a.isTheme) || b.count - a.count);
  }, [cases]);

  const counts = useMemo(() => {
    const byStatus = new Map<CaseStatus, number>();
    const bySens = new Map<Sensitivity, number>();
    const byDue = new Map<DueFilter, number>();
    cases.forEach((c) => {
      byStatus.set(c.status, (byStatus.get(c.status) ?? 0) + 1);
      bySens.set(c.sensitivity, (bySens.get(c.sensitivity) ?? 0) + 1);
      const b = dueBucket(c);
      if (b) byDue.set(b, (byDue.get(b) ?? 0) + 1);
    });
    const active = cases.filter((c) => !DONE.includes(c.status)).length;
    return { byStatus, bySens, byDue, active, published: byStatus.get('published') ?? 0 };
  }, [cases]);

  const q = query.trim().toLowerCase();
  const visibleCases = useMemo(
    () =>
      cases
        .filter((c) => statuses.size === 0 || statuses.has(c.status))
        .filter((c) => sensitivities.size === 0 || sensitivities.has(c.sensitivity))
        .filter((c) => themes.size === 0 || c.tags?.some((t) => themes.has(t.id)))
        .filter((c) => {
          if (dues.size === 0) return true;
          const b = dueBucket(c);
          return b !== null && dues.has(b);
        })
        .filter(
          (c) =>
            !q ||
            [c.title, c.description ?? '', ...(c.tags?.map((t) => t.name) ?? [])].join(' ').toLowerCase().includes(q)
        ),
    [cases, statuses, sensitivities, themes, dues, q]
  );

  const chips = [
    ...[...statuses].map((s) => ({ key: `s-${s}`, label: `Status: ${STATUS_LABELS[s]}`, onRemove: () => setStatuses((p) => toggle(p, s)) })),
    ...[...sensitivities].map((s) => ({ key: `v-${s}`, label: SENSITIVITY_LABELS[s], onRemove: () => setSensitivities((p) => toggle(p, s)) })),
    ...[...themes].map((id) => ({
      key: `t-${id}`,
      label: `Theme: ${themeOptions.find((t) => t.id === id)?.name ?? id}`,
      onRemove: () => setThemes((p) => toggle(p, id)),
    })),
    ...[...dues].map((d) => ({ key: `d-${d}`, label: DUE_LABELS[d], onRemove: () => setDues((p) => toggle(p, d)) })),
    ...(q ? [{ key: 'q', label: `“${query.trim()}”`, onRemove: () => setQuery('') }] : []),
  ];

  function clearFilters() {
    setStatuses(new Set());
    setSensitivities(new Set());
    setThemes(new Set());
    setDues(new Set());
    setQuery('');
  }

  const panel = (
    <>
      <PanelSearch value={query} onChange={setQuery} placeholder="Search cases" />
      <Panel
        foot={
          <PanelFootButton onClick={clearFilters} disabled={chips.length === 0} badge={chips.length > 0 ? `${chips.length} active` : null}>
            Clear all filters
          </PanelFootButton>
        }
      >
        <PanelSection title="Status" count={cases.length} defaultOpen>
          {STATUS_ORDER.map((s) => (
            <PanelOption
              key={s}
              title={STATUS_LABELS[s]}
              desc={STATUS_HINTS[s]}
              swatch={`var(--st-${s})`}
              count={counts.byStatus.get(s) ?? 0}
              active={statuses.has(s)}
              onClick={() => setStatuses((p) => toggle(p, s))}
            />
          ))}
        </PanelSection>
        <PanelSection title="Sensitivity" count={SENSITIVITY_ORDER.length}>
          {SENSITIVITY_ORDER.map((s) => (
            <PanelOption
              key={s}
              title={SENSITIVITY_LABELS[s]}
              desc={SENSITIVITY_HINTS[s]}
              swatch={`var(--sensitivity-${s})`}
              count={counts.bySens.get(s) ?? 0}
              active={sensitivities.has(s)}
              onClick={() => setSensitivities((p) => toggle(p, s))}
            />
          ))}
        </PanelSection>
        <PanelSection title="Themes" count={themeOptions.length}>
          {themeOptions.length === 0 ? (
            <p className="sh-panel-empty">No theme is attached to a case yet. Add themes from a case page.</p>
          ) : (
            themeOptions.map((t) => (
              <PanelOption
                key={t.id}
                title={t.name}
                desc={t.isTheme ? 'Theme' : 'Tag'}
                icon="tag"
                count={t.count}
                active={themes.has(t.id)}
                onClick={() => setThemes((p) => toggle(p, t.id))}
              />
            ))
          )}
        </PanelSection>
        <PanelSection title="Due date">
          {(Object.keys(DUE_LABELS) as DueFilter[]).map((d) => (
            <PanelOption
              key={d}
              title={DUE_LABELS[d]}
              icon="calendar"
              count={counts.byDue.get(d) ?? 0}
              active={dues.has(d)}
              onClick={() => setDues((p) => toggle(p, d))}
            />
          ))}
        </PanelSection>
      </Panel>
    </>
  );

  const openForm = () => setShowForm(true);

  return (
    <AppShell
      activeNav="cases"
      activeRail="cases"
      panel={panel}
      tools={
        <>
          <ToolButton icon="plus" label="New case" onClick={openForm} active={showForm} />
          <ToolButton icon="search" label="Search everything" to="/search" />
          <ToolSep />
          <ToolButton icon="person" label="Add a contact" to="/contacts" />
          <ToolButton icon="layers" label="New editorial project" to="/portfolio" />
        </>
      }
      dock={
        <>
          <DockPrimary onClick={openForm}>New case</DockPrimary>
          <ViewSwitcher current="cases" />
        </>
      }
    >
      <PageHead
        title="Cases"
        kpis={
          loading
            ? undefined
            : [
                { value: cases.length, label: cases.length === 1 ? 'case' : 'cases' },
                { value: counts.active, label: 'active' },
                { value: counts.published, label: 'published' },
              ]
        }
      >
        <ActiveChips chips={chips} />
      </PageHead>

      {showForm && (
        <form className="sh-create" onSubmit={handleCreate}>
          <h2>New case</h2>
          <input name="title" placeholder="Case title" required autoFocus aria-label="Case title" />
          <select name="sensitivity" defaultValue="internal" aria-label="Sensitivity">
            {SENSITIVITY_ORDER.map((s) => (
              <option key={s} value={s}>{SENSITIVITY_LABELS[s]}</option>
            ))}
          </select>
          <button type="submit" className="btn-primary">Create</button>
          <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          {createError && <p className="form-error">{createError}</p>}
        </form>
      )}

      {error && <p className="form-error">{error}</p>}

      {loading ? (
        <div className="sh-nodes" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className="sh-node sh-node--skel" />
          ))}
        </div>
      ) : cases.length === 0 ? (
        <div className="sh-empty">
          <b>No cases yet</b>
          <span>Start your first investigation; it will appear here as a card.</span>
          <button type="button" className="btn-primary" onClick={openForm}>New case</button>
        </div>
      ) : visibleCases.length === 0 ? (
        <div className="sh-empty">
          <b>No case matches these filters</b>
          <span>{chips.length} filter{chips.length === 1 ? '' : 's'} applied.</span>
          <button type="button" className="btn-secondary" onClick={clearFilters}>Clear all filters</button>
        </div>
      ) : (
        <div className="sh-nodes">
          {visibleCases.map((c) => (
            <CaseNode key={c.id} item={c} />
          ))}
        </div>
      )}
    </AppShell>
  );
}

/* Carte dossier : teinte = statut ; pastille de sensibilité en pied ; cadenas si très sensible. */
function CaseNode({ item: c }: { item: CaseSummary }) {
  const theme = c.tags?.find((t) => t.type === 'theme') ?? c.tags?.[0];
  return (
    <Link to={`/cases/${c.id}`} className={`sh-node st-${c.status}`}>
      {c.sensitivity === 'highly_sensitive' && (
        <span className="sh-node-lock" title="Two-factor verification required">
          <Icon name="lock" size={15} />
        </span>
      )}
      <span className="sh-node-ic" aria-hidden="true">{initials(c.title)}</span>
      <b className="sh-node-title">{c.title}</b>
      <small className="sh-node-sub">
        {theme ? `${theme.name} · ` : ''}
        {STATUS_LABELS[c.status]}
      </small>
      <span className="sh-node-foot">
        <i className={`sh-sens is-${c.sensitivity}`} aria-hidden="true" />
        {SENSITIVITY_LABELS[c.sensitivity]}
        {c.dueDate && !DONE.includes(c.status) ? ` · Due ${compactDate(c.dueDate)}` : ` · Updated ${compactDate(c.updatedAt)}`}
      </span>
    </Link>
  );
}
