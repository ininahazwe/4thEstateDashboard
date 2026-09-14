import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import {
  CaseSummary,
  EditorialProject,
  MilestoneStatus,
  ProjectContributor,
  ProjectContributorRole,
  ProjectMilestone,
  ProjectStatus,
} from '../api/types';
import { NotificationsBell } from '../components/NotificationsBell';
import { useAuth } from '../auth/AuthContext';

const STATUS_LABELS: Record<ProjectStatus, string> = {
  pitch: 'Pitch',
  researching: 'Researching',
  writing: 'Writing',
  fact_check: 'Fact-check',
  editing: 'Editing',
  ready: 'Ready',
  published: 'Published',
};

const ROLE_LABELS: Record<ProjectContributorRole, string> = {
  lead_journalist: 'Lead journalist',
  editor: 'Editor',
  researcher: 'Researcher',
  photographer: 'Photographer',
};

const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  done: 'Done',
  skipped: 'Skipped',
};

export function EditorialProjectDetailPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [project, setProject] = useState<EditorialProject | null>(null);
  const [myCases, setMyCases] = useState<CaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showEditForm, setShowEditForm] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [showContributorForm, setShowContributorForm] = useState(false);
  const [contributorError, setContributorError] = useState<string | null>(null);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [showMilestoneForm, setShowMilestoneForm] = useState(false);
  const [milestoneError, setMilestoneError] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    try {
      const [projectData, casesData] = await Promise.all([
        api.get<EditorialProject>(`/editorial-projects/${projectId}`),
        api.get<CaseSummary[]>('/cases'),
      ]);
      setProject(projectData);
      setMyCases(casesData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load this editorial project');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const isLead = project?.myRole === 'lead_journalist';

  async function handleUpdate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const title = String(form.get('title') ?? '').trim();
    const targetPublication = String(form.get('targetPublication') ?? '').trim() || undefined;
    const targetDate = String(form.get('targetDate') ?? '').trim() || undefined;
    const status = String(form.get('status') ?? '') as ProjectStatus;
    if (!title) return;

    setEditError(null);
    try {
      const updated = await api.put<EditorialProject>(`/editorial-projects/${projectId}`, {
        title,
        targetPublication,
        targetDate,
        status,
      });
      setProject((prev) => (prev ? { ...prev, ...updated } : updated));
      setShowEditForm(false);
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'Unable to update this editorial project');
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this editorial project? Linked cases are not affected.')) return;
    try {
      await api.delete(`/editorial-projects/${projectId}`);
      navigate('/portfolio');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to delete this editorial project');
    }
  }

  async function handleAddContributor(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const email = String(form.get('email') ?? '').trim();
    const role = String(form.get('role') ?? '') as ProjectContributorRole;
    if (!email || !role) return;

    setContributorError(null);
    try {
      const contributors = await api.post<ProjectContributor[]>(`/editorial-projects/${projectId}/contributors`, {
        email,
        role,
      });
      setProject((prev) => (prev ? { ...prev, contributors } : prev));
      setShowContributorForm(false);
      formEl.reset();
    } catch (err) {
      setContributorError(err instanceof ApiError ? err.message : 'Unable to add this contributor');
    }
  }

  async function handleChangeContributorRole(userId: number, role: ProjectContributorRole) {
    setContributorError(null);
    try {
      const contributors = await api.put<ProjectContributor[]>(
        `/editorial-projects/${projectId}/contributors/${userId}`,
        { role }
      );
      setProject((prev) => (prev ? { ...prev, contributors } : prev));
    } catch (err) {
      setContributorError(err instanceof ApiError ? err.message : 'Unable to change this role');
      loadAll();
    }
  }

  async function handleRemoveContributor(userId: number) {
    if (!window.confirm('Remove this contributor from the editorial project?')) return;
    setContributorError(null);
    try {
      await api.delete(`/editorial-projects/${projectId}/contributors/${userId}`);
      setProject((prev) =>
        prev ? { ...prev, contributors: prev.contributors?.filter((c) => c.userId !== userId) } : prev
      );
    } catch (err) {
      setContributorError(err instanceof ApiError ? err.message : 'Unable to remove this contributor');
    }
  }

  async function handleLinkCase(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const caseId = Number(form.get('caseId'));
    if (!caseId) return;

    setLinkError(null);
    try {
      const linkedCases = await api.post<EditorialProject['linkedCases']>(
        `/editorial-projects/${projectId}/cases`,
        { caseId }
      );
      setProject((prev) => (prev ? { ...prev, linkedCases } : prev));
      setShowLinkForm(false);
      formEl.reset();
    } catch (err) {
      setLinkError(err instanceof ApiError ? err.message : 'Unable to link this case');
    }
  }

  async function handleUnlinkCase(caseId: number) {
    if (!window.confirm('Unlink this case from the editorial project?')) return;
    setLinkError(null);
    try {
      await api.delete(`/editorial-projects/${projectId}/cases/${caseId}`);
      setProject((prev) =>
        prev ? { ...prev, linkedCases: prev.linkedCases?.filter((c) => c.id !== caseId) } : prev
      );
    } catch (err) {
      setLinkError(err instanceof ApiError ? err.message : 'Unable to unlink this case');
    }
  }

  async function handleCreateMilestone(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const name = String(form.get('name') ?? '').trim();
    const dueDate = String(form.get('dueDate') ?? '').trim() || undefined;
    if (!name) return;

    setMilestoneError(null);
    try {
      const milestones = await api.post<ProjectMilestone[]>(`/editorial-projects/${projectId}/milestones`, {
        name,
        dueDate,
      });
      setProject((prev) => (prev ? { ...prev, milestones } : prev));
      setShowMilestoneForm(false);
      formEl.reset();
    } catch (err) {
      setMilestoneError(err instanceof ApiError ? err.message : 'Unable to create this milestone');
    }
  }

  async function handleChangeMilestoneStatus(milestoneId: number, status: MilestoneStatus) {
    setMilestoneError(null);
    try {
      const milestones = await api.put<ProjectMilestone[]>(
        `/editorial-projects/${projectId}/milestones/${milestoneId}`,
        { status }
      );
      setProject((prev) => (prev ? { ...prev, milestones } : prev));
    } catch (err) {
      setMilestoneError(err instanceof ApiError ? err.message : 'Unable to update this milestone');
      loadAll();
    }
  }

  async function handleDeleteMilestone(milestoneId: number) {
    if (!window.confirm('Delete this milestone?')) return;
    setMilestoneError(null);
    try {
      await api.delete(`/editorial-projects/${projectId}/milestones/${milestoneId}`);
      setProject((prev) =>
        prev ? { ...prev, milestones: prev.milestones?.filter((m) => m.id !== milestoneId) } : prev
      );
    } catch (err) {
      setMilestoneError(err instanceof ApiError ? err.message : 'Unable to delete this milestone');
    }
  }

  if (loading) {
    return (
      <div className="page">
        <p>Loading...</p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="page">
        <p className="form-error">{error ?? 'Editorial project not found'}</p>
        <Link to="/portfolio" className="back-link">&larr; Portfolio</Link>
      </div>
    );
  }

  const linkableCases = myCases.filter((c) => !project.linkedCases?.some((lc) => lc.id === c.id));

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>{project.title}</h1>
          <Link to="/portfolio" className="back-link">
            &larr; Portfolio
          </Link>
        </div>
        <div className="page-header-actions">
          <NotificationsBell />
          <span className="current-user">{user?.fullName}</span>
          <button onClick={logout} className="btn-secondary">Sign out</button>
        </div>
      </header>

      <div className="page-toolbar">
        <span className={`badge badge-project-status-${project.status}`}>{STATUS_LABELS[project.status]}</span>
        <div className="portfolio-detail-actions">
          <button onClick={() => setShowEditForm((v) => !v)} className="btn-secondary">
            {showEditForm ? 'Cancel' : 'Edit'}
          </button>
          {isLead && (
            <button onClick={handleDelete} className="btn-danger-small">
              Delete
            </button>
          )}
        </div>
      </div>

      {showEditForm && (
        <form className="inline-form" onSubmit={handleUpdate}>
          <input name="title" defaultValue={project.title} required placeholder="Project title" />
          <input
            name="targetPublication"
            defaultValue={project.targetPublication ?? ''}
            placeholder="Target publication (outlet)"
          />
          <input name="targetDate" type="date" defaultValue={project.targetDate?.slice(0, 10) ?? ''} />
          <select name="status" defaultValue={project.status}>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <button type="submit" className="btn-primary">Save</button>
        </form>
      )}
      {editError && <p className="form-error">{editError}</p>}

      {project.targetPublication && <p className="portfolio-card-meta">Target publication: {project.targetPublication}</p>}
      {project.targetDate && (
        <p className="portfolio-card-meta">
          Target date: {new Date(project.targetDate).toLocaleDateString('en-US')}
        </p>
      )}

      <div className="page-toolbar">
        <h2>Linked cases</h2>
        <button onClick={() => setShowLinkForm((v) => !v)} className="btn-secondary">
          {showLinkForm ? 'Cancel' : '+ Link a case'}
        </button>
      </div>

      {showLinkForm && (
        <form className="inline-form" onSubmit={handleLinkCase}>
          <select name="caseId" required defaultValue="">
            <option value="" disabled>Choose one of your cases...</option>
            {linkableCases.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
          <button type="submit" className="btn-primary">Link</button>
        </form>
      )}
      {linkError && <p className="form-error">{linkError}</p>}

      {!project.linkedCases || project.linkedCases.length === 0 ? (
        <p className="empty-state">No linked cases yet.</p>
      ) : (
        <ul className="contributor-list">
          {project.linkedCases.map((c) => (
            <li key={c.id} className="contributor-row">
              <div className="contributor-identity">
                <Link to={`/cases/${c.id}`}>
                  <strong>{c.title}</strong>
                </Link>
                <span className="contributor-email">{c.status} · {c.sensitivity}</span>
              </div>
              <div className="contributor-actions">
                <button type="button" className="btn-danger-small" onClick={() => handleUnlinkCase(c.id)}>
                  Unlink
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="page-toolbar">
        <h2>Milestones</h2>
        <button onClick={() => setShowMilestoneForm((v) => !v)} className="btn-secondary">
          {showMilestoneForm ? 'Cancel' : '+ Add milestone'}
        </button>
      </div>

      {showMilestoneForm && (
        <form className="inline-form" onSubmit={handleCreateMilestone}>
          <input name="name" placeholder="Milestone (e.g. First draft)" required />
          <input name="dueDate" type="date" />
          <button type="submit" className="btn-primary">Add</button>
        </form>
      )}
      {milestoneError && <p className="form-error">{milestoneError}</p>}

      {!project.milestones || project.milestones.length === 0 ? (
        <p className="empty-state">No milestones yet.</p>
      ) : (
        <ul className="contributor-list">
          {project.milestones.map((m) => (
            <li key={m.id} className="contributor-row">
              <div className="contributor-identity">
                <strong>{m.name}</strong>
                {m.dueDate && (
                  <span className="contributor-email">Due {new Date(m.dueDate).toLocaleDateString('en-US')}</span>
                )}
              </div>
              <div className="contributor-actions">
                <select
                  value={m.status}
                  onChange={(e) => handleChangeMilestoneStatus(m.id, e.target.value as MilestoneStatus)}
                >
                  {Object.entries(MILESTONE_STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <button type="button" className="btn-danger-small" onClick={() => handleDeleteMilestone(m.id)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="page-toolbar">
        <h2>Contributors</h2>
        {isLead && (
          <button onClick={() => setShowContributorForm((v) => !v)} className="btn-secondary">
            {showContributorForm ? 'Cancel' : '+ Add contributor'}
          </button>
        )}
      </div>

      {isLead && showContributorForm && (
        <form className="inline-form" onSubmit={handleAddContributor}>
          <input name="email" type="email" required placeholder="Contributor's @mfwa.org email" />
          <select name="role" required defaultValue="researcher">
            {Object.entries(ROLE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <button type="submit" className="btn-primary">Add</button>
        </form>
      )}
      {contributorError && <p className="form-error">{contributorError}</p>}

      {!project.contributors || project.contributors.length === 0 ? (
        <p className="empty-state">No contributors.</p>
      ) : (
        <ul className="contributor-list">
          {project.contributors.map((c) => (
            <li key={c.userId} className="contributor-row">
              <div className="contributor-identity">
                <strong>{c.fullName}</strong>
                <span className="contributor-email">{c.email}</span>
              </div>
              {isLead ? (
                <div className="contributor-actions">
                  <select
                    value={c.role}
                    onChange={(e) => handleChangeContributorRole(c.userId, e.target.value as ProjectContributorRole)}
                  >
                    {Object.entries(ROLE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn-danger-small"
                    onClick={() => handleRemoveContributor(c.userId)}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <span className="badge">{ROLE_LABELS[c.role]}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
