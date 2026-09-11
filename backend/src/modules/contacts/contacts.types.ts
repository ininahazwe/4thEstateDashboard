export type ContactSensitivity = 'none' | 'protected_witness' | 'at_risk_source';

export interface Contact {
  id: number;
  fullName: string;
  email: string | null;
  phone: string | null;
  organization: string | null;
  roleOrTitle: string | null;
  notes: string | null;
  sensitivity: ContactSensitivity;
  reliability: number | null;
  privateNotes: string | null;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
}
