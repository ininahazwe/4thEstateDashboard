import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { RowDataPacket } from 'mysql2';
import { pool } from '../../config/db';
import { env } from '../../config/env';
import { AppError } from '../../utils/AppError';

interface UserRow extends RowDataPacket {
  id: number;
  full_name: string;
  email: string;
  password_hash: string;
  is_active: number;
}

export async function login(email: string, password: string) {
  const [rows] = await pool.query<UserRow[]>(
    'SELECT id, full_name, email, password_hash, is_active FROM users WHERE email = :email',
    { email }
  );

  const user = rows[0];
  // Same error for "no such user" and "wrong password" on purpose, so the
  // response never reveals which emails are registered.
  if (!user || !user.is_active) {
    throw new AppError(401, 'Invalid email or password');
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw new AppError(401, 'Invalid email or password');
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, fullName: user.full_name },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );

  return { token, user: { id: user.id, email: user.email, fullName: user.full_name } };
}
