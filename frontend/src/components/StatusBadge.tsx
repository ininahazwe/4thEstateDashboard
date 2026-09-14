import { CaseStatus, Contact, Sensitivity } from '../api/types';

const STATUS_LABELS: Record<CaseStatus, string> = {
  preparing: 'Preparing',
  in_progress: 'In progress',
  paused: 'Paused',
  published: 'Published',
  closed: 'Closed',
};

const SENSITIVITY_LABELS: Record<Sensitivity, string> = {
  public: 'Public',
  internal: 'Internal',
  confidential: 'Confidential',
  highly_sensitive: 'Highly sensitive',
};

export function StatusBadge({ status }: { status: CaseStatus }) {
  return <span className={`badge badge-status-${status}`}>{STATUS_LABELS[status]}</span>;
}

export function SensitivityBadge({ sensitivity }: { sensitivity: Sensitivity }) {
  return <span className={`badge badge-sensitivity-${sensitivity}`}>{SENSITIVITY_LABELS[sensitivity]}</span>;
}

const CONTACT_SENSITIVITY_LABELS: Record<Contact['sensitivity'], string> = {
  none: 'No sensitivity',
  protected_witness: 'Protected witness',
  at_risk_source: 'At-risk source',
};

export function ContactSensitivityBadge({ sensitivity }: { sensitivity: Contact['sensitivity'] }) {
  return (
    <span className={`badge badge-contact-sensitivity-${sensitivity}`}>
      {CONTACT_SENSITIVITY_LABELS[sensitivity]}
    </span>
  );
}
