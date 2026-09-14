function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  PORT: Number(process.env.PORT ?? 4000),
  DB_HOST: required('DB_HOST'),
  DB_PORT: Number(process.env.DB_PORT ?? 3306),
  DB_USER: required('DB_USER'),
  DB_PASSWORD: required('DB_PASSWORD'),
  DB_NAME: required('DB_NAME'),
  JWT_SECRET: required('JWT_SECRET'),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? '8h',

  // Where the frontend lives, used to redirect back after Google login.
  FRONTEND_URL: process.env.FRONTEND_URL ?? 'http://localhost:5173',

  // Google OAuth (Sign in with Google, authorization code flow).
  GOOGLE_CLIENT_ID: required('GOOGLE_CLIENT_ID'),
  GOOGLE_CLIENT_SECRET: required('GOOGLE_CLIENT_SECRET'),
  GOOGLE_CALLBACK_URL: required('GOOGLE_CALLBACK_URL'),
  // Restrict sign-in to this Google Workspace domain when set (recommended).
  // Leave unset in ...env to allow any Google account.
  GOOGLE_ALLOWED_DOMAIN: process.env.GOOGLE_ALLOWED_DOMAIN || null,

  // How long a 2FA step-up (brief §5.2) stays valid before a highly
  // sensitive case route asks for a fresh code again. Deliberately not tied
  // to JWT_EXPIRES_IN: re-authenticating with Google every few hours would
  // be normal, but re-entering a TOTP code that often would just train
  // people to stop checking it.
  TOTP_STEPUP_TTL_MINUTES: Number(process.env.TOTP_STEPUP_TTL_MINUTES ?? 720),

  // Encrypts case documents at rest (brief §5). 64 hex characters (32
  // bytes) for AES-256-GCM, e.g. generated with `openssl rand -hex 32`.
  // Optional: uploads still work unencrypted when unset (see
  // utils/documentCrypto.ts), same as before this feature existed -- but
  // any deployment handling real investigations should set this.
  DOCUMENT_ENCRYPTION_KEY: process.env.DOCUMENT_ENCRYPTION_KEY || null,

  // Retention policy for audit_log (brief §5, "retention du journal
  // d'audit") -- how many days of history to keep. Optional and unset by
  // default: the retention script (scripts/purgeAuditLog.ts) refuses to
  // delete anything until this is explicitly set, so there's no risk of
  // silently losing audit history just because a cron job got wired up.
  AUDIT_LOG_RETENTION_DAYS: process.env.AUDIT_LOG_RETENTION_DAYS
    ? Number(process.env.AUDIT_LOG_RETENTION_DAYS)
    : null,

  // IP allowlist (brief §5, "liste blanche d'IP") -- comma-separated list
  // of exact IPs and/or IPv4 CIDR ranges (e.g. "41.66.12.4,102.176.0.0/16").
  // Off by default (empty/unset = no restriction at all). ⚠️ Whoever sets
  // this can lock themselves out if their own IP isn't on the list, or
  // changes later (dynamic IPs are a known issue on this project -- see
  // etat-avancement.md's "ETIMEDOUT" bug about cPanel Remote MySQL) --
  // remove/edit this var in .env to recover, no code change needed.
  IP_ALLOWLIST: process.env.IP_ALLOWLIST || null,

  // Set to 'true' only if this server sits behind a reverse proxy (e.g. a
  // typical cPanel Node app, proxied by Apache/LiteSpeed) -- otherwise
  // req.ip is the proxy's address, not the real visitor's, which would
  // make IP_ALLOWLIST check the wrong address entirely.
  TRUST_PROXY: process.env.TRUST_PROXY === 'true',
};
