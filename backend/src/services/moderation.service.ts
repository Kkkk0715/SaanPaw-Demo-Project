import { env } from '../config/env';
import { ModerationFlag } from '../models/ModerationFlag';
import { User } from '../models/User';
import { LostPetReport } from '../models/LostPetReport';
import { FoundAnimalReport } from '../models/FoundAnimalReport';
import { ShelterAnimal } from '../models/ShelterAnimal';
import { assessAnimalPhoto } from './gemini.service';
import { getSystemConfig } from './systemConfig.service';
import { deleteUserCascade } from './cascadeDelete.service';
import { accountDeletedEmail, sendEmail } from './email.service';
import { notify } from './pushNotification.service';
import { logger } from '../utils/logger';
import { combineName } from '../utils/geoHelpers';

/**
 * Report Monitoring - automatic flagging.
 *
 * This is a transparent screen, not a trained model: every signal is a named rule with a weight,
 * and the reason the report was flagged is recorded so the Developer can see it. It reads the text
 * fields of a report, checks how many photos it has, looks for a near-identical report from the
 * same person, and - when GEMINI_API_KEY is configured - has Gemini look at the report's own photo
 * for whether it shows a real animal and whether it's inappropriate (see `screenReport`). Without
 * that key, those two checks are skipped and the screen behaves exactly as before.
 *
 * A report is flagged when its combined confidence reaches REVIEW_THRESHOLD. Flagging never hides
 * a report: the Developer reviews it, and only a Developer decision removes it. When a reporter
 * accumulates enough upheld flags, `escalateReporter` bans the account.
 */
export const REVIEW_THRESHOLD = 0.5;

export type FlagReason = 'ai_false_positive' | 'inappropriate' | 'duplicate' | 'manual';

/** Abusive or explicit words, English and Filipino. Matched as whole words. */
const INAPPROPRIATE_WORDS = [
  'fuck',
  'fucking',
  'shit',
  'bitch',
  'asshole',
  'bastard',
  'cunt',
  'porn',
  'xxx',
  'putang',
  'putangina',
  'tangina',
  'gago',
  'tarantado',
  'ulol',
  'bobo',
  'pakyu',
  'kantot',
  'jakol',
  'pokpok',
];

const SPAM_PATTERNS: RegExp[] = [
  /https?:\/\//,
  /\bwww\./,
  /\b[a-z0-9-]+\.(com|net|org|ph|xyz|top|club|shop|site)\b/,
  /\b(buy now|click here|free money|promo code|discount|earn money|bitcoin|crypto|gcash me|load promo|follow my page|subscribe)\b/,
];

const PLACEHOLDER_PATTERNS: RegExp[] = [
  /\b(test test|testing|testing 123|test only|asdf|asdfgh|qwerty|zxcv|lorem ipsum|not real|just a test|prank|joke)\b/,
  /(.)\1{5,}/, // "aaaaaaa"
];

