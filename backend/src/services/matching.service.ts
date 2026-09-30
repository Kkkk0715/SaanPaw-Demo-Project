import { ANIMAL_TYPES } from '../config/constants';
import { FoundAnimalReport } from '../models/FoundAnimalReport';
import { Shelter } from '../models/Shelter';
import { ShelterAnimal } from '../models/ShelterAnimal';
import { geoPointToLatLng, type LatLng } from '../utils/geoHelpers';
import { compareAnimalPhotos } from './gemini.service';

type AnimalType = (typeof ANIMAL_TYPES)[number];
type CandidateSource = 'found_report' | 'shelter_animal';

interface Candidate {
  id: string;
  source: CandidateSource;
  animalType: AnimalType;
  color?: string | null;
  breed?: string | null;
  size?: string | null;
  imageUrls: string[];
  location?: LatLng;
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
const MAX_RESULTS = 6;
const MIN_SCORE = 0.2;

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
export function attributeScore(input: MatchInput, candidate: Candidate): { score: number; reasons: string[] } | null {
  if (candidate.animalType !== input.animalType) return null; // a cat is never a match for a dog

  const reasons: string[] = [`Species match (${input.animalType})`];
  let score = 0.35;

  const colorWords = (input.color ?? '').toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2);
  const candidateColor = (candidate.color ?? '').toLowerCase();
  const overlap = colorWords.filter((w) => candidateColor.includes(w));
  if (overlap.length) {
    score += Math.min(0.3, 0.15 * overlap.length);
    reasons.push(`Coat colour overlap on "${overlap.join(', ')}"`);
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
      status: 'active',
      isHiddenByModeration: false,
      imageUrls: { $exists: true, $ne: [] },
    })
      .limit(200)
      .lean(),
    ShelterAnimal.find({
      animalType,
      caseStatus: { $in: ['under_rescue', 'inconclusive'] },
      imageUrls: { $exists: true, $ne: [] },
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
export async function findMatches(input: MatchInput): Promise<RankedMatch[]> {
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
    shortlisted.map(async ({ candidate, score, reasons }) => {
      const candidatePhoto = candidate.imageUrls[0];
      const visionResult =
        input.imageUrl && candidatePhoto ? await compareAnimalPhotos(input.imageUrl, candidatePhoto) : null;

      return {
        candidateId: candidate.id,
        candidateSource: candidate.source,
        score: visionResult ? visionResult.score : score,
        reasons: visionResult ? [visionResult.reasoning, ...reasons] : reasons,
      };
    }),
  );

  return ranked
    .filter((m) => m.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RESULTS);
}
