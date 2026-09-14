import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { generateSecret, generateURI, verify } from 'otplib';
import QRCode from 'qrcode';
import { RowDataPacket } from 'mysql2';
import { pool } from '../../config/db';
import { AppError } from '../../utils/AppError';
import { issueToken } from './auth.service';

// otplib is imported unqualified elsewhere in the ecosystem via the
// `authenticator` singleton (v10-12) -- this project is on v13, which
// replaced that with a plain functional API (generateSecret/generateURI/
// verify, all from otplib directly) and made verification async.
const ISSUER = '4thEstate Dashboard';
const RECOVERY_CODE_COUNT = 8;
// Excludes 0/O/1/I so a handwritten copy of a recovery code isn't ambiguous.
const RECOVERY_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
// +/- one 30s step, same tolerance most authenticator apps assume.
const EPOCH_TOLERANCE_SECONDS = 30;

interface UserTotpRow extends RowDataPacket {
  id: number;
  email: string;
  full_name: string;
  totp_secret: string | null;
  totp_enabled: number;
  totp_recovery_codes: string[] | null;
}

async function getUserTotpRow(userId: number): Promise<UserTotpRow> {
  const [rows] = await pool.query<UserTotpRow[]>(
    'SELECT id, email, full_name, totp_secret, totp_enabled, totp_recovery_codes FROM users WHERE id = :userId',
    { userId }
  );
  const row = rows[0];
  if (!row) {
    throw new AppError(404, 'User not found');
  }
  return row;
}

export async function getTotpStatus(userId: number) {
  const row = await getUserTotpRow(userId);
  return { enabled: row.totp_enabled === 1 };
}

// Step 1 of enrollment: generates a new secret and returns it as a QR code
// to scan (Google Authenticator, Authy, ...). Not enabled yet -- enabling
// only happens once the user proves they scanned it correctly, in
// confirmTotpSetup below. Refuses to overwrite a secret that's already
// active (disable first, then re-enroll), so a stray repeat call can't
// silently invalidate a working 2FA setup.
export async function startTotpSetup(userId: number) {
  const row = await getUserTotpRow(userId);
  if (row.totp_enabled) {
    throw new AppError(
      400,
      'Two-factor authentication is already enabled on this account. Disable it first to re-enroll.'
    );
  }

  const secret = generateSecret();
  await pool.query('UPDATE users SET totp_secret = :secret WHERE id = :userId', { secret, userId });

  const otpauthUrl = generateURI({ issuer: ISSUER, label: row.email, secret });
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

  return { secret, otpauthUrl, qrCodeDataUrl };
}

function generateRecoveryCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += RECOVERY_CODE_CHARS[crypto.randomInt(RECOVERY_CODE_CHARS.length)];
    if (i === 3) code += '-';
  }
  return code;
}

// Step 2 of enrollment: the user submits the 6-digit code their app is
// currently showing, proving the secret was scanned correctly. On success,
// generates one-time recovery codes -- shown to the user exactly once, in
// this response; only their bcrypt hashes are ever stored -- and flips
// totp_enabled on.
export async function confirmTotpSetup(userId: number, code: string) {
  const row = await getUserTotpRow(userId);
  if (!row.totp_secret) {
    throw new AppError(400, 'No pending 2FA setup for this account. Start setup first.');
  }

  const result = await verify({ secret: row.totp_secret, token: code.trim(), epochTolerance: EPOCH_TOLERANCE_SECONDS });
  if (!result.valid) {
    throw new AppError(401, 'Invalid verification code');
  }

  const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
  const hashes = await Promise.all(recoveryCodes.map((c) => bcrypt.hash(c, 10)));

  await pool.query('UPDATE users SET totp_enabled = 1, totp_recovery_codes = :hashes WHERE id = :userId', {
    hashes: JSON.stringify(hashes),
    userId,
  });

  return { recoveryCodes };
}

// Checks a submitted code against either the live TOTP secret or one of the
// account's unused recovery codes. A matched recovery code is consumed
// (removed) so it can't be reused. Shared by step-up verification and by
// disabling 2FA -- both need proof of control of the second factor.
async function verifyAndConsume(userId: number, code: string): Promise<boolean> {
  const row = await getUserTotpRow(userId);
  if (!row.totp_enabled || !row.totp_secret) {
    throw new AppError(400, 'Two-factor authentication is not enabled on this account.');
  }

  const cleaned = code.trim();
  const result = await verify({ secret: row.totp_secret, token: cleaned, epochTolerance: EPOCH_TOLERANCE_SECONDS });
  if (result.valid) {
    return true;
  }

  const hashes = row.totp_recovery_codes ?? [];
  for (let i = 0; i < hashes.length; i++) {
    // eslint-disable-next-line no-await-in-loop -- small, bounded list (8 codes max)
    if (await bcrypt.compare(cleaned.toUpperCase(), hashes[i])) {
      const remaining = hashes.slice();
      remaining.splice(i, 1);
      await pool.query('UPDATE users SET totp_recovery_codes = :hashes WHERE id = :userId', {
        hashes: JSON.stringify(remaining),
        userId,
      });
      return true;
    }
  }

  return false;
}

// Step-up: the frontend calls this when a case route 403s asking for fresh
// 2FA (see requireCaseRole in middleware/auth.ts). On success, reissues the
// JWT with a totpVerifiedAt claim -- the frontend swaps its stored token for
// this one, and it's what satisfies the highly-sensitive-case check for
// TOTP_STEPUP_TTL_MINUTES (config/env.ts) from here on.
export async function stepUp(userId: number, code: string) {
  const ok = await verifyAndConsume(userId, code);
  if (!ok) {
    throw new AppError(401, 'Invalid verification code');
  }

  const row = await getUserTotpRow(userId);
  const token = issueToken(
    { id: row.id, email: row.email, full_name: row.full_name },
    { totpVerifiedAt: Date.now() }
  );
  return { token };
}

export async function disableTotp(userId: number, code: string) {
  const ok = await verifyAndConsume(userId, code);
  if (!ok) {
    throw new AppError(401, 'Invalid verification code');
  }

  await pool.query(
    'UPDATE users SET totp_secret = NULL, totp_enabled = 0, totp_recovery_codes = NULL WHERE id = :userId',
    { userId }
  );
}
