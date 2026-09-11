// One-off CLI helper to bootstrap the first user account, since there's no
// public signup endpoint (accounts are provisioned by an admin).
//
// Usage:
//   npm run create-user -- "Jane Doe" jane@mfwa.org "a-strong-password"
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from '../config/db';

async function main() {
  const [fullName, email, password] = process.argv.slice(2);

  if (!fullName || !email || !password) {
    console.error('Usage: npm run create-user -- "Full Name" email@example.com password');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const [result] = await pool.query(
    'INSERT INTO users (full_name, email, password_hash) VALUES (:fullName, :email, :passwordHash)',
    { fullName, email, passwordHash }
  );

  console.log('User created:', result);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
