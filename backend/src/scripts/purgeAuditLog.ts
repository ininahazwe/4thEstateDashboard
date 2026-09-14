import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { RowDataPacket } from 'mysql2';
import { pool } from '../config/db';
import { env } from '../config/env';

// Retention policy for the audit log (brief §5, "export + retention du
// journal d'audit"). Meant to be invoked on a schedule (a cPanel Cron Job,
// e.g. `cd backend && npm run purge-audit-log`, once a day/week) rather
// than run inside the always-on API server -- this project has no other
// background job infrastructure (no queue, no in-process scheduler), and a
// cron job is what Yv already uses for recurring tasks on this hosting.
//
// Safety net: rows about to be deleted are archived to a local JSON file
// first (BACKUP_DIR below), so a retention run is never a one-way door even
// if nobody exported via the UI first (Cases > Activity log > Export CSV)
// beforehand. Nothing is deleted at all until AUDIT_LOG_RETENTION_DAYS is
// explicitly set in .env -- there is no implicit default retention window.

const BACKUP_DIR = process.env.AUDIT_LOG_BACKUP_DIR
  ? path.resolve(process.env.AUDIT_LOG_BACKUP_DIR)
  : path.resolve(__dirname, '../../audit-log-backups');

interface PurgeRow extends RowDataPacket {
  id: number;
}

async function main() {
  const retentionDays = env.AUDIT_LOG_RETENTION_DAYS;
  if (!retentionDays || retentionDays <= 0) {
    console.log(
      'AUDIT_LOG_RETENTION_DAYS is not set (or not a positive number) -- nothing to purge. ' +
        'Set it in backend/.env to enable the retention policy.'
    );
    return;
  }

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM audit_log WHERE created_at < DATE_SUB(NOW(), INTERVAL :days DAY)`,
    { days: retentionDays }
  );

  if (rows.length === 0) {
    console.log(`No audit_log rows older than ${retentionDays} days -- nothing to purge.`);
    return;
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backupFile = path.join(BACKUP_DIR, `audit-log-purged-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(rows, null, 2));
  console.log(`Archived ${rows.length} row(s) to ${backupFile}`);

  const ids = (rows as PurgeRow[]).map((r) => r.id);
  const [result] = await pool.query(
    `DELETE FROM audit_log WHERE id IN (:ids)`,
    { ids }
  );
  console.log(`Deleted ${(result as { affectedRows: number }).affectedRows} row(s) older than ${retentionDays} days.`);
}

main()
  .catch((err) => {
    console.error('audit log retention run failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