export interface Assessment {
  confidence: number;
  reason: FlagReason;
  detail: string;
  signals: string[];
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

const containsWord = (text: string, word: string) => new RegExp(`(^|[^a-z])${word}([^a-z]|$)`).test(text);

/**
 * Scores one report. Pure, so every rule can be tested without a database or a network call -
 * `photoSignal` is Gemini's already-computed verdict on the report's photo (or undefined, when
 * unconfigured or the call failed), not something this function fetches itself.
 * `duplicate` is true when the same reporter filed a near-identical report recently.
 */
export function assessReport(input: {
  text: string;
  imageCount: number;
  duplicate?: boolean;
  /** How many of the report's photos were already used on another report or shelter animal. */
  duplicatePhotos?: number;
  photoSignal?: { looksLikeAnimal: boolean; inappropriate: boolean; reasoning: string };
}): Assessment {
  const text = normalize(input.text);
  const signals: { reason: FlagReason; weight: number; detail: string }[] = [];

  const abusive = INAPPROPRIATE_WORDS.filter((w) => containsWord(text, w));
  if (abusive.length) {
    signals.push({
      reason: 'inappropriate',
      weight: 0.7,
      detail: 'The text contains abusive or explicit language.',
    });
  }

  if (SPAM_PATTERNS.some((p) => p.test(text))) {
    signals.push({
      reason: 'manual',
      weight: 0.6,
      detail: 'The text contains a web link or promotional wording.',
    });
  }

  if (PLACEHOLDER_PATTERNS.some((p) => p.test(text))) {
    signals.push({
      reason: 'ai_false_positive',
      weight: 0.6,
      detail: 'The text reads like placeholder or test content.',
    });
  }

  if (input.duplicate) {
    signals.push({
      reason: 'duplicate',
      weight: 0.6,
      detail: 'The same reporter filed a near-identical report in the last 24 hours.',
    });
  }

  if (input.duplicatePhotos) {
    signals.push({
      reason: 'duplicate',
      weight: 0.6,
      detail:
        input.duplicatePhotos === 1
          ? 'A photo on this report was already used on another report.'
          : `${input.duplicatePhotos} photos on this report were already used on other reports.`,
    });
  }

  // Weak signals: not enough alone, but they tip a borderline report over the threshold.
  if (input.imageCount === 0) {
    signals.push({ reason: 'ai_false_positive', weight: 0.25, detail: 'The report has no photo.' });
  }
  if (text.trim().length < 15) {
    signals.push({ reason: 'ai_false_positive', weight: 0.2, detail: 'The report has almost no description.' });
  }

  // Gemini's verdict on the report's own photo. Weighted below the equivalent text rules: a
  // single vision call is a less certain signal than deterministic word-matching, so it tips a
  // borderline report over the threshold rather than deciding one on its own.
  if (input.photoSignal?.inappropriate) {
    signals.push({
      reason: 'inappropriate',
      weight: 0.5,
      detail: `Image review: ${input.photoSignal.reasoning}`,
    });
  }
  if (input.photoSignal && !input.photoSignal.looksLikeAnimal) {
    signals.push({
      reason: 'ai_false_positive',
      weight: 0.35,
      detail: `Image review: ${input.photoSignal.reasoning}`,
    });
  }

  const confidence = Math.min(1, signals.reduce((sum, s) => sum + s.weight, 0));
  const strongest = [...signals].sort((a, b) => b.weight - a.weight)[0];
  return {
    confidence,
    reason: strongest?.reason ?? 'ai_false_positive',
    detail: signals.length ? signals.map((s) => s.detail).join(' ') : '',
    signals: signals.map((s) => s.detail),
  };
}

export interface ScreenOutcome {
  flagged: boolean;
  /** What the screen found, for the person who filed it. */
  detail?: string;
}
const NOT_FLAGGED: ScreenOutcome = { flagged: false };

const REASON_WORDS: Record<string, string> = {
  ai_false_positive: 'Report looked false or like test content',
  inappropriate: 'Inappropriate language or image',
  duplicate: 'Duplicate report or reused photo',
  manual: 'Spam or promotional content',
};

/** One line per upheld flag for the account-deletion email: when, what, and the admin's note. */
function describeFlag(f: { createdAt?: Date; reason: string; detail?: string | null; resolutionNote?: string | null; reportType: string }) {
  const when = f.createdAt ? new Date(f.createdAt).toLocaleDateString('en-PH', { dateStyle: 'medium' }) : 'Unknown date';
  const parts = [`${when} - ${f.reportType} report: ${REASON_WORDS[f.reason] ?? f.reason}`];
  if (f.detail) parts.push(f.detail);
  if (f.resolutionNote) parts.push(`Admin note: ${f.resolutionNote}`);
  return parts.join('. ');
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const moderationService = {
  /** True when this reporter already filed a report with the same animal, colour and area, or the same description, in the last 24 hours. */
  async isDuplicate(params: {
    reportType: 'lost' | 'found';
    reportId: string;
    reporterId: string;
    animalType: string;
    color?: string;
    barangay: string;
    description?: string;
  }): Promise<boolean> {
    const or: Record<string, unknown>[] = [];
    if (params.color?.trim()) {
      or.push({
        animalType: params.animalType,
        barangay: params.barangay,
        color: new RegExp(`^${escapeRegExp(params.color.trim())}$`, 'i'),
      });
    }
    if (params.description?.trim()) {
      or.push({ description: new RegExp(`^${escapeRegExp(params.description.trim())}$`, 'i') });
    }
    if (!or.length) return false;
    const filter = {
      _id: { $ne: params.reportId },
      reporterId: params.reporterId,
      reportedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      $or: or,
    };
    const count =
      params.reportType === 'lost'
        ? await LostPetReport.countDocuments(filter)
        : await FoundAnimalReport.countDocuments(filter);
    return count > 0;
  },

  /**
   * Screens a freshly filed report and records a flag when it needs review. Never throws: a
   * problem in the screen must not stop someone from reporting a lost pet.
   */
  async screenReport(params: {
    reportType: 'lost' | 'found';
    reportId: string;
    reporterId: string;
    text: string;
    imageCount: number;
    imageUrl?: string;
    animalType: string;
    color?: string;
    barangay: string;
    description?: string;
    duplicatePhotos?: number;
  }): Promise<ScreenOutcome> {
    try {
      if (!(await getSystemConfig()).aiModeration) return NOT_FLAGGED;
      const [duplicate, photoSignal] = await Promise.all([
        this.isDuplicate(params),
        params.imageUrl ? assessAnimalPhoto(params.imageUrl) : Promise.resolve(null),
      ]);
      const result = assessReport({
        text: params.text,
        imageCount: params.imageCount,
        duplicate,
        duplicatePhotos: params.duplicatePhotos,
        photoSignal: photoSignal ?? undefined,
      });
      if (result.confidence < REVIEW_THRESHOLD) return NOT_FLAGGED;

      const flag = await ModerationFlag.create({
        reportType: params.reportType,
        reportId: params.reportId,
        reporterId: params.reporterId,
        reason: result.reason,
        detail: result.detail,
        aiConfidence: result.confidence,
      });
      if (params.reportType === 'lost') {
        await LostPetReport.findByIdAndUpdate(params.reportId, { moderationFlagId: flag._id });
      } else {
        await FoundAnimalReport.findByIdAndUpdate(params.reportId, { moderationFlagId: flag._id });
      }
      logger.warn(
        `moderation: flagged ${params.reportType} ${params.reportId} as ${result.reason} (confidence ${result.confidence.toFixed(2)})`,
      );
      await notify({
        audienceType: 'user',
        audienceId: params.reporterId,
        type: 'moderation',
        refId: params.reportId,
        title: 'Your report was flagged for review',
        body: `Our automatic check flagged your ${params.reportType} report: ${result.detail} An admin will review it. It stays visible until then.`,
      });
      return { flagged: true, detail: result.detail };
    } catch (err) {
      logger.error('moderation: screening failed, report left unflagged', err);
      return NOT_FLAGGED;
    }
  },

  /**
   * Same screen as screenReport, for a shelter's own animal posting. No duplicate check - a
   * shelter legitimately intakes visually-similar animals over time, so that signal does not
   * apply here. Never throws, for the same reason: a screening hiccup must not block an intake.
   */
  async screenShelterAnimal(params: {
    shelterId: string;
    animalId: string;
    text: string;
    imageCount: number;
    imageUrl?: string;
    duplicatePhotos?: number;
  }): Promise<ScreenOutcome> {
    try {
      if (!(await getSystemConfig()).aiModeration) return NOT_FLAGGED;
      const photoSignal = params.imageUrl ? await assessAnimalPhoto(params.imageUrl) : null;
      const result = assessReport({
        text: params.text,
        imageCount: params.imageCount,
        duplicate: false,
        duplicatePhotos: params.duplicatePhotos,
        photoSignal: photoSignal ?? undefined,
      });
      if (result.confidence < REVIEW_THRESHOLD) return NOT_FLAGGED;

      const flag = await ModerationFlag.create({
        reportType: 'shelter_animal',
        reportId: params.animalId,
        reporterId: params.shelterId,
        reason: result.reason,
        detail: result.detail,
        aiConfidence: result.confidence,
      });
      await ShelterAnimal.findByIdAndUpdate(params.animalId, { moderationFlagId: flag._id });
      logger.warn(
        `moderation: flagged shelter_animal ${params.animalId} as ${result.reason} (confidence ${result.confidence.toFixed(2)})`,
      );
      await notify({
        audienceType: 'shelter',
        audienceId: params.shelterId,
        type: 'moderation',
        refId: params.animalId,
        title: 'Your animal posting was flagged for review',
        body: `Our automatic check flagged one of your animal postings: ${result.detail} An admin will review it.`,
      });
      return { flagged: true, detail: result.detail };
    } catch (err) {
      logger.error('moderation: shelter animal screening failed, posting left unflagged', err);
      return NOT_FLAGGED;
    }
  },

  /**
   * Called by the Developer controller after upholding a flag. Only flags a Developer upheld
   * ("actioned") count - an automatic flag alone never costs anyone their account. At the
   * threshold (3 by default) the account is deleted, after emailing the person why.
   * Otherwise the person is told how many upheld flags they have and what happens at the limit.
   */
  async escalateReporter(
    reporterId: string,
  ): Promise<{ banned: boolean; deleted: boolean; upheldFlags: number; email?: { sent: boolean; queued: boolean } }> {
    const upheld = await ModerationFlag.find({ reporterId, status: 'actioned' }).sort({ createdAt: 1 }).lean();
    const limit = env.moderation.falseReportBanThreshold;

    if (upheld.length < limit) {
      await notify({
        audienceType: 'user',
        audienceId: reporterId,
        type: 'moderation',
        title: 'Your account was flagged',
        body:
          `An admin upheld a flag on one of your reports and removed it. This is flag ${upheld.length} of ${limit}. ` +
          `At ${limit} upheld flags your account will be deleted.`,
      });
      return { banned: false, deleted: false, upheldFlags: upheld.length };
    }

    const user = await User.findById(reporterId).lean();
    if (!user) return { banned: false, deleted: false, upheldFlags: upheld.length };

    // Email first: once the cascade runs, the address and the flag history are gone. sendEmail
    // retries, and failing that keeps the message in the outbox to retry later.
    const email = await sendEmail(
      accountDeletedEmail({
        name: combineName(user),
        email: user.email,
        reasons: upheld.map((f) => describeFlag(f)),
        limit,
      }),
    );
    await deleteUserCascade(reporterId);
    logger.warn(`moderation: deleted user ${reporterId} after ${upheld.length} upheld flags`);
    return { banned: true, deleted: true, upheldFlags: upheld.length, email };
  },
};
