import { env } from '../config/env';
import { logger } from '../utils/logger';
import { readStoredPhoto } from './storage.service';
import { interpretPrePass, PREPASS_PROMPT, type PrePassVerdict } from './photoPrePass';

/**
 * Vision calls via Gemini's free-tier API (aistudio.google.com/apikey): direct photo-to-photo
 * comparison for matching, and a single-photo screen for report flagging.
 *
 * This is deliberately not an embedding/cosine-similarity pipeline: that shape assumes a
 * self-hosted model producing a fixed vector per photo, cacheable and comparable to many others
 * for free. A hosted vision model like Gemini doesn't expose that on its free tier - each call is
 * its own request. `matching.service.ts` accounts for that by pre-filtering candidates with the
 * cheap attribute heuristic first, so only a handful of genuinely plausible pairs ever reach here.
 */
const keys = env.gemini.apiKeys;
const configured = keys.length > 0;

/** No Gemini call may hold a request open longer than this, unless the caller asks for less. */
const DEFAULT_TIMEOUT_MS = 10_000;
/** How long a key that hit its rate limit (429) or quota (403) is skipped before it is tried again. */
const KEY_REST_MS = 60_000;
/** A key Google refuses as invalid is skipped for longer: it will not start working by itself. */
const INVALID_KEY_REST_MS = 10 * 60_000;

const restingUntil = new Map<number, number>();
let nextKey = 0;

/**
 * What Gemini last did, shown in System Management: without it a failing screen (quota used up, a
 * retired model name, a bad key) only shows as "screening unavailable" on the phone.
 */
const health: {
  lastSuccessAt?: string;
  lastError?: { at: string; status?: number; message: string };
} = {};
const noteError = (message: string, status?: number) => {
  health.lastError = { at: new Date().toISOString(), message: message.slice(0, 300), ...(status ? { status } : {}) };
};
/** Each key's own last refusal, so "every key is resting" can still show what Google said about each one. */
const keyErrors = new Map<number, { at: string; status: number; message: string }>();
/** Google's own one-line explanation out of its JSON error body (falls back to the raw text). */
function googleMessage(detail: string): string {
  try {
    const parsed = JSON.parse(detail) as { error?: { message?: string; status?: string } };
    if (parsed.error?.message) return `${parsed.error.status ? `${parsed.error.status}: ` : ''}${parsed.error.message}`;
  } catch {
    /* not JSON */
  }
  return detail;
}
const noteKeyError = (index: number, status: number, detail: string) => {
  const message = googleMessage(detail).replace(/\s+/g, ' ').slice(0, 300);
  keyErrors.set(index, { at: new Date().toISOString(), status, message });
  noteError(`Key #${index + 1}: ${message}`, status);
};

export function geminiHealth() {
  const now = Date.now();
  return {
    configured,
    model: env.gemini.model,
    keys: keys.length,
    restingKeys: keys.filter((_, i) => (restingUntil.get(i) ?? 0) > now).length,
    ...health,
    keyErrors: [...keyErrors.entries()]
      .sort(([a], [b]) => a - b)
      .map(([i, e]) => ({ key: i + 1, ...e, resting: (restingUntil.get(i) ?? 0) > now })),
  };
}

/** True while at least one key is usable (not resting after a rate limit). */
export function geminiHasCapacity(): boolean {
  if (!configured) return false;
  const now = Date.now();
  return keys.some((_, i) => (restingUntil.get(i) ?? 0) <= now);
}

/**
 * Keys to try for one call, round-robin so the load spreads evenly, leaving out any key still
 * resting after a rate limit. Empty when every key is resting: the call then gives up at once
 * instead of waiting, which is what kept report submissions hanging until Vercel killed them.
 */
function keysToTry(): number[] {
  const now = Date.now();
  const start = nextKey++ % keys.length;
  const order = keys.map((_, i) => (start + i) % keys.length);
  return order.filter((i) => (restingUntil.get(i) ?? 0) <= now);
}

