/**
 * Upload pre-pass: decides from Gemini's answer whether a photo may enter the system at all.
 *
 * Unlike the flagging screen in moderation.service.ts (which only marks a saved report for the
 * Developer to review), a photo that fails here is refused at upload and never stored, so it can
 * never appear on a report, a shelter posting, or in an image-recognition scan.
 *
 * Pure and dependency-free so every rule is testable without a network call or a database.
 */

/** What Gemini is asked to classify the main subject of a photo as. */
export const PREPASS_SPECIES = ['dog', 'cat', 'other_pet', 'livestock', 'wildlife', 'none'] as const;
export type PrePassSpecies = (typeof PREPASS_SPECIES)[number];

/**
 * The animals SaanPaw accepts, matching ANIMAL_TYPES in config/constants.ts: dog, cat, and
 * "other" - read as other household pets (rabbits, birds, hamsters, turtles...). Livestock and
 * wildlife are refused; add 'livestock' here if strays such as goats or chickens should count.
 */
export const ALLOWED_PREPASS_SPECIES: readonly PrePassSpecies[] = ['dog', 'cat', 'other_pet'];

export const PREPASS_PROMPT = `You are the upload gate for SaanPaw, a lost-pet and stray-animal recovery app.
Someone is attaching this image to a lost pet report, a found animal report, a shelter's animal record, or a photo-match search.
Classify the image:
1. "species": the main animal shown. One of:
   "dog", "cat",
   "other_pet" (a household pet that is not a dog or cat - rabbit, bird, hamster, guinea pig, turtle, fish, etc.),
   "livestock" (goat, pig, cow, chicken, carabao, horse...),
   "wildlife" (wild animals, insects, reptiles in the wild...),
   "none" (no animal is clearly visible).
2. "isRealPhoto": true only for a real camera photo of a real, living animal. false for drawings, cartoons, AI art, memes, screenshots of apps or text, stuffed toys, figurines, or photos of a screen.
3. "inappropriate": true if the image is explicit, violent, gory, or offensive.
Respond with strict JSON only, no other text, matching this shape exactly:
{"species": "<one of the values above>", "isRealPhoto": <boolean>, "inappropriate": <boolean>, "reasoning": "<one short sentence about what the image shows>"}`;

export type PrePassVerdict =
  | { allowed: true; species: PrePassSpecies; reasoning: string }
  | { allowed: false; species: PrePassSpecies | null; reasoning: string; message: string };

const SPECIES_LABEL: Record<PrePassSpecies, string> = {
  dog: 'a dog',
  cat: 'a cat',
  other_pet: 'a pet',
  livestock: 'livestock',
  wildlife: 'a wild animal',
  none: 'no animal',
};

const ACCEPTED_HINT = 'Please upload a clear, real photo of the dog, cat, or other pet.';

/** Words Gemini sometimes uses instead of the exact values it was asked for. */
const SPECIES_ALIASES: Record<string, PrePassSpecies> = {
  puppy: 'dog',
  dogs: 'dog',
  kitten: 'cat',
  cats: 'cat',
  other: 'other_pet',
  pet: 'other_pet',
  otherpet: 'other_pet',
};

/**
 * Reads the species loosely ("Dog", " cat ", "other pet", "kitten"), because a strict match turned
 * small wording slips into "could not screen". Anything that is not one of the accepted animals,
 * including words like "human", "hand" or "object", counts as "none" - refused, not waved through.
 */
function normaliseSpecies(value: unknown): PrePassSpecies {
  if (typeof value !== 'string') return 'none';
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if ((PREPASS_SPECIES as readonly string[]).includes(key)) return key as PrePassSpecies;
  return SPECIES_ALIASES[key.replace(/_/g, '')] ?? SPECIES_ALIASES[key] ?? 'none';
}

/** true / false, also accepting the strings "true" / "false". Anything else is unknown (null). */
function readBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true') return true;
    if (v === 'false') return false;
  }
  return null;
}

/**
 * Turns Gemini's parsed JSON into a verdict. Fails closed wherever the answer allows it: a photo
 * that is not clearly an accepted animal is refused even when the rest of the answer is garbled.
 * Returns null only when Gemini gave no answer at all, or named an accepted animal but did not
 * say whether it is a real photo - the caller treats that as "could not screen".
 */
export function interpretPrePass(parsed: Record<string, unknown> | null): PrePassVerdict | null {
  if (!parsed) return null;
  const s = normaliseSpecies(parsed.species);
  const isRealPhoto = readBoolean(parsed.isRealPhoto);
  const inappropriate = readBoolean(parsed.inappropriate);
  const reasoning = String(parsed.reasoning ?? '').slice(0, 300);

  if (inappropriate) {
    return { allowed: false, species: s, reasoning, message: 'This photo was refused because it contains inappropriate content.' };
  }
  if (!ALLOWED_PREPASS_SPECIES.includes(s)) {
    return {
      allowed: false,
      species: s,
      reasoning,
      message: `This photo was refused: it appears to show ${SPECIES_LABEL[s]}, not an animal SaanPaw accepts. ${ACCEPTED_HINT}`,
    };
  }
  // An accepted animal, but no clear yes/no on whether the photo is real: unknown, not a pass.
  if (isRealPhoto === null || inappropriate === null) return null;
  if (!isRealPhoto) {
    return {
      allowed: false,
      species: s,
      reasoning,
      message: `This photo was refused: it does not look like a real photo of a live animal (drawings, screenshots, memes and toys are not accepted). ${ACCEPTED_HINT}`,
    };
  }
  return { allowed: true, species: s, reasoning };
}
