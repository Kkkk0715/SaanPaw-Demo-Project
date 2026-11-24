import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';

/**
 * Guest reports (no account): every report needs an owner account, so reports from guests all
 * belong to one built-in "SaanPaw Guest" account. It can never be signed in to (random password,
 * a non-deliverable address, and login refuses it), it is hidden from the console's user list,
 * and it can't be banned or deleted (that would remove every guest report at once).
 *
 * Who actually made a guest report is the name and phone number on the report itself, and the
 * guest manages it (mark resolved, delete) with a private key their phone keeps.
 */
export const GUEST_EMAIL = 'guest-reports@saanpaw.invalid';
let cachedId: string | null = null;

export async function guestAccountId(): Promise<string> {
  if (cachedId) return cachedId;
  const existing = await User.findOne({ email: GUEST_EMAIL }, '_id').lean();
  if (existing) return (cachedId = String(existing._id));
  try {
    const created = await User.create({
      firstName: 'SaanPaw',
      lastName: 'Guest',
      email: GUEST_EMAIL,
      passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10),
      isGuest: true,
      barangay: 'Guest',
      // City hall; never used for alerts (guests are skipped).
      homeLocation: { type: 'Point', coordinates: [121.0453, 14.8139] },
    });
    return (cachedId = String(created._id));
  } catch {
    // Two first guest reports at once: the other one created it.
    const again = await User.findOne({ email: GUEST_EMAIL }, '_id').lean();
    if (!again) throw new ApiError(500, 'Could not save the guest report. Try again.');
    return (cachedId = String(again._id));
  }
}

/** The guest's private key for one report: returned once, only its hash is stored. */
export function newGuestKey() {
  const key = crypto.randomBytes(24).toString('hex');
  return { key, hash: crypto.createHash('sha256').update(key).digest('hex') };
}
export const hashGuestKey = (key: string) => crypto.createHash('sha256').update(key).digest('hex');

/** Refuses console actions on the shared guest account (they would hit every guest report). */
export function assertNotGuestAccount(user: { isGuest?: boolean | null } | null | undefined) {
  if (user?.isGuest) {
    throw ApiError.badRequest('This is the shared account that holds guest reports. Remove the individual reports instead.');
  }
}
