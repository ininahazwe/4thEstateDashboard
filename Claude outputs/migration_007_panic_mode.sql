-- =====================================================================
-- Migration 007 — panic mode (brief §5, "mode panique")
--
-- Adds one column to users so a compromised/seized device's session can
-- be killed immediately, instead of staying valid until the JWT's normal
-- expiry (JWT_EXPIRES_IN, currently 7 days in .env). Nothing here changes
-- behavior on its own: sessions_invalidated_at starts NULL, and every
-- existing token keeps working exactly as before until a user actually
-- triggers panic mode (Security page > "Panic — sign out everywhere").
--
-- Run this in phpMyAdmin -> your database -> SQL tab, after
-- migration_006_document_text_extraction.sql.
-- =====================================================================

ALTER TABLE users
  ADD COLUMN sessions_invalidated_at DATETIME NULL DEFAULT NULL AFTER totp_recovery_codes;
