import { AppError } from './AppError';

// Route params arrive as string | string[] in Express 5's types (to account
// for repeated query-string-style params), even though a normal :id path
// segment is always a single string in practice. This turns one into a
// positive integer or throws a clean 400 instead of letting a NaN (or an
// array) leak into a SQL query.
export function parseId(value: string | string[] | undefined, label: string): number {
  if (Array.isArray(value) || value === undefined) {
    throw new AppError(400, `Invalid ${label}`);
  }

  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(400, `Invalid ${label}`);
  }
  return id;
}
