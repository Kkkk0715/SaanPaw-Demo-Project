import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';

/**
 * HTTPS only. Vercel already redirects plain-HTTP page loads, but an API client can still send a
 * request over http:// to a custom domain or a proxy; in production a GET is redirected and
 * anything that writes is refused, so a password or token never travels unencrypted.
 * Together with the HSTS header (helmet, set in app.ts) browsers will not even try http:// again.
 */
export function forceHttps(req: Request, res: Response, next: NextFunction): void {
  if (!env.isProduction) return next();
  const proto = String(req.headers['x-forwarded-proto'] ?? (req.secure ? 'https' : 'http')).split(',')[0].trim();
  if (proto === 'https') return next();
  if (req.method === 'GET' || req.method === 'HEAD') {
    res.redirect(308, `https://${req.headers.host}${req.originalUrl}`);
    return;
  }
  res.status(403).json({ error: 'HTTPS is required.', details: null });
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Buffer);

/**
 * Removes MongoDB operators from anything a client sent ({"email": {"$ne": ""}} would otherwise
 * match every account). Keys starting with "$" or containing "." are dropped at any depth. This
 * is the NoSQL version of "use safe queries": SaanPaw has no SQL database, and every query is
 * built by Mongoose from validated values - this is the safety net under that.
 */
export function stripOperators<T>(value: T, depth = 0): T {
  if (depth > 20) return value;
  if (Array.isArray(value)) return value.map((v) => stripOperators(v, depth + 1)) as T;
  if (!isPlainObject(value)) return value;
  const record: Record<string, unknown> = value;
  for (const key of Object.keys(record)) {
    if (key.startsWith('$') || key.includes('.') || key === '__proto__' || key === 'constructor' || key === 'prototype') {
      delete record[key];
    } else {
      record[key] = stripOperators(record[key], depth + 1);
    }
  }
  return value;
}

export function sanitizeInput(req: Request, _res: Response, next: NextFunction): void {
  if (req.body) stripOperators(req.body);
  if (req.query) stripOperators(req.query as Record<string, unknown>);
  if (req.params) stripOperators(req.params);
  next();
}

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF protection. Sign-in is a bearer token sent in the Authorization header, never a cookie, so a
 * hostile site cannot make a visitor's browser send an authenticated request on its own - the
 * classic CSRF attack has nothing to ride on. These checks close the remaining gaps anyway:
 *  1. a write from a browser must come from an allowed origin (the console), checked against
 *     CORS_ORIGINS - the native apps send no Origin header and are unaffected;
 *  2. a write with a body must be JSON or a file upload - an HTML <form> on another site can only
 *     send urlencoded or text/plain bodies, which are refused here.
 */
export function csrfGuard(req: Request, res: Response, next: NextFunction): void {
  if (!WRITE_METHODS.has(req.method)) return next();
  const origin = req.headers.origin;
  if (origin && env.corsOrigins.length && !env.corsOrigins.includes(origin)) {
    res.status(403).json({ error: 'This request came from a site that is not allowed to use SaanPaw.', details: null });
    return;
  }
  const length = Number(req.headers['content-length'] ?? 0);
  const type = String(req.headers['content-type'] ?? '').toLowerCase();
  const hasBody = length > 0 || req.headers['transfer-encoding'] !== undefined;
  if (hasBody && !type.startsWith('application/json') && !type.startsWith('multipart/form-data')) {
    res.status(415).json({ error: 'Send the request as JSON.', details: null });
    return;
  }
  next();
}

const OBJECT_ID = /^[a-f0-9]{24}$/i;

/** For router.param('id', ...): an :id that is not a database id is refused before any query runs. */
export function objectIdParam(_req: Request, _res: Response, next: NextFunction, value: string): void {
  if (!OBJECT_ID.test(value)) throw ApiError.badRequest('Invalid id');
  next();
}
