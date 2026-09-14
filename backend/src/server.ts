import 'dotenv/config';
import { createServer } from 'http';
import { app } from './app';
import { env } from './config/env';
import { pool } from './config/db';
import { attachPresence } from './realtime/presence';
import { isDocumentEncryptionConfigured } from './utils/documentCrypto';

async function main() {
  // Fail fast on boot if the database is unreachable, rather than on the
  // first request.
  const conn = await pool.getConnection();
  await conn.ping();
  conn.release();
  console.log('Database connection OK');
  console.log(
    isDocumentEncryptionConfigured()
      ? 'Document encryption at rest: ON'
      : 'Document encryption at rest: OFF (set DOCUMENT_ENCRYPTION_KEY to enable)'
  );

  // Wrapping the Express app in a plain http.Server (instead of calling
  // app.listen directly) is what lets Socket.io share the same port —
  // needed for realtime presence (brief §4.7).
  const httpServer = createServer(app);
  attachPresence(httpServer);

  httpServer.listen(env.PORT, () => {
    console.log(`4thestate Dashboard API listening on http://localhost:${env.PORT}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
