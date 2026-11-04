import { Router } from 'express';
import { env } from '../../config/env';
import { authenticate, authorize } from '../../middleware/auth';
import { receivePhoto } from '../../middleware/upload';
import { prePassAnimalPhoto } from '../../services/gemini.service';
import { rememberPhoto } from '../../services/photoFingerprint.service';
import { looksLikeImage, saveUploadedPhoto } from '../../services/storage.service';
import { getSystemConfig } from '../../services/systemConfig.service';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { logger } from '../../utils/logger';

const router = Router();

/**
 * `purpose` is a multipart text field. Everything is an animal photo (and goes through the Gemini
 * pre-pass) unless the client says it is a profile picture or shelter logo, which shows a person
 * or a sign rather than an animal. Defaulting to "animal" means a client that forgets the field
 * is screened, not waved through.
 */
type UploadPurpose = 'animal' | 'profile';
const purposeOf = (value: unknown): UploadPurpose => (value === 'profile' ? 'profile' : 'animal');

// Only the two mobile roles attach photos. Authenticate first so nobody unauthenticated can trigger a save.
router.post(
  '/',
  authenticate,
  authorize('user', 'shelter_admin'),
  receivePhoto,
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) throw ApiError.badRequest('Attach a photo in the "photo" field.');
    if (!looksLikeImage(file.buffer)) {
      throw ApiError.badRequest('That file is not a valid JPEG, PNG or WebP image.');
    }

    // Pre-pass: refuse anything that is not a real photo of an accepted animal BEFORE it is
    // stored. Follows the Developer's AI moderation switch in System Management.
    let species: string | undefined;
    if (purposeOf(req.body?.purpose) === 'animal' && (await getSystemConfig()).aiModeration) {
      const verdict = await prePassAnimalPhoto(file.buffer, file.mimetype);
      if (verdict && !verdict.allowed) {
        logger.warn(`upload pre-pass: refused photo from ${req.auth?.role} ${req.auth?.id} (${verdict.species}): ${verdict.reasoning}`);
        throw new ApiError(422, verdict.message, { species: verdict.species, reasoning: verdict.reasoning });
      }
      if (!verdict && env.gemini.apiKey) {
        if (env.gemini.prePassStrict) {
          throw new ApiError(503, 'Photo screening is unavailable right now, so the photo could not be accepted. Try again in a moment.');
        }
        // PHOTO_PREPASS_STRICT=0: Gemini could not answer even after a retry, and the deployment has
        // chosen to let the photo through. The report-level flag screen still runs afterwards.
        logger.warn('upload pre-pass: Gemini could not screen the photo, accepting it unscreened');
      }
      species = verdict?.allowed ? verdict.species : undefined;
    }

    const url = await saveUploadedPhoto(file.buffer, file.mimetype);
    // Fingerprinted so a later report reusing this same picture can be flagged as a duplicate.
    if (purposeOf(req.body?.purpose) === 'animal') await rememberPhoto(url, req.auth?.id, file.buffer);
    res.status(201).json({ url, ...(species ? { species } : {}) });
  }),
);

export default router;
