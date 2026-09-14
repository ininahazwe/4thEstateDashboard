import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';

// IP allowlist (brief §5, "liste blanche d'IP"). Off entirely when
// IP_ALLOWLIST is unset -- this is a deployment-level lockdown switch, not
// something that should ever accidentally restrict access just because the
// app started up. Supports exact addresses (IPv4 or IPv6) and IPv4 CIDR
// ranges; no IPv6 CIDR support (not needed here, kept simple).

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value > 255) return null;
    n = (n << 8) | value;
  }
  return n >>> 0;
}

function matchesEntry(ip: string, entry: string): boolean {
  if (entry.includes('/')) {
    const [range, bitsRaw] = entry.split('/');
    const bits = Number(bitsRaw);
    const rangeInt = ipv4ToInt(range);
    const ipInt = ipv4ToInt(ip);
    if (rangeInt === null || ipInt === null || !Number.isInteger(bits) || bits < 0 || bits > 32) {
      return false;
    }
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (rangeInt & mask) === (ipInt & mask);
  }
  return ip === entry;
}

export function ipAllowlist(req: Request, _res: Response, next: NextFunction) {
  const raw = env.IP_ALLOWLIST;
  if (!raw) {
    return next();
  }

  const entries = raw
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);

  // Node reports IPv4-mapped addresses as "::ffff:1.2.3.4" when the server
  // listens on both stacks -- strip that prefix so an entry like
  // "1.2.3.4" in the allowlist still matches.
  const clientIp = (req.ip ?? '').replace(/^::ffff:/, '');

  if (entries.some((entry) => matchesEntry(clientIp, entry))) {
    return next();
  }

  next(new AppError(403, 'Access to this API is restricted to an approved list of IP addresses.'));
}
