/**
 * One-time backfill: gives every lost/found report filed before addresses were captured a
 * street-level address, looked up from its pin the same way the report form now does.
 *
 *   npm run backfill-addresses            # dry run: prints what it would set, writes nothing
 *   npm run backfill-addresses -- --apply # writes the addresses
 *
 * Only touches reports with no address yet, so it is safe to re-run. Lookups go through
 * reverseGeocode.service.ts, which keeps to OpenStreetMap's one-request-per-second limit - expect
 * about a second per report. Points at MONGODB_URI like every other script.
 */
import { connectDatabase, disconnectDatabase } from '../config/db';
import { LostPetReport } from '../models/LostPetReport';
import { FoundAnimalReport } from '../models/FoundAnimalReport';
import { reverseGeocode } from '../services/reverseGeocode.service';
import { logger } from '../utils/logger';

const apply = process.argv.includes('--apply');
const missing = { $or: [{ address: { $exists: false } }, { address: '' }, { address: null }] };

async function backfill(kind: 'lost' | 'found') {
  const Model: any = kind === 'lost' ? LostPetReport : FoundAnimalReport;
  const field = kind === 'lost' ? 'lastSeenLocation' : 'foundLocation';
  const reports = await Model.find(missing, `_id ${field} barangay`).lean();
  let filled = 0;
  for (const r of reports) {
    const [lng, lat] = r[field]?.coordinates ?? [];
    if (lng == null || lat == null) continue;
    const result = await reverseGeocode(lat, lng);
    if (!result?.address) continue;
    logger.info(`${kind} ${r._id} (${r.barangay}): ${result.address}`);
    if (apply) await Model.updateOne({ _id: r._id }, { address: result.address });
    filled++;
  }
  return { checked: reports.length, filled };
}

async function main() {
  await connectDatabase();
  const lost = await backfill('lost');
  const found = await backfill('found');
  logger.info(
    `${apply ? 'Filled' : 'Would fill'} ${lost.filled}/${lost.checked} lost and ${found.filled}/${found.checked} found reports.` +
      (apply ? '' : ' Run again with --apply to write them.'),
  );
  await disconnectDatabase();
}

main().catch(async (err) => {
  logger.error('backfill-addresses failed', err);
  await disconnectDatabase();
  process.exit(1);
});
