import crypto from 'node:crypto';
import sharp from 'sharp';
import { FoundAnimalReport } from '../models/FoundAnimalReport';
import { LostPetReport } from '../models/LostPetReport';
import { PhotoFingerprint } from '../models/PhotoFingerprint';
import { ShelterAnimal } from '../models/ShelterAnimal';
import { logger } from '../utils/logger';
import { DHASH_HEIGHT, DHASH_WIDTH, dHashFromGrid, isSamePhoto } from './photoHash';

/** How many of the most recent fingerprints a new photo is compared with. */
const COMPARE_WINDOW = 5000;

/** Decodes the photo and computes both hashes. Returns null if the image cannot be decoded. */
export async function fingerprintPhoto(buffer: Buffer): Promise<{ sha256: string; dHash: string } | null> {
  try {
    const grid = await sharp(buffer)
      .rotate() // honour EXIF orientation, so a rotated copy still matches
      .greyscale()
      .resize(DHASH_WIDTH, DHASH_HEIGHT, { fit: 'fill' })
      .raw()
      .toBuffer();
    return { sha256: crypto.createHash('sha256').update(buffer).digest('hex'), dHash: dHashFromGrid(grid) };
  } catch (err) {
    logger.warn(`fingerprint: could not decode photo (${err instanceof Error ? err.message : String(err)})`);
    return null;
  }
}

/** Records the fingerprint of a photo that was just accepted and saved. Never throws. */
export async function rememberPhoto(url: string, uploaderId: string | undefined, buffer: Buffer): Promise<void> {
  const print = await fingerprintPhoto(buffer);
  if (!print) return;
  try {
    await PhotoFingerprint.create({ url, uploaderId, ...print });
  } catch (err) {
    logger.warn(`fingerprint: could not store fingerprint for ${url}`, err);
  }
}

export interface DuplicatePhoto {
  /** The photo on the new record that was already used. */
  photoUrl: string;
  /** Where the earlier copy is attached. */
  existingKind: 'lost' | 'found' | 'shelter_animal';
  existingId: string;
}

/**
 * Checks a new record's photos against every photo already attached to another report or shelter
 * animal. Only photos that are actually attached somewhere count: a photo uploaded for a report
 * that never got submitted (a failed attempt, then a retry) is not a duplicate of anything.
 * Never throws - a failed check must not block a report.
 */
export async function findDuplicatePhotos(
  photoUrls: string[],
  ownRecordId: string,
): Promise<DuplicatePhoto[]> {
  if (!photoUrls.length) return [];
  try {
    const own = await PhotoFingerprint.find({ url: { $in: photoUrls } }, 'url sha256 dHash').lean();
    if (!own.length) return [];

    const others = await PhotoFingerprint.find({ url: { $nin: photoUrls } }, 'url sha256 dHash')
      .sort({ createdAt: -1 })
      .limit(COMPARE_WINDOW)
      .lean();

    const matches = new Map<string, string>(); // earlier photo url -> new photo url
    for (const mine of own) {
      for (const other of others) {
        if (other.sha256 === mine.sha256 || isSamePhoto(other.dHash, mine.dHash)) {
          if (!matches.has(other.url)) matches.set(other.url, mine.url);
        }
      }
    }
    if (!matches.size) return [];

    const earlierUrls = [...matches.keys()];
    const notSelf = { _id: { $ne: ownRecordId }, imageUrls: { $in: earlierUrls } };
    const [lost, found, animals] = await Promise.all([
      LostPetReport.find(notSelf, '_id imageUrls').lean(),
      FoundAnimalReport.find(notSelf, '_id imageUrls').lean(),
      ShelterAnimal.find(notSelf, '_id imageUrls').lean(),
    ]);

    const results: DuplicatePhoto[] = [];
    const seen = new Set<string>();
    const collect = (kind: DuplicatePhoto['existingKind'], docs: { _id: unknown; imageUrls: string[] }[]) => {
      for (const doc of docs) {
        for (const url of doc.imageUrls) {
          const mine = matches.get(url);
          if (mine && !seen.has(mine)) {
            seen.add(mine);
            results.push({ photoUrl: mine, existingKind: kind, existingId: String(doc._id) });
          }
        }
      }
    };
    collect('lost', lost);
    collect('found', found);
    collect('shelter_animal', animals);
    return results;
  } catch (err) {
    logger.error('fingerprint: duplicate check failed, continuing without it', err);
    return [];
  }
}

/** Removes the fingerprint when its photo is deleted, so a deleted report never counts as the "original". */
export async function forgetPhoto(url: string): Promise<void> {
  try {
    await PhotoFingerprint.deleteOne({ url });
  } catch {
    // best-effort
  }
}
