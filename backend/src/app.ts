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

  app.use(helmet());
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

  app.use(express.json({ limit: '2mb' }));
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

  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
