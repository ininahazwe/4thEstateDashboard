import path from 'path';
import fs from 'fs';

// Where uploaded case documents are written on disk (brief §3.2, "local
// disk" option chosen for this first version — S3-compatible storage can
// replace this later without changing the API shape, since the frontend
// never sees storage_path). Configurable via UPLOADS_DIR for deployments
// that want files outside the project folder (e.g. a cPanel path outside
// the public webroot); defaults to an "uploads" folder next to the project
// (gitignored — see .gitignore).
export const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve(__dirname, '../../uploads');

export function caseUploadsDir(caseId: number): string {
  const dir = path.join(UPLOADS_DIR, `case_${caseId}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
