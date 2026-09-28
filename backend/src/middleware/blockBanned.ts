import type { NextFunction, Request, Response } from 'express';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';

/**
 * A sign-in token stays valid after its owner is banned, so check the account on every request
 * or a banned user could keep posting until the token expires.
 */
export async function blockBannedUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await User.findById(req.auth!.id, 'isBanned').lean();
    if (!user || user.isBanned) throw ApiError.forbidden('Account is banned');
    next();
  } catch (err) {
    next(err);
  }
}
