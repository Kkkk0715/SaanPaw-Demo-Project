import type { NextFunction, Request, Response } from 'express';
import { getSystemConfig } from '../services/systemConfig.service';
import { ApiError } from '../utils/ApiError';

export const MAINTENANCE_MESSAGE =
  'SaanPaw is under maintenance right now, so changes cannot be saved. Please try again later.';

const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Maintenance mode already stops users and shelters from signing in, but a token issued before it
 * was switched on stays valid - so every write from the mobile app (reports, uploads, status
 * changes, messages, registrations) is refused here too, not just new sign-ins. Reads still work,
 * so people who are already in can look around without anything new entering the database.
 * Mounted only on the user, shelter and upload routes: the Developer console is never blocked.
 */
export async function blockWritesDuringMaintenance(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (READ_ONLY_METHODS.has(req.method)) return next();
    if ((await getSystemConfig()).maintenanceMode) throw new ApiError(503, MAINTENANCE_MESSAGE);
    next();
  } catch (err) {
    next(err);
  }
}
