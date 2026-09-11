import { Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../../utils/AppError';
import { env } from '../../config/env';
import {
  createGoogleOAuthState,
  getGoogleAuthUrl,
  handleGoogleCallback,
  login,
} from './auth.service';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function loginHandler(req: Request, res: Response) {
  const { email, password } = loginSchema.parse(req.body);
  const result = await login(email, password);
  res.json(result);
}

export async function googleRedirectHandler(_req: Request, res: Response) {
  const state = createGoogleOAuthState();
  res.redirect(getGoogleAuthUrl(state));
}

export async function googleCallbackHandler(req: Request, res: Response) {
  const code = typeof req.query.code === 'string' ? req.query.code : undefined;
  const state = typeof req.query.state === 'string' ? req.query.state : undefined;

  if (!code) {
    throw new AppError(400, 'Missing authorization code from Google');
  }

  try {
    const token = await handleGoogleCallback(code, state);
    res.redirect(`${env.FRONTEND_URL}/auth/callback?token=${encodeURIComponent(token)}`);
  } catch (err) {
    // Log the real cause server-side -- the browser only ever sees a short,
    // generic message, so without this the actual Google/library error
    // (bad redirect_uri, invalid_grant, clock skew, etc.) is invisible.
    console.error('Google OAuth callback failed:', err);
    const message = err instanceof AppError ? err.message : 'Google sign-in failed';
    res.redirect(`${env.FRONTEND_URL}/auth/callback?error=${encodeURIComponent(message)}`);
  }
}

export async function meHandler(req: Request, res: Response) {
  res.json(req.user);
}
