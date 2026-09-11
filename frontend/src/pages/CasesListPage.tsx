import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { CaseSummary, Sensitivity } from '../api/types';
import { SensitivityBadge, StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../auth/AuthContext';

export function CasesListPage() {
  const { user, logout } = useAuth();
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function loadCases() {
    setLoading(true);
    try {
      const data = await api.get<CaseSummary[]>('/cases');
      setCases(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de charger les dossiers');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCases();
  }, []);

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Capture the form element before the first await: React nulls out
    // event.currentTarget once the synthetic event finishes dispatching,
    // which happens synchronously — by the time an awaited call resolves,
    // e.currentTarget is already null and .reset() on it throws, landing
    // in the catch block below even though the POST itself succeeded.
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const title = String(form.get('title') ?? '').trim();
    const sensitivity = String(form.get('sensitivity') ?? 'internal') as Sensitivity;
    if (!title) return;

    try {
      await api.post('/cases', { title, sensitivity });
      setShowForm(false);
      formEl.reset();
      loadCases();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Création impossible');
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Mes dossiers d&apos;enquête</h1>
        <div className="page-header-actions">
          <span className="current-user">{user?.fullName}</span>
          <button onClick={logout} className="btn-secondary">Déconnexion</button>
        </div>
      </header>

      <div className="page-toolbar">
        <button onClick={() => setShowForm((v) => !v)} className="btn-primary">
          {showForm ? 'Annuler' : '+ Nouveau dossier'}
        </button>
      </div>

      {showForm && (
        <form className="inline-form" onSubmit={handleCreate}>
          <input name="title" placeholder="Titre du dossier" required />
          <select name="sensitivity" defaultValue="internal">
            <option value="public">Public</option>
            <option value="internal">Interne</option>
            <option value="confidential">Confidentiel</option>
            <option value="highly_sensitive">Très sensible</option>
          </select>
          <button type="submit" className="btn-primary">Créer</button>
        </form>
      )}

      {error && <p className="form-error">{error}</p>}

      {loading ? (
        <p>Chargement...</p>
      ) : cases.length === 0 ? (
        <p className="empty-state">Aucun dossier pour l&apos;instant. Crée le premier ci-dessus.</p>
      ) : (
        <div className="case-grid">
          {cases.map((c) => (
            <Link to={`/cases/${c.id}`} key={c.id} className="case-card">
              <h2>{c.title}</h2>
              <div className="case-card-badges">
                <StatusBadge status={c.status} />
                <SensitivityBadge sensitivity={c.sensitivity} />
              </div>
              {c.description && <p className="case-card-desc">{c.description}</p>}
              <p className="case-card-meta">Mis à jour le {new Date(c.updatedAt).toLocaleDateString('fr-FR')}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
