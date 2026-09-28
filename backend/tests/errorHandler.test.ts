import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { errorHandler } from '../src/middleware/error';
import { ApiError } from '../src/utils/ApiError';

jest.mock('../src/utils/logger');

function run(err: unknown) {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
  errorHandler(err, {} as Request, res, jest.fn());
  return { status: (res.status as jest.Mock).mock.calls[0][0], body: (res.json as jest.Mock).mock.calls[0][0] };
}

describe('errorHandler', () => {
  it('passes an ApiError through', () => {
    expect(run(ApiError.notFound('Nope'))).toMatchObject({ status: 404, body: { error: 'Nope' } });
  });

  it('turns a failed validation into a 400 that names the field', () => {
    const result = z.object({ location: z.object({ latitude: z.number() }) }).safeParse({});
    const { status, body } = run((result as { error: z.ZodError }).error);
    expect(status).toBe(400);
    expect(body.error).toContain('location');
  });

  it('turns a malformed id into a 400', () => {
    const err = new mongoose.Error.CastError('ObjectId', 'nope', '_id');
    expect(run(err).status).toBe(400);
  });

  it('turns a duplicate key into a 409', () => {
    expect(run(Object.assign(new Error('dup'), { code: 11000 })).status).toBe(409);
  });

  it('turns a malformed JSON body into a 400', () => {
    expect(run(Object.assign(new Error('bad json'), { type: 'entity.parse.failed' })).status).toBe(400);
  });

  it('hides anything unexpected behind a generic 500', () => {
    expect(run(new Error('secret detail'))).toEqual({ status: 500, body: { error: 'Internal server error' } });
  });
});