/**
 * Calls Gemini with a prompt and 0+ inline images, parsing the JSON response it's asked to return.
 * Never throws and never runs past `timeoutMs`: on a rate limit it moves straight to the next key;
 * on a timeout, network error or server error it returns null rather than retrying with the time
 * the person is waiting on. Keys are sent in a header and logged by number, never in a URL or log.
 */
async function generateJson(
  prompt: string,
  images: { mimeType: string; buffer: Buffer }[],
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Record<string, unknown> | null> {
  const deadline = Date.now() + timeoutMs;
  const candidates = keysToTry();
  if (!candidates.length) {
    logger.warn('gemini: every key is resting after a rate limit, skipping this call');
    // Keep each key's own reason (shown per key); only fill the summary line when there is none.
    if (!keyErrors.size) noteError('Every API key is resting after hitting its rate limit or quota.', 429);
    return null;
  }

  const body = JSON.stringify({
    contents: [
      {
        parts: [
          { text: prompt },
          ...images.map((img) => ({ inline_data: { mime_type: img.mimeType, data: img.buffer.toString('base64') } })),
        ],
      },
    ],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
  });

  for (const index of candidates) {
    const remaining = deadline - Date.now();
    if (remaining < 500) break;
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${env.gemini.model}:generateContent`, {
        method: 'POST',
        signal: AbortSignal.timeout(remaining),
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': keys[index] },
        body,
      });

      if (res.status === 429 || res.status === 403) {
        restingUntil.set(index, Date.now() + KEY_REST_MS);
        const detail = await res.text().catch(() => '');
        logger.warn(`gemini: key #${index + 1} hit its limit (${res.status}), resting it and trying the next key`);
        noteKeyError(index, res.status, detail);
        continue;
      }
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        // A key Google does not accept (mistyped, deleted, wrong kind of key) is that key's
        // problem, not the photo's: rest it for longer and go on with the next key, instead of
        // failing the whole screen on the first bad key in the list.
        if (res.status === 401 || (res.status === 400 && /API_KEY_INVALID|API key not valid/i.test(detail))) {
          restingUntil.set(index, Date.now() + INVALID_KEY_REST_MS);
          logger.warn(`gemini: key #${index + 1} was refused as invalid (${res.status}), trying the next key`);
          noteKeyError(index, res.status, detail);
          continue;
        }
        // e.g. 404 when the model name no longer exists, 400 for a bad request - say which.
        logger.error(`gemini: request failed (${res.status}) ${detail.slice(0, 200)}`);
        noteError(`Request failed: ${detail || res.statusText}`, res.status);
        return null;
      }

      const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        noteError('Gemini answered without any text (the photo may have been blocked by its safety filter).');
        return null;
      }
      // Occasionally the JSON comes wrapped in a ```json fence despite the JSON response type.
      const json = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      const parsed = JSON.parse(json) as Record<string, unknown>;
      health.lastSuccessAt = new Date().toISOString();
      keyErrors.delete(index); // this key works again
      return parsed;
    } catch (err) {
      logger.error('gemini: request failed', err);
      noteError(err instanceof Error ? (err.name === 'TimeoutError' ? 'Timed out waiting for Gemini.' : err.message) : String(err));
      return null;
    }
  }
  return null;
}

const COMPARE_PROMPT = `You are comparing two photos to help reunite a lost pet with its owner.
Photo A: a lost pet. Photo B: a candidate - a found stray, or an animal in a shelter's care.
Judge only visual similarity: fur color and pattern, breed-typical features, distinctive markings, and build or size. Ignore background, lighting, pose, and image quality differences.
Respond with strict JSON only, no other text, matching this shape exactly:
{"score": <integer 0-100, how likely these two photos show the same individual animal>, "reasoning": "<one short sentence citing the most important similarity or difference>"}`;

/** Several comparisons run side by side after a report is saved; each gets a short budget. */
const COMPARE_TIMEOUT_MS = 8_000;

export interface PhotoCompareResult {
  score: number; // 0-1
  reasoning: string;
}

