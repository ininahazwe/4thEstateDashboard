import { AppError } from './AppError';

// Route params arrive as strings; this turns one into a positive integer or
// throws a clean 400 instead of letting a NaN leak into a SQL query.
export function parseId(value: string, label: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(400, `Invalid ${label}`);
  }
  return id;
}
