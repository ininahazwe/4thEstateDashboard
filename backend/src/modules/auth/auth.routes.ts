import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { loginHandler } from './auth.controller';

export const authRouter = Router();

// POST /api/auth/login  { email, password } -> { token, user }
// This is a minimal email+password flow to unblock local development.
// Brief section 5.2 calls for OAuth via the org's Google Workspace plus 2FA
// for highly-sensitive access — that replaces/extends this once the rest of
// the API is in place, it isn't meant to be the final auth story.
authRouter.post('/login', asyncHandler(loginHandler));