/** Never throws: a failed or unconfigured comparison must not block matching or report creation. */
export async function compareAnimalPhotos(photoUrlA: string, photoUrlB: string): Promise<PhotoCompareResult | null> {
  if (!configured) return null;

  const [a, b] = await Promise.all([readStoredPhoto(photoUrlA), readStoredPhoto(photoUrlB)]);
  if (!a || !b) return null;

  const parsed = await generateJson(COMPARE_PROMPT, [a, b], COMPARE_TIMEOUT_MS);
  const score = Number(parsed?.score);
  if (!Number.isFinite(score)) return null;

  return {
    score: Math.max(0, Math.min(100, score)) / 100,
    reasoning: String(parsed?.reasoning ?? '').slice(0, 300),
  };
}

const PHOTO_SCREEN_PROMPT = `You are screening a photo attached to a lost/found pet report on a community app.
Answer two questions about this image:
1. Does it clearly show a real domestic animal (e.g. a dog, cat, or similar pet or stray), consistent with a genuine lost/found pet report?
2. Is it inappropriate, offensive, or otherwise unrelated to a pet report - e.g. explicit content, a meme, a screenshot, or an unrelated object?
Respond with strict JSON only, no other text, matching this shape exactly:
{"looksLikeAnimal": <boolean>, "inappropriate": <boolean>, "reasoning": "<one short sentence explaining your answer>"}`;

export interface PhotoScreenResult {
  looksLikeAnimal: boolean;
  inappropriate: boolean;
  reasoning: string;
}

/** Never throws: a failed or unconfigured screen must not block report creation. */
export async function assessAnimalPhoto(photoUrl: string): Promise<PhotoScreenResult | null> {
  if (!configured) return null;

  const photo = await readStoredPhoto(photoUrl);
  if (!photo) return null;

  const parsed = await generateJson(PHOTO_SCREEN_PROMPT, [photo]);
  if (!parsed || typeof parsed.looksLikeAnimal !== 'boolean' || typeof parsed.inappropriate !== 'boolean') return null;

  return {
    looksLikeAnimal: parsed.looksLikeAnimal,
    inappropriate: parsed.inappropriate,
    reasoning: String(parsed.reasoning ?? '').slice(0, 300),
  };
}

/**
 * Upload gate. Two tries of 12 s with a short pause between stay under the 30 s Vercel function
 * limit. The retry matters: the free tier rate-limits bursts (a report with several photos, plus
 * the matching calls that follow), and a single failed call used to let a photo in unscreened.
 */
const PREPASS_TIMEOUT_MS = 12_000;
const PREPASS_ATTEMPTS = 2;
const PREPASS_RETRY_PAUSE_MS = 1_500;

/**
 * Pre-pass for a photo that has not been saved yet (the upload route passes the raw bytes).
 * Returns null when Gemini is unconfigured, or still unreachable / unreadable after a retry -
 * the caller decides what "could not screen" means. Never throws.
 */
export async function prePassAnimalPhoto(buffer: Buffer, mimeType: string): Promise<PrePassVerdict | null> {
  if (!configured) return null;
  for (let attempt = 1; attempt <= PREPASS_ATTEMPTS; attempt++) {
    const verdict = interpretPrePass(await generateJson(PREPASS_PROMPT, [{ mimeType, buffer }], PREPASS_TIMEOUT_MS));
    if (verdict) return verdict;
    if (attempt < PREPASS_ATTEMPTS) {
      logger.warn(`upload pre-pass: no usable answer from Gemini (attempt ${attempt}), retrying`);
      await new Promise((resolve) => setTimeout(resolve, PREPASS_RETRY_PAUSE_MS));
    }
  }
  return null;
}

export const geminiConfigured = configured;

// ----- Photo autofill and natural-language search -----

