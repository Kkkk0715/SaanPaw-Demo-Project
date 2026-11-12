import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import type { Role } from '../config/constants';
import { ApiError } from '../utils/ApiError';

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Missing bearer token');
  }
  try {
    // Only the algorithm SaanPaw signs with is accepted (no "none", no algorithm switching).
    const decoded = jwt.verify(header.slice(7), env.jwtSecret, { algorithms: ['HS256'] }) as Express.UserPayload;
    req.auth = decoded;
    next();
  } catch {
    throw ApiError.unauthorized('Invalid or expired token');
  }
}

export function authorize(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      throw ApiError.forbidden('Insufficient role');
    }
    next();
  };
}
