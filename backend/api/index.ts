import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createApp } from '../src/app';
import { connectDatabase } from '../src/config/db';

// Zero-config catch-all routing via a [...path].ts filename didn't route nested paths on this
// project (only the exact /api literal matched) - vercel.json's rewrites send everything under
// /api/* here explicitly instead. maxDuration is set here rather than vercel.json's `functions`
// key because that key is matched as a glob, where brackets would mean something else.
//
// vercel.json's `functions["api/index.ts"].includeFiles` force-includes expo-server-sdk:
// pushNotification.service.ts loads it via a runtime-constructed dynamic import() (see that
// file) so tsc can't downlevel it to a require() that crashes on Node runtimes without
// require()-of-ESM support. That same trick hides the dependency from Vercel's static bundle
// tracer, so without includeFiles the package is silently missing from the deployed function.
export const config = { maxDuration: 30 };

// Built once per cold start; connectDatabase() below reuses the cached connection on every
// invocation after that (see config/db.ts for why a serverless platform needs this caching).
const app = createApp();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await connectDatabase();
  app(req as never, res as never);
}
