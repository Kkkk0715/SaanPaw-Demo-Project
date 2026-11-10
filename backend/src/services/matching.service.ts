import { ANIMAL_TYPES } from '../config/constants';
import { FoundAnimalReport } from '../models/FoundAnimalReport';
import { LostPetReport } from '../models/LostPetReport';
import { Shelter } from '../models/Shelter';
import { ShelterAnimal } from '../models/ShelterAnimal';
import { geoPointToLatLng, type LatLng } from '../utils/geoHelpers';
import { compareAnimalPhotos, geminiConfigured } from './gemini.service';
import { notify } from './pushNotification.service';
import { logger } from '../utils/logger';

export type AnimalType = (typeof ANIMAL_TYPES)[number];
type CandidateSource = 'found_report' | 'shelter_animal';

/** The subset `attributeScore` actually reads - both match directions' candidates satisfy this. */
interface ScorableCandidate {
  animalType: AnimalType;
  color?: string | null;
  breed?: string | null;
  size?: string | null;
  location?: LatLng;
}

interface Candidate extends ScorableCandidate {
  id: string;
  source: CandidateSource;
  imageUrls: string[];
}

export interface MatchInput {
  animalType: AnimalType;
  color?: string;
  breed?: string;
  size?: string;
  location: LatLng;
  imageUrl?: string;
}

export interface RankedMatch {
  candidateId: string;
  candidateSource: CandidateSource;
  score: number;
  reasons: string[];
}

/** How many candidates the cheap heuristic shortlists for an actual (Gemini) photo comparison. */
const SHORTLIST_SIZE = 8;
/**
 * Of the shortlist, only the best few get a Gemini photo comparison; the rest keep their attribute
 * score. Comparing all 8 at once was a burst of requests that ran into the free-tier rate limit.
 */
const GEMINI_COMPARE_LIMIT = 4;
const MAX_RESULTS = 6;
/**
 * A candidate is a possible match when its details line up (same species plus at least one more
 * thing: colour, breed, size or a nearby location) or when the photos look alike. Photos are not
 * required: a report whose photo comparison failed, timed out or scored low still shows up when
 * its details agree, instead of only appearing after a manual image match.
 */
const ATTRIBUTE_MIN = 0.5;
const VISION_MIN = 0.5;

export interface MatchOptions {
  /** Skip the Gemini photo comparison (cheap refresh when a report's matches are loaded). */
  attributesOnly?: boolean;
}

/** Photo similarity weighs more than the details, but a low photo score no longer erases a detail match. */
function combineScores(attr: number, vision: number | null): number {
  if (vision == null) return attr;
  return Math.min(0.99, 0.6 * vision + 0.4 * attr);
}

function keep(attr: number, vision: number | null): boolean {
  return attr >= ATTRIBUTE_MIN || (vision != null && vision >= VISION_MIN);
}

function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Cheap, free attribute scoring used only to shortlist which candidates are worth an actual photo
 * comparison - never the final word once Gemini is configured. Mirrors the offline heuristic in
 * shared/src/store/AppStore.tsx (used verbatim when there is no backend session to call).
 */
export function attributeScore(input: MatchInput, candidate: ScorableCandidate): { score: number; reasons: string[] } | null {
  if (candidate.animalType !== input.animalType) return null; // a cat is never a match for a dog

  const reasons: string[] = [`Species match (${input.animalType})`];
  let score = 0.35;

  const colorWords = (input.color ?? '').toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2);
  const candidateColor = (candidate.color ?? '').toLowerCase();
  const overlap = colorWords.filter((w) => candidateColor.includes(w));
  if (overlap.length) {
    score += Math.min(0.3, 0.15 * overlap.length);
    reasons.push(`Fur color overlap on "${overlap.join(', ')}"`);
  }

  if (input.breed && candidate.breed && candidate.breed.toLowerCase().includes(input.breed.toLowerCase().split(' ')[0])) {
    score += 0.15;
    reasons.push(`Breed reads as ${candidate.breed}`);
  }

  if (input.size && candidate.size === input.size) {
    score += 0.1;
    reasons.push(`Same size class (${input.size})`);
  }

  if (candidate.location) {
    const d = haversineMeters(input.location, candidate.location);
    if (d < 2000) {
      score += 0.15;
      reasons.push(`Recorded ${(d / 1000).toFixed(1)} km away`);
    } else if (d < 6000) {
      score += 0.05;
      reasons.push(`Recorded ${(d / 1000).toFixed(1)} km away`);
    } else {
      reasons.push(`Recorded ${(d / 1000).toFixed(1)} km away - outside the usual stray range`);
    }
  }

  return { score: Math.min(0.99, score), reasons };
}

