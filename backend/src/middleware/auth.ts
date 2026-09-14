import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { RowDataPacket } from 'mysql2';
import { env } from '../config/env';
import { pool } from '../config/db';
import { AppError } from '../utils/AppError';

export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
  // Set only on a token reissued by POST /api/auth/2fa/step-up (brief
  // §5.2) -- absent from an ordinary login token. requireCaseRole checks
  // its recency, not just its presence, against TOTP_STEPUP_TTL_MINUTES.
  totpVerifiedAt?: number;
}

export type CaseRole = 'lead' | 'collaborator' | 'observer' | 'read_only';

export type ProjectRole = 'lead_journalist' | 'editor' | 'researcher' | 'photographer';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      caseRole?: CaseRole;
      projectRole?: ProjectRole;
    }
  }
}

// Verifies the JWT issued at login and attaches the decoded user to req.user.
// Mounted on every route under /api/cases (see modules/cases/cases.routes.ts).
//
// Also enforces panic mode (brief §5, "mode panique"): a user who hits
// "Panic -- sign out everywhere" (Security page) sets
// users.sessions_invalidated_at to now, and every token issued *before*
// that moment (judged by the JWT's own `iat` claim) is rejected here from
// then on -- the one DB read this needs is the price of a stateless-JWT
// setup being able to revoke a session at all, since there is otherwise no
// server-side session store anywhere in this app.
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new AppError(401, 'Missing or invalid Authorization header'));
  }

  const token = header.slice('Bearer '.length);

  let decoded: AuthUser & { iat: number };
  try {
    decoded = jwt.verify(token, env.JWT_SECRET) as AuthUser & { iat: number };
  } catch {
    return next(new AppError(401, 'Invalid or expired token'));
  }

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT sessions_invalidated_at FROM users WHERE id = :userId',
      { userId: decoded.id }
    );
    const invalidatedAt = rows[0]?.sessions_invalidated_at as string | null | undefined;
    if (invalidatedAt && decoded.iat * 1000 < new Date(invalidatedAt).getTime()) {
      return next(
        new AppError(401, 'This session was signed out (panic mode) -- please sign in again.', {
          code: 'SESSION_INVALIDATED',
        })
      );
    }
  } catch (err) {
    return next(err);
  }

  req.user = decoded;
  next();
}

const ROLE_RANK: Record<CaseRole, number> = {
  read_only: 0,
  observer: 1,
  collaborator: 2,
  lead: 3,
};

// Enforces the per-case roles from brief section 1.1 (lead / collaborator /
// observer / read_only). Reads the caller's role from case_contributors and
// rejects with 403 if it doesn't meet `minRole`. Expects requireAuth to have
// already run, and a :caseId or :id route param to identify the case.
export function requireCaseRole(minRole: CaseRole) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(new AppError(401, 'Authentication required'));
      }

      const caseId = Number(req.params.caseId ?? req.params.id);
      if (!Number.isInteger(caseId)) {
        return next(new AppError(400, 'Invalid case id'));
      }

      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT cc.role, c.sensitivity FROM case_contributors cc
         JOIN cases c ON c.id = cc.case_id
         WHERE cc.case_id = :caseId AND cc.user_id = :userId`,
        { caseId, userId: req.user.id }
      );

      const role = rows[0]?.role as CaseRole | undefined;
      if (!role || ROLE_RANK[role] < ROLE_RANK[minRole]) {
        return next(new AppError(403, 'You do not have sufficient access to this case'));
      }

      // brief §5.2: "2FA obligatoire pour sensibilité >= très sensible" --
      // with the sensitivity enum having no level above highly_sensitive,
      // that condition is exactly "== highly_sensitive". Gates the case
      // itself and everything mounted under requireCaseRole (events,
      // contributors, audit log, tags, documents, comments, report) in one
      // place; cross-case views (search/graph/geo/calendar) are not gated
      // this way yet -- see etat-avancement.md's known-gap note.
      if (rows[0]?.sensitivity === 'highly_sensitive') {
        const stepUpTtlMs = env.TOTP_STEPUP_TTL_MINUTES * 60 * 1000;
        const verifiedRecently =
          typeof req.user.totpVerifiedAt === 'number' && Date.now() - req.user.totpVerifiedAt <= stepUpTtlMs;

        if (!verifiedRecently) {
          const [userRows] = await pool.query<RowDataPacket[]>(
            'SELECT totp_enabled FROM users WHERE id = :userId',
            { userId: req.user.id }
          );
          const totpEnabled = userRows[0]?.totp_enabled === 1;

          return next(
            new AppError(
              403,
              totpEnabled
                ? 'This case is highly sensitive -- please verify your two-factor code again.'
                : 'This case is highly sensitive -- two-factor authentication must be enabled on your account first.',
              { code: totpEnabled ? 'TOTP_STEP_UP_REQUIRED' : 'TOTP_SETUP_REQUIRED' }
            )
          );
        }
      }

      req.caseRole = role;
      next();
    } catch (err) {
      next(err);
    }
  };
}
// Editorial project roles (brief §2.1) are functional, not a hierarchy like
// case roles — lead_journalist/editor/researcher/photographer are just
// "who's doing what", not ranked levels of access. So instead of
// requireCaseRole's rank comparison, this is a plain two-way split: any
// contributor can read and edit ordinary project fields; only the
// lead_journalist manages membership and deletes the project (mirrors
// "only a case's lead manages its contributors").
export function requireProjectContributor() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(new AppError(401, 'Authentication required'));
      }

      const projectId = Number(req.params.projectId ?? req.params.id);
      if (!Number.isInteger(projectId)) {
        return next(new AppError(400, 'Invalid editorial project id'));
      }

      const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT role FROM editorial_project_contributors WHERE project_id = :projectId AND user_id = :userId',
        { projectId, userId: req.user.id }
      );

      const role = rows[0]?.role as ProjectRole | undefined;
      if (!role) {
        return next(new AppError(403, 'You do not have access to this editorial project'));
      }

      req.projectRole = role;
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireProjectLead() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(new AppError(401, 'Authentication required'));
      }

      const projectId = Number(req.params.projectId ?? req.params.id);
      if (!Number.isInteger(projectId)) {
        return next(new AppError(400, 'Invalid editorial project id'));
      }

      const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT role FROM editorial_project_contributors WHERE project_id = :projectId AND user_id = :userId',
        { projectId, userId: req.user.id }
      );

      const role = rows[0]?.role as ProjectRole | undefined;
      if (role !== 'lead_journalist') {
        return next(new AppError(403, 'Only the lead journalist can do this'));
      }

      req.projectRole = role;
      next();
    } catch (err) {
      next(err);
    }
  };
}
