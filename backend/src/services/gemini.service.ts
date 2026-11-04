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
const configured = Boolean(env.gemini.apiKey);

/** Calls Gemini with a prompt and 0+ inline images, parsing the JSON response it's asked to return. */
async function generateJson(
  prompt: string,
  images: { mimeType: string; buffer: Buffer }[],
  timeoutMs?: number,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${env.gemini.model}:generateContent?key=${env.gemini.apiKey}`,
      {
        method: 'POST',
        signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                ...images.map((img) => ({ inline_data: { mime_type: img.mimeType, data: img.buffer.toString('base64') } })),
              ],
            },
          ],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
        }),
      },
    );

    if (!res.ok) {
      logger.error(`gemini: request failed (${res.status})`);
      return null;
    }

    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    // Occasionally the JSON comes wrapped in a ```json fence despite the JSON response type.
    const json = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    return JSON.parse(json) as Record<string, unknown>;
  } catch (err) {
    logger.error('gemini: request failed', err);
    return null;
  }
}

const COMPARE_PROMPT = `You are comparing two photos to help reunite a lost pet with its owner.
Photo A: a lost pet. Photo B: a candidate - a found stray, or an animal in a shelter's care.
Judge only visual similarity: fur color and pattern, breed-typical features, distinctive markings, and build or size. Ignore background, lighting, pose, and image quality differences.
Respond with strict JSON only, no other text, matching this shape exactly:
{"score": <integer 0-100, how likely these two photos show the same individual animal>, "reasoning": "<one short sentence citing the most important similarity or difference>"}`;

export interface PhotoCompareResult {
  score: number; // 0-1
  reasoning: string;
}

/** Never throws: a failed or unconfigured comparison must not block matching or report creation. */
export async function compareAnimalPhotos(photoUrlA: string, photoUrlB: string): Promise<PhotoCompareResult | null> {
  if (!configured) return null;

  const [a, b] = await Promise.all([readStoredPhoto(photoUrlA), readStoredPhoto(photoUrlB)]);
  if (!a || !b) return null;

  const parsed = await generateJson(COMPARE_PROMPT, [a, b]);
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