async function gatherCandidates(animalType: AnimalType): Promise<Candidate[]> {
  const [foundReports, shelterAnimals] = await Promise.all([
    FoundAnimalReport.find({
      animalType,
      // A found report already suggested for someone else's pet is still unclaimed.
      status: { $in: ['active', 'matched'] },
      isHiddenByModeration: false,
    })
      .sort({ reportedAt: -1 })
      .limit(200)
      .lean(),
    ShelterAnimal.find({
      animalType,
      caseStatus: { $in: ['under_rescue', 'inconclusive'] },
      isHiddenByModeration: false,
    })
      .limit(200)
      .lean(),
  ]);

  const shelterIds = [...new Set(shelterAnimals.map((a) => String(a.shelterId)))];
  const shelters = shelterIds.length ? await Shelter.find({ _id: { $in: shelterIds } }, 'location').lean() : [];
  const shelterLocation = new Map(shelters.map((s) => [String(s._id), geoPointToLatLng(s.location as any)]));

  const fromReports: Candidate[] = foundReports.map((r) => ({
    id: String(r._id),
    source: 'found_report',
    animalType: r.animalType as AnimalType,
    color: r.color,
    breed: r.breed,
    size: r.size,
    imageUrls: r.imageUrls,
    location: geoPointToLatLng(r.foundLocation as any),
  }));

  const fromAnimals: Candidate[] = shelterAnimals.map((a) => ({
    id: String(a._id),
    source: 'shelter_animal',
    animalType: a.animalType as AnimalType,
    color: a.color,
    breed: a.breed,
    size: a.size,
    imageUrls: a.imageUrls,
    location: shelterLocation.get(String(a.shelterId)),
  }));

  return [...fromReports, ...fromAnimals];
}

/**
 * Ranks real candidates (found reports + shelter animals) against a lost pet's photo and
 * attributes. The cheap heuristic shortlists which candidates are worth a Gemini photo comparison;
 * once Gemini is configured, its score replaces the heuristic one for whichever candidates it
 * successfully compares, with the heuristic score as the fallback for the rest.
 */
export async function findMatches(input: MatchInput, opts: MatchOptions = {}): Promise<RankedMatch[]> {
  const candidates = await gatherCandidates(input.animalType);

  const shortlisted = candidates
    .map((c) => {
      const attr = attributeScore(input, c);
      return attr && { candidate: c, ...attr };
    })
    .filter((x): x is { candidate: Candidate; score: number; reasons: string[] } => Boolean(x))
    .sort((a, b) => b.score - a.score)
    .slice(0, SHORTLIST_SIZE);

  const ranked = await Promise.all(
    shortlisted.map(async ({ candidate, score, reasons }, i) => {
      const candidatePhoto = candidate.imageUrls?.[0];
      const visionResult =
        !opts.attributesOnly && input.imageUrl && candidatePhoto && i < GEMINI_COMPARE_LIMIT
          ? await compareAnimalPhotos(input.imageUrl, candidatePhoto)
          : null;
      const vision = visionResult ? visionResult.score : null;

      return {
        candidateId: candidate.id,
        candidateSource: candidate.source,
        score: combineScores(score, vision),
        reasons: visionResult?.reasoning ? [visionResult.reasoning, ...reasons] : reasons,
        keep: keep(score, vision),
      };
    }),
  );

  return ranked
    .filter((m) => m.keep)
    .map(({ keep: _keep, ...m }) => m)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RESULTS);
}

export interface EvaluatedMatch extends RankedMatch {
  /** suggested: show it to the owner. rejected: the photos say it is a different animal. */
  verdict: 'suggested' | 'rejected';
}

/**
 * Checks a lost report against the found reports and shelter animals it has not been checked
 * against yet, so possible matches appear on their own instead of only after a manual image scan.
 *
 * Found reports go first. Up to `photoBudget` of them also get a Gemini photo comparison, which
 * decides on its own: alike photos make it a match even when the typed details differ (one owner
 * writes "orange", the finder writes "ginger"), different photos rule it out. Without a photo
 * comparison the details decide (same species plus colour, breed, size or a nearby spot). A
 * candidate that could not be decided yet is left out of the result and tried again next time.
 */
