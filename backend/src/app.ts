import express from 'express';
import 'express-async-errors';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'node:path';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import api from './routes';
import { errorHandler, notFoundHandler } from './middleware/error';
import { csrfGuard, forceHttps, sanitizeInput } from './middleware/security';
import { isDatabasePhotoId, readDatabasePhoto } from './services/storage.service';
import { logger } from './utils/logger';

/** Browsers may only call the API from the listed origins. Open in development, closed by default in production. */
function corsOptions(): cors.CorsOptions {
  if (env.corsOrigins.length) return { origin: env.corsOrigins };
  if (env.isProduction) {
    logger.warn('CORS_ORIGINS is empty: browser apps on other origins will be blocked. Native apps are unaffected.');
    return { origin: false };
  }
  return {};
}

export function createApp() {
  const app = express();

  // Behind a reverse proxy the client address arrives in X-Forwarded-For; without this every user shares one rate limit.
  if (env.trustProxy) app.set('trust proxy', env.trustProxy);

  app.use(forceHttps);
  app.use(
    helmet({
      // Browsers remember for a year to only ever use https:// for the API.
      strictTransportSecurity: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
    }),
  );
  app.use(cors(corsOptions()));

  // Photos come before the rate limiter: a list screen loads many of them and they must not use up the API allowance.
  // Helmet's default same-origin policy would stop the web apps, on other origins, from showing them.
  app.use(
    '/uploads',
    (_req, res, next) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      next();
    },
    // Photos kept in the database (Vercel without Blob) have a 24-character id; anything else is a file on disk.
    async (req, res, next) => {
      const name = req.path.replace(/^\//, '');
      if (!isDatabasePhotoId(name)) return next();
      const photo = await readDatabasePhoto(name);
      if (!photo) return res.status(404).json({ error: 'Photo not found' });
      res.setHeader('Content-Type', photo.contentType);
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
      res.end(photo.data);
    },
    express.static(path.resolve(env.uploadDir), { maxAge: '7d', immutable: true }),
  );

  // JSON bodies are small (forms, reports); photos and documents go through the upload routes.
  app.use(express.json({ limit: '1mb' }));
  app.use(sanitizeInput);
  app.use(csrfGuard);
  app.use(morgan(env.nodeEnv === 'development' ? 'dev' : 'combined'));
  app.use(rateLimit({ windowMs: 60_000, max: 120 }));

  // Slows password guessing: only failed sign-ins count, and a correct one never locks anyone out.
  app.use(
    '/api/v1/auth/login',
    rateLimit({
      windowMs: 15 * 60_000,
      max: 20,
      skipSuccessfulRequests: true,
      message: { error: 'Too many failed sign-in attempts. Try again in a few minutes.', details: null },
    }),
  );
  // Per account as well as per address: someone switching networks still can't guess one
  // person's password more than 10 times in 15 minutes.
  app.use(
    '/api/v1/auth/login',
    rateLimit({
      windowMs: 15 * 60_000,
      max: 10,
      skipSuccessfulRequests: true,
      keyGenerator: (req) =>
        `login:${typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : 'none'}`,
      message: { error: 'Too many failed sign-in attempts for this account. Try again in 15 minutes.', details: null },
    }),
  );

  // Email codes: each send is an email, and each guess is a try at a 6-digit code.
  const failedOnly = (max: number, message: string) =>
    rateLimit({ windowMs: 15 * 60_000, max, skipSuccessfulRequests: true, message: { error: message, details: null } });
  app.use('/api/v1/auth/email-code/verify', failedOnly(10, 'Too many wrong codes. Request a new code and try again.'));
  app.use('/api/v1/auth/verify-reset-code', failedOnly(10, 'Too many wrong codes. Request a new code and try again.'));
  app.use('/api/v1/user/account/delete', failedOnly(5, 'Too many wrong passwords. Try again in 15 minutes.'));
  app.use('/api/v1/shelter/password', failedOnly(10, 'Too many wrong passwords. Try again in 15 minutes.'));
  app.use(
    /^\/api\/v1\/auth\/email-code$/,
    rateLimit({ windowMs: 15 * 60_000, max: 5, message: { error: 'Too many codes requested. Try again in a few minutes.', details: null } }),
  );
  // Sign-ups and the shelter proof upload need no account, so they are capped per address.
  app.use(
    ['/api/v1/user/register', '/api/v1/shelter/register'],
    rateLimit({ windowMs: 60 * 60_000, max: 10, message: { error: 'Too many sign-up attempts. Try again later.', details: null } }),
  );

  // Caps how many reset emails one IP can trigger - forgotPassword() always answers the same way
  // regardless of whether the email exists, so this is the only thing stopping an email-bombing loop.
  app.use(
    '/api/v1/auth/forgot-password',
    rateLimit({
      windowMs: 15 * 60_000,
      max: 5,
      message: { error: 'Too many reset requests. Try again in a few minutes.', details: null },
    }),
  );

  // Slows guessing the 6-digit code: only failed attempts count, and a correct one never locks anyone out.
  app.use(
    '/api/v1/auth/reset-password',
    rateLimit({
      windowMs: 15 * 60_000,
      max: 10,
      skipSuccessfulRequests: true,
      message: { error: 'Too many attempts. Request a new code and try again.', details: null },
    }),
  );

  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
