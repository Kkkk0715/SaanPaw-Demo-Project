import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { promises as dns } from 'dns';
import { EmailVerification } from '../models/EmailVerification';
import { Shelter } from '../models/Shelter';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';
import { emailVerificationEmail, sendEmail } from './email.service';
import {
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_TOKEN_TTL_MS,
  OTP_TTL_MS,
  otpSent,
  type OtpSent,
} from './otp';

export type VerificationPurpose = 'register_user' | 'register_shelter';

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

/**
 * Refuses an address whose domain cannot receive email at all (a typo like "gmial.com", or a made
 * up domain). Only a definite "this domain does not exist / has no mail server" refuses it; if the
 * DNS lookup itself fails, the code email decides instead.
 */
export async function assertDomainReceivesEmail(email: string): Promise<void> {
  const domain = email.split('@')[1];
  if (!domain) throw ApiError.badRequest('Enter a valid email address');
  const missing = (err: unknown) => ['ENOTFOUND', 'ENODATA', 'NXDOMAIN'].includes((err as { code?: string })?.code ?? '');
  try {
    const mx = await dns.resolveMx(domain);
    if (mx.length) return;
  } catch (err) {
    if (!missing(err)) {
      logger.warn(`email check: could not look up ${domain}, letting the code email decide`, err);
      return;
    }
  }
  // No mail server listed: a domain with a plain address record can still receive mail.
  try {
    if ((await dns.resolve4(domain)).length) return;
  } catch (err) {
    if (!missing(err)) return;
  }
  throw ApiError.badRequest(`"${domain}" cannot receive email. Check the address for typos.`);
}

async function alreadyRegistered(email: string, purpose: VerificationPurpose): Promise<boolean> {
  if (purpose === 'register_user') return Boolean(await User.exists({ email }));
  return Boolean(
    (await Shelter.exists({ email, approvalStatus: { $in: ['pending', 'approved'] } })) ||
      (await Shelter.exists({ adminEmail: email })),
  );
}

export const emailVerificationService = {
  /** Emails a 6-digit code to the address someone wants to sign up with. */
  async sendCode(rawEmail: string, purpose: VerificationPurpose): Promise<OtpSent> {
    const email = rawEmail.toLowerCase().trim();
    await assertDomainReceivesEmail(email);
    if (await alreadyRegistered(email, purpose)) throw ApiError.conflict('Email already registered');

    const existing = await EmailVerification.findOne({ email, purpose });
    if (existing?.codeHash && existing.sentAt.getTime() + OTP_RESEND_COOLDOWN_MS > Date.now()) {
      const wait = Math.ceil((existing.sentAt.getTime() + OTP_RESEND_COOLDOWN_MS - Date.now()) / 1000);
      throw new ApiError(429, `A code was just sent. You can ask for a new one in ${wait} seconds.`, otpSent(existing.expiresAt, existing.sentAt));
    }

    const code = crypto.randomInt(100_000, 1_000_000).toString();
    const sentAt = new Date();
    const expiresAt = new Date(sentAt.getTime() + OTP_TTL_MS);
    const result = await sendEmail(emailVerificationEmail({ email, code, minutes: OTP_TTL_MS / 60_000 }));
    if (!result.sent && result.queued) {
      // The mail server is not answering right now: say so instead of leaving someone waiting for
      // a code that will only arrive after it has expired.
      throw new ApiError(503, 'The code could not be emailed right now. Try again in a minute.');
    }
    await EmailVerification.findOneAndUpdate(
      { email, purpose },
      {
        $set: { codeHash: await bcrypt.hash(code, 10), expiresAt, sentAt, attempts: 0 },
        $unset: { tokenHash: 1, tokenExpiresAt: 1 },
      },
      { upsert: true },
    );
    return otpSent(expiresAt, sentAt);
  },

  /** Checks the code; a right code returns a token the registration request must include. */
  async verifyCode(rawEmail: string, purpose: VerificationPurpose, code: string): Promise<{ verificationToken: string }> {
    const email = rawEmail.toLowerCase().trim();
    const record = await EmailVerification.findOne({ email, purpose });
    if (!record?.codeHash) throw ApiError.badRequest('Request a code first.');
    if (record.expiresAt < new Date()) throw ApiError.badRequest('That code has expired. Request a new one.');
    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      throw new ApiError(429, 'Too many wrong tries. Request a new code.');
    }
    if (!(await bcrypt.compare(code, record.codeHash))) {
      record.attempts += 1;
      await record.save();
      const left = OTP_MAX_ATTEMPTS - record.attempts;
      throw ApiError.badRequest(
        left > 0 ? `Wrong code. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong tries. Request a new code.',
      );
    }
    const token = crypto.randomBytes(32).toString('hex');
    record.codeHash = undefined;
    record.tokenHash = sha256(token);
    record.tokenExpiresAt = new Date(Date.now() + OTP_TOKEN_TTL_MS);
    await record.save();
    return { verificationToken: token };
  },

  /** Used by registration: the address must have been verified with a code. Single use. */
  async consumeToken(rawEmail: string, purpose: VerificationPurpose, token: string | undefined): Promise<void> {
    const email = rawEmail.toLowerCase().trim();
    const record = token ? await EmailVerification.findOne({ email, purpose }) : null;
    if (!record?.tokenHash || !record.tokenExpiresAt || record.tokenExpiresAt < new Date() || record.tokenHash !== sha256(token!)) {
      throw ApiError.badRequest('Verify your email address with the code we sent before creating the account.');
    }
    await record.deleteOne();
  },
};
