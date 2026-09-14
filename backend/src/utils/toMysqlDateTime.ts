import { AppError } from './AppError';

// Converts any parseable date string (e.g. the ISO 8601 / UTC strings
// produced by JS's Date#toISOString(), like '2026-09-16T01:00:00.000Z')
// into the plain 'YYYY-MM-DD HH:MM:SS' format MySQL's DATETIME columns
// expect. MySQL rejects the 'T' separator, the trailing 'Z', and
// milliseconds outright (ER_TRUNCATED_WRONG_VALUE) — it needs this exact
// shape, not just any valid date string.
//
// DATETIME itself stores no timezone, so this always converts through UTC:
// the wall-clock time stored is the UTC instant of the given date. As long
// as every write goes through this helper, reads stay consistent.
export function toMysqlDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(400, `Invalid date: ${value}`);
  }
  return date.toISOString().slice(0, 19).replace('T', ' ');
}