const DESCRIBE_PROMPT = `You help people file lost and found pet reports in San Jose Del Monte, Bulacan (Philippines).
Look at this photo and describe every dog or cat (or other domestic animal) you can see, up to 4, from the most prominent.
For each animal give what can be seen, never invent: if something cannot be seen, use null.
- "animalType": "dog", "cat" or "other"
- "breed": a likely breed or "Aspin" (Asong Pinoy) / "Puspin" (Pusang Pinoy) for local mixed breeds, or null
- "color": main fur color(s) and pattern, e.g. "brown with white chest"
- "size": "small", "medium" or "large" (adult-size judgement), or null
- "sex": "male", "female" or "unknown" (almost always "unknown" unless it is obvious)
- "distinctMarks": visible distinguishing features (collar, spots, scars, ear shape, tail), or null
- "position": where it is in the photo, e.g. "left", "center", "right", "front"
- "description": 1-2 sentences describing ONLY physical features (fur, markings, build, collar). Never use or guess a name, never mention people, places or the background.
- "tags": 3 to 8 short lowercase search tags about its features, e.g. ["dog","brown","white chest","short fur","red collar"]
Respond with strict JSON only, matching exactly: {"animals": [ { ...fields above } ]}. Use {"animals": []} when there is no animal.`;

export interface AnimalDescription {
  animalType: 'dog' | 'cat' | 'other';
  breed: string | null;
  color: string | null;
  size: 'small' | 'medium' | 'large' | null;
  sex: 'male' | 'female' | 'unknown';
  distinctMarks: string | null;
  position: string | null;
  description: string;
  tags: string[];
}

const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | null =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v.toLowerCase()) ? (v.toLowerCase() as T) : null;

