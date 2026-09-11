import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { CaseSummary, EventType, InvestigationEvent } from '../api/types';
import { SensitivityBadge, StatusBadge } from '../components/StatusBadge';

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  interview: 'Entrevue',
  meeting: 'Rencontre',
  call: 'Appel',
  field_visit: 'Visite terrain',
  document_analysis: 'Analyse de document',
  key_discovery: 'Découverte clé',
  dead_end: 'Impasse',
  pivot: 'Pivot',
  publication: 'Publication',
};

export function CaseDetailPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const [caseItem, setCaseItem] = useState<CaseSummary | null>(null);
  const [events, setEvents] = useState<InvestigationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function loadAll() {
    if (!caseId) return;
    setLoading(true);
    try {
      const [caseData, eventsData] = await Promise.all([
        api.get<CaseSummary>(`/cases/${caseId}`),
        api.get<InvestigationEvent[]>(`/cases/${caseId}/events`),
      ]);
      setCaseItem(caseData);
      setEvents(eventsData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de charger le dossier');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  async function handleCreateEvent(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Same gotcha as CasesListPage.handleCreate: capture the form element
    // before the first await, since React nulls event.currentTarget once
    // the synthetic event finishes dispatching.
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const type = String(form.get('type') ?? '');
    const eventDateLocal = String(form.get('eventDate') ?? '');
    const reason = String(form.get('reason') ?? '');

    if (!type || !eventDateLocal) return;

    try {
      await api.post(`/cases/${caseId}/events`, {
        type,
        eventDate: new Date(eventDateLocal).toISOString(),
        reason: reason || undefined,
      });
      setShowForm(false);
      formEl.reset();
      loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible d'ajouter l'événement");
    }
  }

  if (loading) {
    return (
      <div className="page">
        <p>Chargement...</p>
      </div>
    );
  }

  if (!caseItem) {
    return (
      <div className="page">
        <p>Dossier introuvable.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <Link to="/cases" className="back-link">
        &larr; Tous les dossiers
      </Link>

      <header className="page-header">
        <div>
          <h1>{caseItem.title}</h1>
          <div className="case-card-badges">
            <StatusBadge status={caseItem.status} />
            <SensitivityBadge sensitivity={caseItem.sensitivity} />
          </div>
        </div>
      </header>

      {caseItem.description && <p>{caseItem.description}</p>}

      <div className="page-toolbar">
        <h2>Chronologie</h2>
        <button onClick={() => setShowForm((v) => !v)} className="btn-primary">
          {showForm ? 'Annuler' : '+ Ajouter un événement'}
        </button>
      </div>

      {showForm && (
        <form className="inline-form" onSubmit={handleCreateEvent}>
          <select name="type" required defaultValue="">
            <option value="" disabled>
              Type d&apos;événement
            </option>
            {Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input type="datetime-local" name="eventDate" required />
          <input name="reason" placeholder="Raison / contexte" />
          <button type="submit" className="btn-primary">
            Ajouter
          </button>
        </form>
      )}

      {error && <p className="form-error">{error}</p>}

      {events.length === 0 ? (
        <p className="empty-state">Aucun événement pour l&apos;instant.</p>
      ) : (
        <ul className="timeline">
          {events.map((ev) => (
            <li key={ev.id} className="timeline-item">
              <div className="timeline-date">{new Date(ev.eventDate).toLocaleString('fr-FR')}</div>
              <div className="timeline-content">
                <strong>{EVENT_TYPE_LABELS[ev.type]}</strong>
                {ev.location && <span className="timeline-location"> · {ev.location}</span>}
                {ev.reason && <p>{ev.reason}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
