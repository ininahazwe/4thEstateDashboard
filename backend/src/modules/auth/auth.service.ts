import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../../config/db';
import { env } from '../../config/env';
import { AppError } from '../../utils/AppError';

interface UserRow extends RowDataPacket {
  id: number;
  full_name: string;
  email: string;
  password_hash: string | null;
  google_id: string | null;
  auth_provider: 'local' | 'google';
  is_active: number;
}

// `extra.totpVerifiedAt` is how a 2FA step-up (brief §5.2, see
// modules/auth/twoFactor.service.ts) gets carried in the token: a case
// route gated behind "highly_sensitive" checks this claim's recency rather
// than re-deriving it, so re-issuing the token here is the only place that
// claim is ever set.
export function issueToken(
  user: { id: number; email: string; full_name: string },
  extra?: { totpVerifiedAt?: number }
) {
  // JWT_EXPIRES_IN comes from an ..env var, so it is a plain string at the type
  // level. types/jsonwebtoken wants a narrower literal type (e.g. '8h') for
  // SignOptions.expiresIn, which a runtime-provided string can never satisfy
  // structurally -- cast the options object rather than fight the overloads.
  const options = { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions;
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      ...(extra?.totpVerifiedAt ? { totpVerifiedAt: extra.totpVerifiedAt } : {}),
    },
    env.JWT_SECRET,
    options
  );
}

// Kept for scripts/tooling and as a fallback path in the backend even though
// the frontend now only shows the Google button — see backend/README.md.
export async function login(email: string, password: string) {
  const [rows] = await pool.query<UserRow[]>(
    'SELECT id, full_name, email, password_hash, google_id, auth_provider, is_active FROM users WHERE email = :email',
    { email }
  );

  const user = rows[0];
  // Same error for "no such user", "wrong password" and "Google-only
  // account" on purpose, so the response never reveals which emails exist
  // or how a given account authenticates.
  if (!user || !user.is_active || !user.password_hash) {
    throw new AppError(401, 'Invalid email or password');
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw new AppError(401, 'Invalid email or password');
  }

  const token = issueToken(user);
  return { token, user: { id: user.id, email: user.email, fullName: user.full_name } };
}

const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_CALLBACK_URL);

// Short-lived, self-verifying state token: stands in for a server-side
// session store to give the OAuth redirect basic CSRF protection without
// needing cookies/sessions for what is otherwise a stateless API.
export function createGoogleOAuthState(): string {
  return jwt.sign({ purpose: 'oauth_state' }, env.JWT_SECRET, { expiresIn: '10m' });
}

function verifyGoogleOAuthState(state: string | undefined) {
  if (!state) {
    throw new AppError(400, 'Missing OAuth state');
  }
  try {
    const payload = jwt.verify(state, env.JWT_SECRET) as { purpose?: string };
    if (payload.purpose !== 'oauth_state') {
      throw new Error('wrong purpose');
    }
  } catch {
    throw new AppError(400, 'Invalid or expired OAuth state');
  }
}

export function getGoogleAuthUrl(state: string): string {
  return googleClient.generateAuthUrl({
    access_type: 'online',
    scope: ['openid', 'email', 'profile'],
    state,
    prompt: 'select_account',
    // Lets Google itself pre-filter to this Workspace domain in the account
    // chooser; the real enforcement happens below on the verified token.
    hd: env.GOOGLE_ALLOWED_DOMAIN ?? undefined,
  });
}

export async function handleGoogleCallback(code: string, state: string | undefined) {
  verifyGoogleOAuthState(state);

  const { tokens } = await googleClient.getToken({ code, redirect_uri: env.GOOGLE_CALLBACK_URL });
  const ticket = await googleClient.verifyIdToken({
    idToken: tokens.id_token!,
    audience: env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  if (!payload?.email || !payload.sub) {
    throw new AppError(401, 'Google did not return a valid identity');
  }

  if (!payload.email_verified) {
    throw new AppError(401, 'Google account email is not verified');
  }

  if (env.GOOGLE_ALLOWED_DOMAIN && payload.hd !== env.GOOGLE_ALLOWED_DOMAIN) {
    throw new AppError(403, `Only @${env.GOOGLE_ALLOWED_DOMAIN} Google accounts can sign in here`);
  }

  const googleId = payload.sub;
  const email = payload.email;
  const fullName = payload.name ?? email;
  const avatarUrl = payload.picture ?? null;

  const [existingByGoogleId] = await pool.query<UserRow[]>(
    'SELECT id, full_name, email, password_hash, google_id, auth_provider, is_active FROM users WHERE google_id = :googleId',
    { googleId }
  );

  let user = existingByGoogleId[0];

  if (!user) {
    // Not seen this Google account before — check if there's already a
    // local account with the same email (created via create-user) and
    // link this Google identity to it instead of creating a duplicate.
    const [existingByEmail] = await pool.query<UserRow[]>(
      'SELECT id, full_name, email, password_hash, google_id, auth_provider, is_active FROM users WHERE email = :email',
      { email }
    );

    if (existingByEmail[0]) {
      await pool.query(
        'UPDATE users SET google_id = :googleId, avatar_url = :avatarUrl WHERE id = :id',
        { googleId, avatarUrl, id: existingByEmail[0].id }
      );
      user = existingByEmail[0];
    } else {
      const [result] = await pool.query<ResultSetHeader>(
        `INSERT INTO users (full_name, email, google_id, avatar_url, auth_provider, is_active)
         VALUES (:fullName, :email, :googleId, :avatarUrl, 'google', 1)`,
        { fullName, email, googleId, avatarUrl }
      );

      const [created] = await pool.query<UserRow[]>(
        'SELECT id, full_name, email, password_hash, google_id, auth_provider, is_active FROM users WHERE id = :id',
        { id: result.insertId }
      );
      user = created[0];
    }
  }

  if (!user.is_active) {
    throw new AppError(403, 'This account has been deactivated');
  }

  return issueToken(user);
}

// Panic mode (brief §5, "mode panique"): immediately invalidates every
// existing session for this user, everywhere -- see requireAuth in
// middleware/auth.ts for how sessions_invalidated_at is enforced. Deliberately
// per-user rather than a global kill switch: there's no admin/superuser
// concept anywhere else in this app, and a compromised device only ever
// belongs to one account.
export async function triggerPanicMode(userId: number): Promise<void> {
  await pool.query('UPDATE users SET sessions_invalidated_at = NOW() WHERE id = :userId', { userId });
}
