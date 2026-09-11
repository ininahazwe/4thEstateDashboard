import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import { googleCallbackHandler, googleRedirectHandler, loginHandler, meHandler } from './auth.controller';

export const authRouter = Router();

// GET  /api/auth/google           -> redirects the browser to Google's consent screen
// GET  /api/auth/google/callback  -> Google redirects here with ?code=...; we exchange
//                                    it, verify the identity, and send the browser back
//                                    to the frontend with our own JWT.
authRouter.get('/google', asyncHandler(googleRedirectHandler));
authRouter.get('/google/callback', asyncHandler(googleCallbackHandler));

// GET /api/auth/me -> the frontend calls this right after the Google
// redirect to fetch the signed-in user's profile (the JWT alone only
// carries id/email/fullName, which is all this currently returns, but it's
// the one place to extend later without changing the callback URL shape).
authRouter.get('/me', requireAuth, asyncHandler(meHandler));

// POST /api/auth/login { email, password } -> { token, user }
// No longer used by the frontend (Google is now the only sign-in option in
// the UI) but left in place: useful for scripts/tooling, and for any
// account that only has a local password set.
authRouter.post('/login', asyncHandler(loginHandler));
