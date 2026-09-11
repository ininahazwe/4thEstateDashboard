import { NextFunction, Request, Response } from 'express';

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

// Express doesn't forward rejected promises to the error handler on its own;
// wrapping async route handlers with this makes sure thrown/rejected errors
// reach errorHandler.ts instead of crashing the process.
export const asyncHandler =
  (fn: AsyncRouteHandler) => (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
