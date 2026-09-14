-- =====================================================================
-- Migration 005 — TOTP two-factor authentication (brief §5.2)
--
-- "2FA obligatoire pour sensibilité >= très sensible" — adds what's
-- needed to enroll a user in TOTP (Google Authenticator-style) 2FA and
-- to gate access to "highly_sensitive" cases behind a recent, verified
-- code. Nothing here is enabled by default: totp_enabled starts at 0,
-- so no existing account is affected until that user explicitly enrolls
-- (Security page in the app).
--
-- Run this in phpMyAdmin -> your database -> SQL tab, after
-- migration_003_google_auth.sql (migration_004 was never applied, see
-- migration_004_notifications.sql).
-- =====================================================================

ALTER TABLE users
  ADD COLUMN totp_secret         VARCHAR(255) NULL     AFTER auth_provider,
  ADD COLUMN totp_enabled        TINYINT(1)   NOT NULL DEFAULT 0 AFTER totp_secret,
  ADD COLUMN totp_recovery_codes JSON         NULL     AFTER totp_enabled;
