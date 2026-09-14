import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { Contact } from '../api/types';
import { ContactSensitivityBadge } from '../components/StatusBadge';
import { AppShell } from '../components/AppShell';

interface ContactFormValues {
  fullName: string;
  email?: string;
  phone?: string;
  organization?: string;
  roleOrTitle?: string;
  sensitivity: Contact['sensitivity'];
  reliability?: number;
  notes?: string;
  privateNotes?: string;
}

function readContactForm(formEl: HTMLFormElement): ContactFormValues {
  const form = new FormData(formEl);
  const reliabilityRaw = String(form.get('reliability') ?? '').trim();
  return {
    fullName: String(form.get('fullName') ?? '').trim(),
    email: String(form.get('email') ?? '').trim() || undefined,
    phone: String(form.get('phone') ?? '').trim() || undefined,
    organization: String(form.get('organization') ?? '').trim() || undefined,
    roleOrTitle: String(form.get('roleOrTitle') ?? '').trim() || undefined,
    sensitivity: (String(form.get('sensitivity') ?? 'none') as Contact['sensitivity']),
    reliability: reliabilityRaw ? Number(reliabilityRaw) : undefined,
    notes: String(form.get('notes') ?? '').trim() || undefined,
    privateNotes: String(form.get('privateNotes') ?? '').trim() || undefined,
  };
}

function ContactFields({ contact }: { contact?: Contact }) {
  return (
    <>
      <input name="fullName" placeholder="Full name" required defaultValue={contact?.fullName ?? ''} />
      <input name="email" type="email" placeholder="Email" defaultValue={contact?.email ?? ''} />
      <input name="phone" placeholder="Phone" defaultValue={contact?.phone ?? ''} />
      <input name="organization" placeholder="Organization" defaultValue={contact?.organization ?? ''} />
      <input name="roleOrTitle" placeholder="Role / title" defaultValue={contact?.roleOrTitle ?? ''} />
      <select name="sensitivity" defaultValue={contact?.sensitivity ?? 'none'}>
        <option value="none">None</option>
        <option value="protected_witness">Protected witness</option>
        <option value="at_risk_source">At-risk source</option>
      </select>
      <input
        name="reliability"
        type="number"
        min={1}
        max={5}
        placeholder="Reliability (1-5)"
        defaultValue={contact?.reliability ?? ''}
      />
      <textarea name="notes" placeholder="General notes" defaultValue={contact?.notes ?? ''} />
      <textarea
        name="privateNotes"
        placeholder="Private notes (sensitive)"
        defaultValue={contact?.privateNotes ?? ''}
      />
    </>
  );
}

const PAGE_SIZE = 24;

const AVATAR_PALETTE = [
  { bg: '#dff3ea', fg: '#116149' },
  { bg: '#111114', fg: '#ffffff' },
  { bg: '#dcecfb', fg: '#1d4c8a' },
  { bg: '#f4e6d8', fg: '#8a5a1d' },
  { bg: '#ece3fb', fg: '#5b3a9e' },
  { bg: '#fbe3e6', fg: '#a13a45' },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const second = parts.length > 1 ? parts[1][0] ?? '' : '';
  return (first + second).toUpperCase();
}

function avatarStyle(name: string): { background: string; color: string } {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const swatch = AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
  return { background: swatch.bg, color: swatch.fg };
}

