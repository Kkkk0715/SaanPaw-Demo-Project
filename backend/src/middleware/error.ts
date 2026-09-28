import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { ZodError } from 'zod';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';

/** "location.latitude: Required" - the first problem, in words a form can show. */
function zodMessage(err: ZodError): string {
  const issue = err.issues[0];
  if (!issue) return 'Invalid request';
  const field = issue.path.join('.');
  return field ? `${field}: ${issue.message}` : issue.message;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({ error: err.message, details: err.details ?? null });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: zodMessage(err), details: err.issues });
    return;
  }
  if (err instanceof multer.MulterError) {
    const tooBig = err.code === 'LIMIT_FILE_SIZE';
    res.status(tooBig ? 413 : 400).json({
      error: tooBig ? 'That photo is too large. The limit is 8 MB.' : 'The photo upload was rejected.',
      details: null,
    });
    return;
  }
  if (err instanceof mongoose.Error.ValidationError) {
    const first = Object.values(err.errors)[0];
    res.status(400).json({ error: first?.message ?? 'Invalid request', details: null });
    return;
  }
  if (err instanceof mongoose.Error.CastError) {
    res.status(400).json({ error: `Invalid ${err.path}`, details: null });
    return;
  }
  const known = err as { code?: number; type?: string; status?: number };
  if (known?.code === 11000) {
    res.status(409).json({ error: 'That record already exists', details: null });
    return;
  }
  if (known?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'The request body is not valid JSON', details: null });
    return;
  }
  if (known?.type === 'entity.too.large') {
    res.status(413).json({ error: 'The request is too large', details: null });
    return;
  }
  logger.error(err);
  res.status(500).json({ error: 'Internal server error' });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Route not found' });
}
