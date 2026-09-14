-- =====================================================================
-- Migration 006 — searchable document text (brief §5, "OCR")
--
-- Adds two columns to case_documents so uploaded photos/PDFs can have
-- their text extracted and made searchable (cross-case search, brief
-- §4.1). Nothing here is required for the app to keep working: existing
-- documents simply get ocr_status = 'not_applicable' and stay that way
-- until re-uploaded.
--
-- Note: encryption at rest for documents (also brief §5) needed NO
-- migration -- encrypted files are self-describing on disk (a magic
-- marker in the file header), so there's nothing to add to the database
-- for that part. See backend/README.md > "Chiffrement des documents au
-- repos" for how to turn it on (DOCUMENT_ENCRYPTION_KEY).
--
-- Run this in phpMyAdmin -> your database -> SQL tab, after
-- migration_005_totp_2fa.sql.
-- =====================================================================

ALTER TABLE case_documents
  ADD COLUMN extracted_text MEDIUMTEXT NULL AFTER source_description,
  ADD COLUMN ocr_status ENUM('not_applicable', 'pending', 'done', 'failed')
    NOT NULL DEFAULT 'not_applicable' AFTER extracted_text;
