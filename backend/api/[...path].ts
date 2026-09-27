import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createApp } from '../src/app';
import { connectDatabase } from '../src/config/db';

// Set here rather than in vercel.json's `functions` key: that key is matched as a glob, and the
// square brackets in this filename are glob syntax (a character class), not a literal match.
export const config = { maxDuration: 30 };

// Built once per cold start; connectDatabase() below reuses the cached connection on every
// invocation after that (see config/db.ts for why a serverless platform needs this caching).
const app = createApp();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await connectDatabase();
  app(req as never, res as never);
}
