/**
 * One-time fix: re-tags every lost/found report with the barangay its pin is actually in.
 * Reports filed from older app builds carry the reporter's own barangay wherever the pin was,
 * which then shows on every map label and report card.
 *
 *   npm run fix-report-barangays            # dry run: prints what would change, writes nothing
 *   npm run fix-report-barangays -- --apply # writes the corrections
 *
 * Uses the same lookup new reports now get (services/pinBarangay.service.ts): OpenStreetMap's name
 * for the spot, else the nearest barangay centre. Lookups keep to OSM's one-request-per-second
 * limit, so expect about a second per report. Safe to re-run. Points at MONGODB_URI like every
 * other script, so run it with the production URI to fix production.
 */
import { connectDatabase, disconnectDatabase } from '../config/db';
import { LostPetReport } from '../models/LostPetReport';
import { FoundAnimalReport } from '../models/FoundAnimalReport';
import { barangayForPin } from '../services/pinBarangay.service';
import { logger } from '../utils/logger';

const apply = process.argv.includes('--apply');

async function fix(kind: 'lost' | 'found') {
  const Model: any = kind === 'lost' ? LostPetReport : FoundAnimalReport;
  const field = kind === 'lost' ? 'lastSeenLocation' : 'foundLocation';
  const reports = await Model.find({}, `_id ${field} barangay`).lean();
  let changed = 0;
  for (const r of reports) {
    const [lng, lat] = r[field]?.coordinates ?? [];
    if (lng == null || lat == null) continue;
    const barangay = await barangayForPin(lat, lng);
    if (barangay === r.barangay) continue;
    logger.info(`${kind} ${r._id}: ${r.barangay} -> ${barangay}`);
    if (apply) await Model.updateOne({ _id: r._id }, { barangay });
    changed++;
  }
  return { checked: reports.length, changed };
}

async function main() {
  await connectDatabase();
  const lost = await fix('lost');
  const found = await fix('found');
  logger.info(
    `${apply ? 'Re-tagged' : 'Would re-tag'} ${lost.changed}/${lost.checked} lost and ${found.changed}/${found.checked} found reports.` +
      (apply ? '' : ' Run again with --apply to write them.'),
  );
  await disconnectDatabase();
}

main().catch(async (err) => {
  logger.error('fix-report-barangays failed', err);
  await disconnectDatabase();
  process.exit(1);
});
