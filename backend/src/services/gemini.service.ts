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

export function geminiHealth() {
  const now = Date.now();
  return {
    configured,
    model: env.gemini.model,
    keys: keys.length,
    restingKeys: keys.filter((_, i) => (restingUntil.get(i) ?? 0) > now).length,
    ...health,
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
    noteError('Every API key is resting after hitting its rate limit or quota.', 429);
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
        noteError(`Key #${index + 1}: ${res.status === 429 ? 'rate limit or daily quota reached' : 'access refused'}. ${detail}`, res.status);
        continue;
      }
      if (!res.ok) {
        // e.g. 404 when the model name no longer exists, 400 for a bad request - say which.
        const detail = await res.text().catch(() => '');
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
