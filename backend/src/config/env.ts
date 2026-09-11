function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  PORT: Number(process.env.PORT ?? 4000),
  DB_HOST: required('DB_HOST'),
  DB_PORT: Number(process.env.DB_PORT ?? 3306),
  DB_USER: required('DB_USER'),
  DB_PASSWORD: required('DB_PASSWORD'),
  DB_NAME: required('DB_NAME'),
  JWT_SECRET: required('JWT_SECRET'),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? '8h',

  // Where the frontend lives, used to redirect back after Google login.
  FRONTEND_URL: process.env.FRONTEND_URL ?? 'http://localhost:5173',

  // Google OAuth (Sign in with Google, authorization code flow).
  GOOGLE_CLIENT_ID: required('GOOGLE_CLIENT_ID'),
  GOOGLE_CLIENT_SECRET: required('GOOGLE_CLIENT_SECRET'),
  GOOGLE_CALLBACK_URL: required('GOOGLE_CALLBACK_URL'),
  // Restrict sign-in to this Google Workspace domain when set (recommended).
  // Leave unset in .env to allow any Google account.
  GOOGLE_ALLOWED_DOMAIN: process.env.GOOGLE_ALLOWED_DOMAIN || null,
};
