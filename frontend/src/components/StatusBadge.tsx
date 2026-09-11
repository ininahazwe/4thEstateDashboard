import { CaseStatus, Sensitivity } from '../api/types';

const STATUS_LABELS: Record<CaseStatus, string> = {
  preparing: 'En préparation',
  in_progress: 'En cours',
  paused: 'En pause',
  published: 'Publié',
  closed: 'Clôturé',
};

const SENSITIVITY_LABELS: Record<Sensitivity, string> = {
  public: 'Public',
  internal: 'Interne',
  confidential: 'Confidentiel',
  highly_sensitive: 'Très sensible',
};

export function StatusBadge({ status }: { status: CaseStatus }) {
  return <span className={`badge badge-status-${status}`}>{STATUS_LABELS[status]}</span>;
}

export function SensitivityBadge({ sensitivity }: { sensitivity: Sensitivity }) {
  return <span className={`badge badge-sensitivity-${sensitivity}`}>{SENSITIVITY_LABELS[sensitivity]}</span>;
}
