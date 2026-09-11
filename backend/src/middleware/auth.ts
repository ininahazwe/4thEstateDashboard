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
}

export type CaseRole = 'lead' | 'collaborator' | 'observer' | 'read_only';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      caseRole?: CaseRole;
    }
  }
}

// Verifies the JWT issued at login and attaches the decoded user to req.user.
// Mounted on every route under /api/cases (see modules/cases/cases.routes.ts).
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new AppError(401, 'Missing or invalid Authorization header'));
  }

  const token = header.slice('Bearer '.length);

  try {
    req.user = jwt.verify(token, env.JWT_SECRET) as AuthUser;
    next();
  } catch {
    next(new AppError(401, 'Invalid or expired token'));
  }
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
        'SELECT role FROM case_contributors WHERE case_id = :caseId AND user_id = :userId',
        { caseId, userId: req.user.id }
      );

      const role = rows[0]?.role as CaseRole | undefined;
      if (!role || ROLE_RANK[role] < ROLE_RANK[minRole]) {
        return next(new AppError(403, 'You do not have sufficient access to this case'));
      }

      req.caseRole = role;
      next();
    } catch (err) {
      next(err);
    }
  };
}
