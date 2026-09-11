import mysql from 'mysql2/promise';
import { env } from './env';

// Shared connection pool. mysql2's `namedPlaceholders` lets queries use
// `:paramName` instead of positional `?` markers, which keeps the
// service files easier to read as they grow.
export const pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
});
