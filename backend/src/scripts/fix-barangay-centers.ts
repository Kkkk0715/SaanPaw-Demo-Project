/**
 * One-time data fix for the barangay-center correction in shared/src/sjdm.ts.
 *
 * Every user, shelter, and report saved by picking a barangay was stored at that barangay's old
 * (wrong) center. This moves exactly those records to the corrected center, and nothing else:
 * a record is only touched when its barangay matches AND its coordinates are still exactly the
 * old center, so a pin someone deliberately placed elsewhere is never moved.
 *
 *   npm run fix-barangay-centers            # dry run: prints what would change, writes nothing
 *   npm run fix-barangay-centers -- --apply # does it
 *
 * Idempotent: once moved, a record no longer matches the old center, so running it again is a no-op.
 * Points at MONGODB_URI like every other script, so run it with the production URI to fix production.
 */
import { connectDatabase, disconnectDatabase } from '../config/db';
import { User } from '../models/User';
import { Shelter } from '../models/Shelter';
import { LostPetReport } from '../models/LostPetReport';
import { FoundAnimalReport } from '../models/FoundAnimalReport';
import { logger } from '../utils/logger';

// [latitude, longitude]. Duplicated from shared/src/sjdm.ts on purpose - the backend can't import
// the shared package (rootDir is src/), and a one-off migration should pin the exact values it
// moves between rather than follow whatever that table says later.
const OLD: Record<string, [number, number]> = {
  Muzon: [14.7845, 121.0287],
  'Tungkong Mangga': [14.7972, 121.0489],
  Kaypian: [14.8043, 121.0361],
  'Gaya-Gaya': [14.7899, 121.0452],
  Poblacion: [14.8136, 121.0453],
  'Poblacion 1': [14.8168, 121.0498],
  'San Manuel': [14.8251, 121.0392],
  'Sto. Cristo': [14.8302, 121.0537],
  'San Rafael V': [14.8087, 121.0664],
  Graceville: [14.7961, 121.0172],
  'Minuyan Proper': [14.8449, 121.0721],
  'Sapang Palay Proper': [14.8378, 121.0596],
  Citrus: [14.8221, 121.0688],
  'Dulong Bayan': [14.8194, 121.0431],
  'Paradise III': [14.8055, 121.0578],
};

const NEW: Record<string, [number, number]> = {
  Muzon: [14.8019, 121.0347],
  'Tungkong Mangga': [14.7891, 121.0747],
  Kaypian: [14.8216, 121.0626],
  'Gaya-Gaya': [14.795, 121.0523],
  Poblacion: [14.815, 121.0418],
  'Poblacion 1': [14.8088, 121.0456],
  'San Manuel': [14.7817, 121.0685],
  'Sto. Cristo': [14.8253, 121.0789],
  'San Rafael V': [14.8499, 121.045],
  Graceville: [14.7874, 121.061],
  'Minuyan Proper': [14.8428, 121.0786],
  'Sapang Palay Proper': [14.8407, 121.0449],
  Citrus: [14.8492, 121.0647],
  'Dulong Bayan': [14.8268, 121.0447],
  'Paradise III': [14.8236, 121.1146],
};

const apply = process.argv.includes('--apply');
// Coordinates round-trip through JSON and Mongo as the same doubles, so this only absorbs
// representation noise - it is not a "near the old center" match.
const EPS = 1e-9;

interface Target {
  label: string;
  model: { find: (...args: any[]) => any; updateOne: (...args: any[]) => any };
  field: string;
}

const TARGETS: Target[] = [
  { label: 'users', model: User as never, field: 'homeLocation' },
  { label: 'shelters', model: Shelter as never, field: 'location' },
  { label: 'lost reports', model: LostPetReport as never, field: 'lastSeenLocation' },
  { label: 'found reports', model: FoundAnimalReport as never, field: 'foundLocation' },
];

async function run() {
  await connectDatabase();
  logger.info(apply ? 'APPLYING barangay center fix' : 'DRY RUN - nothing will be written (add --apply to write)');

  let total = 0;
  for (const target of TARGETS) {
    let moved = 0;
    for (const [barangay, [oldLat, oldLng]] of Object.entries(OLD)) {
      const [newLat, newLng] = NEW[barangay];
      const docs = await target.model.find({ barangay }, `${target.field}`).lean();
      for (const doc of docs as any[]) {
        const [lng, lat] = doc[target.field]?.coordinates ?? [];
        if (Math.abs(lat - oldLat) > EPS || Math.abs(lng - oldLng) > EPS) continue;
        moved++;
        if (apply) {
          await target.model.updateOne({ _id: doc._id }, { $set: { [`${target.field}.coordinates`]: [newLng, newLat] } });
        }
      }
    }
    total += moved;
    logger.info(`${target.label}: ${moved} ${apply ? 'moved' : 'would move'}`);
  }

  logger.info(`${apply ? 'Done' : 'Dry run done'} - ${total} record(s) ${apply ? 'moved' : 'would be moved'}`);
  await disconnectDatabase();
}

run().catch((err) => {
  logger.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
