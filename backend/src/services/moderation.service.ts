import { env } from '../config/env';
import { ModerationFlag } from '../models/ModerationFlag';
import { User } from '../models/User';
import { LostPetReport } from '../models/LostPetReport';
import { FoundAnimalReport } from '../models/FoundAnimalReport';
import { logger } from '../utils/logger';

/**
 * Report Monitoring - automatic flagging.
 *
 * This is a transparent rule-based screen, not a trained model: every signal is a named rule with
 * a weight, and the reason the report was flagged is recorded so the Developer can see it. It
 * reads the text fields of a report, checks how many photos it has, and looks for a near-identical
 * report from the same person. Image content is not analysed (that needs a real classifier - see
 * the note in `assessReport`).
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
 * Scores one report. Pure, so every rule can be tested without a database.
 * `duplicate` is true when the same reporter filed a near-identical report recently.
 */
export function assessReport(input: { text: string; imageCount: number; duplicate?: boolean }): Assessment {
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

  // Weak signals: not enough alone, but they tip a borderline report over the threshold.
  if (input.imageCount === 0) {
    signals.push({ reason: 'ai_false_positive', weight: 0.25, detail: 'The report has no photo.' });
  }
  if (text.trim().length < 15) {
    signals.push({ reason: 'ai_false_positive', weight: 0.2, detail: 'The report has almost no description.' });
  }

  // TODO: image moderation (NSFW / not-an-animal) needs a real classifier; add its score here.

  const confidence = Math.min(1, signals.reduce((sum, s) => sum + s.weight, 0));
  const strongest = [...signals].sort((a, b) => b.weight - a.weight)[0];
  return {
    confidence,
    reason: strongest?.reason ?? 'ai_false_positive',
    detail: signals.length ? signals.map((s) => s.detail).join(' ') : '',
    signals: signals.map((s) => s.detail),
  };
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
    animalType: string;
    color?: string;
    barangay: string;
    description?: string;
  }): Promise<void> {
    try {
      const duplicate = await this.isDuplicate(params);
      const result = assessReport({ text: params.text, imageCount: params.imageCount, duplicate });
      if (result.confidence < REVIEW_THRESHOLD) return;

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
    } catch (err) {
      logger.error('moderation: screening failed, report left unflagged', err);
    }
  },

  /** Called by the Developer controller after actioning a flag. */
  async escalateReporter(reporterId: string): Promise<{ banned: boolean }> {
    const actioned = await ModerationFlag.countDocuments({
      reporterId,
      status: 'actioned',
    });
    if (actioned >= env.moderation.falseReportBanThreshold) {
      await User.findByIdAndUpdate(reporterId, { isBanned: true });
      await Promise.all([
        LostPetReport.updateMany({ reporterId }, { isHiddenByModeration: true }),
        FoundAnimalReport.updateMany({ reporterId }, { isHiddenByModeration: true }),
      ]);
      return { banned: true };
    }
    return { banned: false };
  },
};
