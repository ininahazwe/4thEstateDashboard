import 'dotenv/config';
import { app } from './app';
import { env } from './config/env';
import { pool } from './config/db';

async function main() {
  // Fail fast on boot if the database is unreachable, rather than on the
  // first request.
  const conn = await pool.getConnection();
  await conn.ping();
  conn.release();
  console.log('Database connection OK');

  app.listen(env.PORT, () => {
    console.log(`4thestate Dashboard API listening on http://localhost:${env.PORT}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