export function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  const [page, setPage] = useState(1);

  async function loadContacts(query?: string) {
    setLoading(true);
    try {
      const path = query ? `/contacts?search=${encodeURIComponent(query)}` : '/contacts';
      const data = await api.get<Contact[]>(path);
      setContacts(data);
      setPage(1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load contacts');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadContacts();
  }, []);

  function handleSearchSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    loadContacts(search || undefined);
  }

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const values = readContactForm(formEl);
    if (!values.fullName) return;

    try {
      await api.post('/contacts', values);
      setShowForm(false);
      formEl.reset();
      loadContacts(search || undefined);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to create the contact');
    }
  }

  async function handleUpdate(e: FormEvent<HTMLFormElement>, contactId: number) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const values = readContactForm(formEl);
    if (!values.fullName) return;

    try {
      await api.put(`/contacts/${contactId}`, values);
      setEditingId(null);
      loadContacts(search || undefined);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to update the contact');
    }
  }

  async function handleDelete(contactId: number) {
    if (!window.confirm('Delete this contact?')) return;
    try {
      await api.delete(`/contacts/${contactId}`);
      setContacts((prev) => prev.filter((c) => c.id !== contactId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to delete the contact');
    }
  }

  const totalPages = Math.max(1, Math.ceil(contacts.length / PAGE_SIZE));
  const pageItems = useMemo(
    () => contacts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [contacts, page]
  );

  return (
    <AppShell activeRail="contacts">
      <header className="page-header">
        <div>
          <h1>Contacts</h1>
          <Link to="/cases" className="back-link">
            &larr; My cases
          </Link>
        </div>
      </header>

      <form className="inline-form" onSubmit={handleSearchSubmit}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search contacts..."
        />
        <button type="submit" className="btn-secondary">Search</button>
      </form>

      <div className="page-toolbar">
        <h2>
          Directory
          {contacts.length > 0 && <span className="dash-count-chip">{contacts.length}</span>}
        </h2>
        <div className="dash-toolbar-actions">
          <div className="dash-view-toggle">
            <button
              type="button"
              className={viewMode === 'cards' ? 'is-active' : ''}
              onClick={() => setViewMode('cards')}
            >
              Cards
            </button>
            <button
              type="button"
              className={viewMode === 'list' ? 'is-active' : ''}
              onClick={() => setViewMode('list')}
            >
              List
            </button>
          </div>
          <button onClick={() => setShowForm((v) => !v)} className="btn-primary">
            {showForm ? 'Cancel' : '+ New contact'}
          </button>
        </div>
      </div>

      {showForm && (
        <form className="inline-form contact-form" onSubmit={handleCreate}>
          <ContactFields />
          <button type="submit" className="btn-primary">Create</button>
        </form>
      )}

      {error && <p className="form-error">{error}</p>}

      {loading ? (
        <p>Loading...</p>
      ) : contacts.length === 0 ? (
        <p className="empty-state">No contacts yet.</p>
      ) : (
        <>
          {viewMode === 'cards' ? (
            <div className="contact-cards">
              {pageItems.map((c) =>
                editingId === c.id ? (
                  <div key={c.id} className="contact-card contact-card-editing">
                    <form className="inline-form contact-form" onSubmit={(e) => handleUpdate(e, c.id)}>
                      <ContactFields contact={c} />
                      <div className="contact-edit-actions">
                        <button type="submit" className="btn-primary">Save</button>
                        <button type="button" className="btn-secondary" onClick={() => setEditingId(null)}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                ) : (
                  <div key={c.id} className="contact-card">
                    <div className="contact-card-top">
                      <span className="dash-avatar" style={avatarStyle(c.fullName)}>
                        {initials(c.fullName)}
                      </span>
                      <div className="contact-card-heading">
                        <strong>{c.fullName}</strong>
                        {c.roleOrTitle && <span className="contact-card-role">{c.roleOrTitle}</span>}
                      </div>
                    </div>
                    {c.organization && <div className="contact-card-org">{c.organization}</div>}
                    <div className="contact-meta">
                      <ContactSensitivityBadge sensitivity={c.sensitivity} />
                      {c.reliability != null && <span className="badge">Reliability {c.reliability}/5</span>}
                    </div>
                    <div className="contributor-actions">
                      <button type="button" className="btn-secondary" onClick={() => setEditingId(c.id)}>
                        Edit
                      </button>
                      <button type="button" className="btn-danger-small" onClick={() => handleDelete(c.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>
          ) : (
            <ul className="contact-list">
              {pageItems.map((c) =>
                editingId === c.id ? (
                  <li key={c.id} className="contact-row contact-row-editing">
                    <form className="inline-form contact-form" onSubmit={(e) => handleUpdate(e, c.id)}>
                      <ContactFields contact={c} />
                      <div className="contact-edit-actions">
                        <button type="submit" className="btn-primary">Save</button>
                        <button type="button" className="btn-secondary" onClick={() => setEditingId(null)}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  </li>
                ) : (
                  <li key={c.id} className="contact-row">
                    <span className="dash-avatar dash-avatar-sm" style={avatarStyle(c.fullName)}>
                      {initials(c.fullName)}
                    </span>
                    <div className="contact-identity">
                      <strong>{c.fullName}</strong>
                      {(c.roleOrTitle || c.organization) && (
                        <span className="contributor-email">
                          {[c.roleOrTitle, c.organization].filter(Boolean).join(' · ')}
                        </span>
                      )}
                      {(c.email || c.phone) && (
                        <span className="contributor-email">
                          {[c.email, c.phone].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </div>
                    <div className="contact-meta">
                      <ContactSensitivityBadge sensitivity={c.sensitivity} />
                      {c.reliability != null && <span className="badge">Reliability {c.reliability}/5</span>}
                    </div>
                    <div className="contributor-actions">
                      <button type="button" className="btn-secondary" onClick={() => setEditingId(c.id)}>
                        Edit
                      </button>
                      <button type="button" className="btn-danger-small" onClick={() => handleDelete(c.id)}>
                        Delete
                      </button>
                    </div>
                  </li>
                )
              )}
            </ul>
          )}

          {totalPages > 1 && (
            <div className="dash-pagination">
              <button
                type="button"
                className="btn-secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span className="dash-pagination-label">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                className="btn-secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
