import { env } from '../config/env';
import { logger } from '../utils/logger';
import { readStoredPhoto } from './storage.service';

/**
 * Direct photo-to-photo comparison via Gemini's free-tier vision API (aistudio.google.com/apikey).
 *
 * This is deliberately not the embedding/cosine-similarity pipeline sketched in
 * `imageRecognition.service.ts` (see docs/data-flow-diagrams.md, Figure 29): that shape assumes a
 * self-hosted model producing a fixed vector per photo, cacheable and comparable to many others
 * for free. A hosted vision model like Gemini doesn't expose that on its free tier - each
 * comparison is its own request, given both photos at once. `matching.service.ts` accounts for
 * that by pre-filtering candidates with the cheap attribute heuristic first, so only a handful of
 * genuinely plausible pairs ever reach here.
 */
const configured = Boolean(env.gemini.apiKey);

const PROMPT = `You are comparing two photos to help reunite a lost pet with its owner.
Photo A: a lost pet. Photo B: a candidate - a found stray, or an animal in a shelter's care.
Judge only visual similarity: coat colour and pattern, breed-typical features, distinctive markings, and build or size. Ignore background, lighting, pose, and image quality differences.
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

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${env.gemini.model}:generateContent?key=${env.gemini.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: PROMPT },
                { inline_data: { mime_type: a.mimeType, data: a.buffer.toString('base64') } },
                { inline_data: { mime_type: b.mimeType, data: b.buffer.toString('base64') } },
              ],
            },
          ],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
        }),
      },
    );

    if (!res.ok) {
      logger.error(`gemini: compare request failed (${res.status})`);
      return null;
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    const parsed = JSON.parse(text) as { score?: unknown; reasoning?: unknown };
    const score = Number(parsed.score);
    if (!Number.isFinite(score)) return null;

    return {
      score: Math.max(0, Math.min(100, score)) / 100,
      reasoning: String(parsed.reasoning ?? '').slice(0, 300),
    };
  } catch (err) {
    logger.error('gemini: compare failed', err);
    return null;
  }
}

export const geminiConfigured = configured;