export async function evaluateNewCandidates(
  input: MatchInput,
  alreadyEvaluated: Set<string>,
  photoBudget = 2,
): Promise<EvaluatedMatch[]> {
  const scored = (await gatherCandidates(input.animalType))
    .filter((c) => !alreadyEvaluated.has(`${c.source}:${c.id}`))
    .map((c) => ({ candidate: c, attr: attributeScore(input, c) }))
    .filter((x): x is { candidate: Candidate; attr: { score: number; reasons: string[] } } => Boolean(x.attr))
    .sort(
      (a, b) =>
        Number(b.candidate.source === 'found_report') - Number(a.candidate.source === 'found_report') ||
        b.attr.score - a.attr.score,
    );

  let budget = geminiConfigured && input.imageUrl ? photoBudget : 0;
  const plan = scored.map((x) => {
    const compare = budget > 0 && Boolean(x.candidate.imageUrls?.[0]);
    if (compare) budget -= 1;
    return { ...x, compare };
  });

  const results = await Promise.all(
    plan.map(async ({ candidate, attr, compare }): Promise<EvaluatedMatch | null> => {
      const vision = compare ? await compareAnimalPhotos(input.imageUrl!, candidate.imageUrls[0]) : null;
      const base = { candidateId: candidate.id, candidateSource: candidate.source };
      if (vision) {
        const isMatch = keep(attr.score, vision.score) && vision.score >= VISION_MIN * 0.6;
        return {
          ...base,
          score: combineScores(attr.score, vision.score),
          reasons: vision.reasoning ? [vision.reasoning, ...attr.reasons] : attr.reasons,
          verdict: isMatch ? 'suggested' : 'rejected',
        };
      }
      if (keep(attr.score, null)) return { ...base, score: attr.score, reasons: attr.reasons, verdict: 'suggested' };
      return null; // not decided yet: no photo comparison this time and the details alone are too thin
    }),
  );
  return results.filter((r): r is EvaluatedMatch => Boolean(r));
}

/**
 * Tells each owner whose lost pet may have just turned up: an entry in their alerts plus a push to
 * their phone. Never throws - the report or intake that found the match is already saved.
 */
export async function alertOwnersOfNewMatches(lostReportIds: string[], what: string): Promise<void> {
  try {
    if (!lostReportIds.length) return;
    const reports = await LostPetReport.find({ _id: { $in: lostReportIds } }, 'reporterId name animalType').lean();
    await Promise.all(
      reports.map((r) =>
        notify({
          audienceType: 'user',
          audienceId: r.reporterId,
          type: 'match',
          refId: r._id,
          title: `Possible match for ${r.name || `your ${r.animalType}`}`,
          body: `${what} may be your pet. Open SaanPaw to compare.`,
        }),
      ),
    );
  } catch (err) {
    logger.error('matching: failed to alert owners of new matches', err);
  }
}

interface LostCandidate extends ScorableCandidate {
  id: string;
  imageUrls: string[];
}

async function gatherLostCandidates(animalType: AnimalType): Promise<LostCandidate[]> {
  const lostReports = await LostPetReport.find({
    animalType,
    status: 'active',
    isHiddenByModeration: false,
  })
    .sort({ reportedAt: -1 })
    .limit(200)
    .lean();

  return lostReports.map((r) => ({
    id: String(r._id),
    animalType: r.animalType as AnimalType,
    color: r.color,
    breed: r.breed,
    size: r.size,
    imageUrls: r.imageUrls,
    location: geoPointToLatLng(r.lastSeenLocation as any),
  }));
}

export interface RankedLostMatch {
  lostReportId: string;
  score: number;
  reasons: string[];
}

/**
 * The reverse of findMatches: given a newly posted found animal (found report or shelter intake),
 * ranks the active lost reports it might solve. Same attribute shortlist + Gemini photo comparison
 * as the other direction, just over LostPetReport instead - so a lost pet's owner gets a suggestion
 * the moment a matching found/intake record appears, not only when they happen to file (or reopen)
 * their own lost report after it.
 */
export async function findMatchingLostReports(input: MatchInput, opts: MatchOptions = {}): Promise<RankedLostMatch[]> {
  const candidates = await gatherLostCandidates(input.animalType);

  const shortlisted = candidates
    .map((c) => {
      const attr = attributeScore(input, c);
      return attr && { candidate: c, ...attr };
    })
    .filter((x): x is { candidate: LostCandidate; score: number; reasons: string[] } => Boolean(x))
    .sort((a, b) => b.score - a.score)
    .slice(0, SHORTLIST_SIZE);

  const ranked = await Promise.all(
    shortlisted.map(async ({ candidate, score, reasons }, i) => {
      const candidatePhoto = candidate.imageUrls?.[0];
      const visionResult =
        !opts.attributesOnly && input.imageUrl && candidatePhoto && i < GEMINI_COMPARE_LIMIT
          ? await compareAnimalPhotos(input.imageUrl, candidatePhoto)
          : null;
      const vision = visionResult ? visionResult.score : null;

      return {
        lostReportId: candidate.id,
        score: combineScores(score, vision),
        reasons: visionResult?.reasoning ? [visionResult.reasoning, ...reasons] : reasons,
        keep: keep(score, vision),
      };
    }),
  );

  return ranked
    .filter((m) => m.keep)
    .map(({ keep: _keep, ...m }) => m)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RESULTS);
}