/** Strips names the model may still have slipped in ("named Bantay", "called Mingming"). */
function featuresOnly(text: string): string {
  return text.replace(/\b(named|called|answers to)\s+["']?[A-Z][\w-]*["']?/g, '').replace(/\s{2,}/g, ' ').trim();
}

/** Turns one animal from the model's answer into safe, size-limited fields. */
function cleanAnimal(raw: unknown): AnimalDescription | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  const animalType = oneOf(a.animalType, ['dog', 'cat', 'other'] as const);
  if (!animalType) return null;
  const tags = Array.isArray(a.tags)
    ? [...new Set(a.tags.map((t) => String(t).toLowerCase().trim().slice(0, 30)).filter(Boolean))].slice(0, 8)
    : [];
  return {
    animalType,
    breed: str(a.breed, 100),
    color: str(a.color, 100),
    size: oneOf(a.size, ['small', 'medium', 'large'] as const),
    sex: oneOf(a.sex, ['male', 'female', 'unknown'] as const) ?? 'unknown',
    distinctMarks: str(a.distinctMarks, 500),
    position: str(a.position, 40),
    description: featuresOnly(str(a.description, 600) ?? ''),
    tags,
  };
}

/**
 * Photo autofill: what the report form should be pre-filled with. Returns [] when there is no
 * animal, and null when Gemini is unavailable (the form then simply stays empty). Never throws.
 */
export async function describeAnimalPhoto(photoUrl: string): Promise<AnimalDescription[] | null> {
  if (!configured) return null;
  const photo = await readStoredPhoto(photoUrl);
  if (!photo) return null;
  const parsed = await generateJson(DESCRIBE_PROMPT, [photo], 20_000);
  if (!parsed || !Array.isArray(parsed.animals)) return null;
  return parsed.animals.map(cleanAnimal).filter((a): a is AnimalDescription => a !== null).slice(0, 4);
}

const SEARCH_PROMPT = (query: string, today: string, barangays: string) => `Turn a search typed into a lost-and-found pet app into filters.
The search may be in English, Filipino/Tagalog or Taglish: translate it (aso = dog, pusa = cat, itim = black, puti = white,
kayumanggi/brown, dilaw = yellow, nawawala = lost, nakita/napulot = found).
Today is ${today} (Asia/Manila). Barangays of San Jose Del Monte: ${barangays}.
Search: """${query.replace(/"/g, "'")}"""
Rules:
- "kind" only when the search clearly says lost (nawawala, missing) or found (nakita, stray, napulot). "Looking for" / "hanap" alone is NOT a kind: null.
- "colors": the fur colours named, in English, lowercase (e.g. ["black"], ["orange","white"]).
- "place": the place words exactly as typed (e.g. "francisco", "muzon", "near the church"), else null.
- "barangays": EVERY barangay from the list the place could mean (e.g. "francisco" means all four "Francisco Homes-..." barangays); [] if none.
- "keywords": only distinctive physical features or accessories (e.g. "collar", "white paws", "limp"). Never filler words, the animal type, colours, places or dates.
Respond with strict JSON only, every field null (or []) when the search does not say it:
{"kind": "lost" | "found" | null, "animalType": "dog" | "cat" | "other" | null, "colors": [string], "breed": string | null,
 "size": "small" | "medium" | "large" | null, "place": string | null, "barangays": [<exact barangay names from the list>],
 "dateFrom": "YYYY-MM-DD" | null, "dateTo": "YYYY-MM-DD" | null, "keywords": [string],
 "summary": "<one short sentence, in English, saying what is being searched for>"}`;

export interface SearchFilters {
  kind: 'lost' | 'found' | null;
  animalType: 'dog' | 'cat' | 'other' | null;
  color: string | null;
  breed: string | null;
  size: 'small' | 'medium' | 'large' | null;
  /** One barangay when the place means exactly one (kept for older app builds). */
  barangay: string | null;
  /** Every barangay the place could mean ("francisco" -> all four Francisco Homes barangays). */
  barangays: string[];
  /** The place words as typed, also matched against street addresses and landmarks. */
  place: string | null;
  /** Fur colours named, in English. */
  colors: string[];
  dateFrom: string | null;
  dateTo: string | null;
  keywords: string[];
  summary: string;
}

const isoDay = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/** "brown aspin found near Muzon last week" -> filters. Null when Gemini is unavailable. */
export async function parseSearchQuery(query: string, barangayNames: string[]): Promise<SearchFilters | null> {
  if (!configured) return null;
  const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
  const parsed = await generateJson(SEARCH_PROMPT(query.slice(0, 300), today, barangayNames.join(', ')), [], 12_000);
  if (!parsed) return null;
  const place = str(parsed.place, 60)?.toLowerCase().trim() || null;
  const named = new Set<string>();
  const exact = (v: unknown) => (typeof v === 'string' ? barangayNames.find((b) => b.toLowerCase() === v.toLowerCase()) : undefined);
  for (const b of Array.isArray(parsed.barangays) ? parsed.barangays : [parsed.barangay]) {
    const hit = exact(b);
    if (hit) named.add(hit);
  }
  // Every barangay whose name contains what was typed: "francisco" -> all Francisco Homes.
  if (place) {
    const words = place.split(/[^a-zñ0-9]+/).filter((w) => w.length > 2 && !['near', 'the', 'sa', 'malapit', 'brgy', 'barangay'].includes(w));
    for (const b of barangayNames) if (words.some((w) => b.toLowerCase().includes(w))) named.add(b);
  }
  const barangays = [...named];
  const colors = (Array.isArray(parsed.colors) ? parsed.colors : parsed.color ? [parsed.color] : [])
    .map((c) => String(c).toLowerCase().trim().slice(0, 20))
    .filter(Boolean)
    .slice(0, 4);
  return {
    kind: oneOf(parsed.kind, ['lost', 'found'] as const),
    animalType: oneOf(parsed.animalType, ['dog', 'cat', 'other'] as const),
    color: colors.length ? colors.join(' and ') : null,
    colors,
    breed: str(parsed.breed, 60),
    size: oneOf(parsed.size, ['small', 'medium', 'large'] as const),
    barangay: barangays.length === 1 ? barangays[0] : null,
    barangays,
    place,
    dateFrom: isoDay(parsed.dateFrom),
    dateTo: isoDay(parsed.dateTo),
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords.map((k) => String(k).toLowerCase().slice(0, 30)).slice(0, 8) : [],
    summary: str(parsed.summary, 200) ?? '',
  };
}
