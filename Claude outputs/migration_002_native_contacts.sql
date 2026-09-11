-- =====================================================================
-- Migration 002 — Native contacts directory
--
-- Context: the original schema (schema.sql) assumed contacts lived in a
-- separate "Contact Platform" and only stored a bare external id. That's
-- not the case: this platform manages its OWN contacts directory for
-- journalists' investigations, with no external system involved. This
-- migration replaces the placeholder tables with a real `contacts` table
-- and points case_contacts / event_contacts at it with proper foreign
-- keys.
--
-- Safe to run now because no real data has been entered yet (case_contacts,
-- event_contacts and contact_investigation_profiles are still empty). Run
-- this in phpMyAdmin -> your database -> SQL tab, after schema.sql.
-- =====================================================================

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS event_contacts;
DROP TABLE IF EXISTS case_contacts;
DROP TABLE IF EXISTS contact_investigation_profiles;

-- ---------------------------------------------------------------------
-- contacts — the journalists' own contact directory (brief §3.3, adapted:
-- no external Contact Platform — sensitivity/reliability/private_notes
-- live directly on the contact record).
-- ---------------------------------------------------------------------
CREATE TABLE contacts (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name       VARCHAR(255) NOT NULL,
  email           VARCHAR(190) NULL,
  phone           VARCHAR(50) NULL,
  organization    VARCHAR(255) NULL,
  role_or_title   VARCHAR(150) NULL,
  notes           TEXT NULL,                                -- general background notes
  sensitivity     ENUM('none','protected_witness','at_risk_source') NOT NULL DEFAULT 'none',
  reliability     TINYINT UNSIGNED NULL,                     -- 1-5 scale
  private_notes   TEXT NULL,
  created_by      INT UNSIGNED NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at      TIMESTAMP NULL,
  CONSTRAINT fk_contacts_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT chk_contacts_reliability CHECK (reliability IS NULL OR reliability BETWEEN 1 AND 5),
  INDEX idx_contacts_name (full_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- case_contacts — pivot: contacts linked to a case
-- ---------------------------------------------------------------------
CREATE TABLE case_contacts (
  case_id     INT UNSIGNED NOT NULL,
  contact_id  INT UNSIGNED NOT NULL,
  added_by    INT UNSIGNED NOT NULL,
  added_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (case_id, contact_id),
  CONSTRAINT fk_casecontacts_case    FOREIGN KEY (case_id)    REFERENCES cases(id)    ON DELETE CASCADE,
  CONSTRAINT fk_casecontacts_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
  CONSTRAINT fk_casecontacts_added_by FOREIGN KEY (added_by)  REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- event_contacts — pivot: contacts involved in a specific event
-- ---------------------------------------------------------------------
CREATE TABLE event_contacts (
  event_id    INT UNSIGNED NOT NULL,
  contact_id  INT UNSIGNED NOT NULL,
  PRIMARY KEY (event_id, contact_id),
  CONSTRAINT fk_eventcontacts_event   FOREIGN KEY (event_id)   REFERENCES investigation_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_eventcontacts_contact FOREIGN KEY (contact_id) REFERENCES contacts(id)             ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
