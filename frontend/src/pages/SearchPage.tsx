import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, requestBlob } from '../api/client';
import { EventType, Sensitivity, SearchResourceType, SearchResult } from '../api/types';
import { SensitivityBadge } from '../components/StatusBadge';
import { NotificationsBell } from '../components/NotificationsBell';
import { useAuth } from '../auth/AuthContext';

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

const RESOURCE_TYPE_LABELS: Record<SearchResourceType, string> = {
  case: 'Case',
  event: 'Event',
  comment: 'Comment',
  document: 'Document',
};

const ALL_RESOURCE_TYPES: SearchResourceType[] = ['case', 'event', 'comment', 'document'];

interface Filters {
  q: string;
  sensitivity: Sensitivity | '';
  eventType: EventType | '';
  contributor: string;
  dateFrom: string;
  dateTo: string;
  types: SearchResourceType[];
}

const EMPTY_FILTERS: Filters = {
  q: '',
  sensitivity: '',
  eventType: '',
  contributor: '',
  dateFrom: '',
  dateTo: '',
  types: ALL_RESOURCE_TYPES,
};

function buildQueryString(filters: Filters): string {
  const params = new URLSearchParams();
  params.set('q', filters.q);
  if (filters.sensitivity) params.set('sensitivity', filters.sensitivity);
  if (filters.eventType) params.set('eventType', filters.eventType);
  if (filters.contributor) params.set('contributor', filters.contributor);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.types.length && filters.types.length < ALL_RESOURCE_TYPES.length) {
    params.set('types', filters.types.join(','));
  }
  return params.toString();
}

export function SearchPage() {
  const { user, logout } = useAuth();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [lastQueryString, setLastQueryString] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  function toggleType(type: SearchResourceType) {
    setFilters((prev) => {
      const has = prev.types.includes(type);
      const next = has ? prev.types.filter((t) => t !== type) : [...prev.types, type];
      // Never allow an empty selection — that would mean "search nothing".
      return { ...prev, types: next.length ? next : ALL_RESOURCE_TYPES };
    });
  }

  async function handleSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (filters.q.trim().length < 2) {
      setError('Enter at least 2 characters to search.');
      return;
    }

    setLoading(true);
    setError(null);
    setSearched(true);
    const qs = buildQueryString(filters);
    try {
      const data = await api.get<SearchResult[]>(`/search?${qs}`);
      setResults(data);
      setLastQueryString(qs);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleExport() {
    if (!lastQueryString) return;
    try {
      const { blob, filename } = await requestBlob(`/search/export?${lastQueryString}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'search-results.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to export these results');
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Search</h1>
          <Link to="/cases" className="back-link">
            &larr; My cases
          </Link>
        </div>
        <div className="page-header-actions">
          <NotificationsBell />
          <span className="current-user">{user?.fullName}</span>
          <button onClick={logout} className="btn-secondary">Sign out</button>
        </div>
      </header>

      <form className="inline-form search-form" onSubmit={handleSearch}>
        <input
          value={filters.q}
          onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value }))}
          placeholder="Search cases, events, comments, documents..."
          autoFocus
        />
        <button type="submit" className="btn-primary">Search</button>
      </form>

      <div className="search-filters">
        <div className="search-filter-types">
          {ALL_RESOURCE_TYPES.map((type) => (
            <label key={type} className="search-type-checkbox">
              <input
                type="checkbox"
                checked={filters.types.includes(type)}
                onChange={() => toggleType(type)}
              />
              {RESOURCE_TYPE_LABELS[type]}
            </label>
          ))}
        </div>

        <select
          value={filters.sensitivity}
          onChange={(e) => setFilters((prev) => ({ ...prev, sensitivity: e.target.value as Sensitivity | '' }))}
        >
          <option value="">Any sensitivity</option>
          <option value="public">Public</option>
          <option value="internal">Internal</option>
          <option value="confidential">Confidential</option>
          <option value="highly_sensitive">Highly sensitive</option>
        </select>

        <select
          value={filters.eventType}
          onChange={(e) => setFilters((prev) => ({ ...prev, eventType: e.target.value as EventType | '' }))}
        >
          <option value="">Any event type</option>
          {Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <input
          value={filters.contributor}
          onChange={(e) => setFilters((prev) => ({ ...prev, contributor: e.target.value }))}
          placeholder="Contributor name or email"
        />

        <label className="search-date-label">
          From
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
          />
        </label>
        <label className="search-date-label">
          To
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
          />
        </label>
      </div>

      {error && <p className="form-error">{error}</p>}

      {searched && !loading && (
        <div className="page-toolbar">
          <h2>
            {results.length} result{results.length === 1 ? '' : 's'}
          </h2>
          {results.length > 0 && (
            <button type="button" className="btn-secondary" onClick={handleExport}>
              Export CSV
            </button>
          )}
        </div>
      )}

      {loading ? (
        <p>Searching...</p>
      ) : searched && results.length === 0 ? (
        <p className="empty-state">No matches.</p>
      ) : (
        <ul className="search-result-list">
          {results.map((r) => (
            <li key={`${r.resourceType}-${r.resourceId}`} className="search-result-row">
              <div className="search-result-main">
                <span className={`badge badge-resource-${r.resourceType}`}>
                  {RESOURCE_TYPE_LABELS[r.resourceType]}
                </span>
                <Link to={`/cases/${r.caseId}`} className="search-result-title">
                  {r.title}
                </Link>
                <span className="search-result-case">in {r.caseTitle}</span>
              </div>
              {r.snippet && <p className="search-result-snippet">{r.snippet}</p>}
              <div className="search-result-meta">
                {r.sensitivity && <SensitivityBadge sensitivity={r.sensitivity} />}
                <span className="search-result-date">{new Date(r.date).toLocaleDateString()}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
