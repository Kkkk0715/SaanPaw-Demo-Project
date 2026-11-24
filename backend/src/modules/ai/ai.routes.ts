import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { BARANGAYS } from '../../config/barangays';
import { describeAnimalPhoto, parseSearchQuery } from '../../services/gemini.service';

/**
 * AI helpers for the apps and console:
 *  - POST /ai/describe  photo -> the report form's details (type, breed, colour, size, marks, a
 *    features-only description and search tags), one entry per animal in the photo;
 *  - POST /ai/search    "brown aspin found near Muzon last week" -> search filters.
 * Both answer { available: false } instead of failing when the AI is down, so the app simply
 * falls back to manual entry / plain keyword search.
 */
const router = Router();
router.use(authenticate, authorize('user', 'shelter_admin', 'developer'));
// Each call uses the shared Gemini quota: a fair share per account.
router.use(
  rateLimit({
    windowMs: 60 * 60_000,
    max: 40,
    keyGenerator: (req) => `ai:${req.auth?.id ?? req.ip}`,
    message: { error: 'Too many AI requests. Fill in the details yourself or try again in a while.', details: null },
  }),
);

/** Only photos SaanPaw itself stored: never a URL the server would fetch for someone else. */
const ownPhoto = z
  .string()
  .trim()
  .max(1000)
  .refine(
    (u) => /^\/uploads\/[a-f0-9]{24}$/i.test(u) || /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/[\w./-]+$/i.test(u) || /^\/uploads\/[\w-]+\.(jpe?g|png|webp)$/i.test(u),
    'Upload the photo first',
  );

/** Also used by guest mode (public routes), behind its own limit. */
export const describeHandler = asyncHandler(async (req, res) => {
  const { imageUrl } = z.object({ imageUrl: ownPhoto }).parse(req.body);
  const animals = await describeAnimalPhoto(imageUrl);
  if (animals === null) return res.json({ available: false, animals: [] });
  res.json({ available: true, animals });
});

router.post('/describe', describeHandler);

router.post(
  '/search',
  asyncHandler(async (req, res) => {
    const { query } = z.object({ query: z.string().trim().min(2, 'Type what you are looking for').max(300) }).parse(req.body);
    const filters = await parseSearchQuery(query, BARANGAYS.map(([name]) => name));
    if (!filters) return res.json({ available: false, filters: null });
    res.json({ available: true, filters });
  }),
);

export default router;
