import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import { confirmTotpSetup, disableTotp, getTotpStatus, startTotpSetup, stepUp } from './twoFactor.service';

const codeSchema = z.object({ code: z.string().min(6).max(9) });

// Mounted at /api/auth/2fa in app.ts. Manages a user's own TOTP enrollment
// (brief §5.2, "2FA obligatoire pour sensibilité >= très sensible") and the
// step-up check that highly-sensitive case routes require — see
// requireCaseRole in middleware/auth.ts for where that check is enforced.
export const twoFactorRouter = Router();

twoFactorRouter.use(requireAuth);

twoFactorRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await getTotpStatus(req.user!.id));
  })
);

twoFactorRouter.post(
  '/setup',
  asyncHandler(async (req, res) => {
    res.status(201).json(await startTotpSetup(req.user!.id));
  })
);

twoFactorRouter.post(
  '/enable',
  asyncHandler(async (req, res) => {
    const { code } = codeSchema.parse(req.body);
    res.json(await confirmTotpSetup(req.user!.id, code));
  })
);

twoFactorRouter.post(
  '/disable',
  asyncHandler(async (req, res) => {
    const { code } = codeSchema.parse(req.body);
    await disableTotp(req.user!.id, code);
    res.status(204).send();
  })
);

twoFactorRouter.post(
  '/step-up',
  asyncHandler(async (req, res) => {
    const { code } = codeSchema.parse(req.body);
    res.json(await stepUp(req.user!.id, code));
  })
);
