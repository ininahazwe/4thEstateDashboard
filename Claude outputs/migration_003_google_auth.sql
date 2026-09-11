-- =====================================================================
-- Migration 003 — Google OAuth login
--
-- Adds what's needed to authenticate users via Google instead of a local
-- password: a Google account identifier, an avatar, and which method the
-- account uses. password_hash becomes nullable since Google-only accounts
-- never get one.
--
-- Run this in phpMyAdmin -> your database -> SQL tab, after
-- migration_002_native_contacts.sql.
-- =====================================================================

ALTER TABLE users
  MODIFY password_hash VARCHAR(255) NULL,
  ADD COLUMN google_id     VARCHAR(255) NULL AFTER password_hash,
  ADD COLUMN avatar_url    VARCHAR(500) NULL AFTER google_id,
  ADD COLUMN auth_provider ENUM('local','google') NOT NULL DEFAULT 'local' AFTER avatar_url,
  ADD UNIQUE KEY uq_users_google_id (google_id);
