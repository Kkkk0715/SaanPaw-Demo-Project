import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../../config/env';
import type { Role } from '../../config/constants';
import { User } from '../../models/User';
import { Shelter } from '../../models/Shelter';
import { DeveloperAccount } from '../../models/DeveloperAccount';
import { sendEmail, passwordResetEmail } from '../../services/email.service';
import { getSystemConfig } from '../../services/systemConfig.service';
import { ApiError } from '../../utils/ApiError';
import { OTP_MAX_ATTEMPTS, OTP_RESEND_COOLDOWN_MS, OTP_TOKEN_TTL_MS, OTP_TTL_MS, otpSent, type OtpSent } from '../../services/otp';

const invalidResetCode = () => ApiError.badRequest('That code is invalid or has expired. Request a new one.');
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

/** The account a password reset is for: a user by email, or a shelter by its login email. */
async function findResettable(role: 'user' | 'shelter_admin', email: string) {
  return role === 'user' ? User.findOne({ email }) : Shelter.findOne({ adminEmail: email });
}

function sign(payload: Express.UserPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as any);
}

export const authService = {
  async login(role: Role, email: string, password: string) {
    const normalized = email.toLowerCase().trim();

    // The Developer must always be able to sign in, including to turn maintenance mode back off.
    if (role !== 'developer' && (await getSystemConfig()).maintenanceMode) {
      throw new ApiError(503, 'SaanPaw is temporarily down for maintenance. Please try again shortly.');
    }

    if (role === 'developer') {
      const acct = await DeveloperAccount.findOne({ email: normalized });
      if (!acct || !(await bcrypt.compare(password, acct.passwordHash))) {
        throw ApiError.unauthorized('Invalid developer credentials');
      }
      return { token: sign({ id: String(acct._id), role: 'developer' }) };
    }

    if (role === 'shelter_admin') {
      const shelter = await Shelter.findOne({ adminEmail: normalized });
      if (!shelter?.adminPasswordHash || !(await bcrypt.compare(password, shelter.adminPasswordHash))) {
        throw ApiError.unauthorized('Incorrect email or password for a shelter account.');
      }
      if (shelter.approvalStatus !== 'approved') {
        throw ApiError.forbidden(
          shelter.approvalStatus === 'pending'
            ? 'Your shelter is still waiting for approval. You will get an email once it is reviewed.'
            : 'Your shelter application was not approved or its access was revoked. Check your email for the reason.',
        );
      }
      return {
        token: sign({ id: String(shelter._id), role: 'shelter_admin', shelterId: String(shelter._id) }),
      };
    }

    const user = await User.findOne({ email: normalized });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw ApiError.unauthorized('Incorrect email or password.');
    }
    if (user.isBanned) {
      throw ApiError.forbidden('This account has been banned. Check your email for the reason.');
    }
    return { token: sign({ id: String(user._id), role: 'user' }) };
  },

  hashPassword(plain: string) {
    return bcrypt.hash(plain, 10);
  },

  /**
   * Forgot password, step 1: emails a 6-digit code (valid 10 minutes) when the email has an
   * account. Always answers the same way, so it can never be used to find out which emails have
   * accounts. The answer carries the expiry and resend wait the app counts down.
   */
  async forgotPassword(role: 'user' | 'shelter_admin', email: string): Promise<OtpSent> {
    const normalized = email.toLowerCase().trim();
    const account = await findResettable(role, normalized);
    const now = new Date();
    if (!account) return otpSent(new Date(now.getTime() + OTP_TTL_MS), now);

    const lastSent = account.resetCodeSentAt as Date | undefined;
    if (lastSent && account.resetCodeExpiresAt && lastSent.getTime() + OTP_RESEND_COOLDOWN_MS > now.getTime()) {
      // Asked again within a minute: keep the code already sent (and its timer).
      return otpSent(account.resetCodeExpiresAt as Date, lastSent);
    }

    const code = crypto.randomInt(100_000, 1_000_000).toString();
    const expiresAt = new Date(now.getTime() + OTP_TTL_MS);
    account.resetCodeHash = await bcrypt.hash(code, 10);
    account.resetCodeExpiresAt = expiresAt;
    account.resetCodeSentAt = now;
    account.resetAttempts = 0;
    account.resetTokenHash = undefined;
    account.resetTokenExpiresAt = undefined;
    await account.save();
    await sendEmail(passwordResetEmail({ email: normalized, code, minutes: OTP_TTL_MS / 60_000 }));
    return otpSent(expiresAt, now);
  },

  /**
   * Forgot password, step 2: checks the code only. A right code returns a reset token; the new
   * password screen is shown only after this, and only that token can set the password.
   */
  async verifyResetCode(role: 'user' | 'shelter_admin', email: string, code: string): Promise<{ resetToken: string }> {
    const account = await findResettable(role, email.toLowerCase().trim());
    if (!account?.resetCodeHash || !account.resetCodeExpiresAt) throw invalidResetCode();
    if ((account.resetCodeExpiresAt as Date) < new Date()) {
      throw ApiError.badRequest('That code has expired. Request a new one.');
    }
    if ((account.resetAttempts ?? 0) >= OTP_MAX_ATTEMPTS) {
      throw new ApiError(429, 'Too many wrong tries. Request a new code.');
    }
    if (!(await bcrypt.compare(code, account.resetCodeHash as string))) {
      account.resetAttempts = (account.resetAttempts ?? 0) + 1;
      await account.save();
      const left = OTP_MAX_ATTEMPTS - (account.resetAttempts as number);
      throw ApiError.badRequest(
        left > 0 ? `Wrong code. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong tries. Request a new code.',
      );
    }
    const token = crypto.randomBytes(32).toString('hex');
    account.resetCodeHash = undefined;
    account.resetCodeExpiresAt = undefined;
    account.resetTokenHash = sha256(token);
    account.resetTokenExpiresAt = new Date(Date.now() + OTP_TOKEN_TTL_MS);
    await account.save();
    return { resetToken: token };
  },

  /**
   * Forgot password, step 3: sets the new password with the token from a verified code. (Older
   * app builds still send the code itself here; that keeps working for them.)
   */
  async resetPassword(
    role: 'user' | 'shelter_admin',
    email: string,
    proof: { resetToken?: string; code?: string },
    newPassword: string,
  ) {
    const account = await findResettable(role, email.toLowerCase().trim());
    if (!account) throw invalidResetCode();

    if (proof.resetToken) {
      if (
        !account.resetTokenHash ||
        !account.resetTokenExpiresAt ||
        (account.resetTokenExpiresAt as Date) < new Date() ||
        account.resetTokenHash !== sha256(proof.resetToken)
      ) {
        throw ApiError.badRequest('This reset has expired. Start again and request a new code.');
      }
    } else {
      if (!account.resetCodeHash || !account.resetCodeExpiresAt || (account.resetCodeExpiresAt as Date) < new Date()) {
        throw invalidResetCode();
      }
      if ((account.resetAttempts ?? 0) >= OTP_MAX_ATTEMPTS || !(await bcrypt.compare(proof.code ?? '', account.resetCodeHash as string))) {
        account.resetAttempts = (account.resetAttempts ?? 0) + 1;
        await account.save();
        throw invalidResetCode();
      }
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    if (role === 'user') (account as InstanceType<typeof User>).passwordHash = newHash;
    else (account as InstanceType<typeof Shelter>).adminPasswordHash = newHash;
    account.resetCodeHash = undefined;
    account.resetCodeExpiresAt = undefined;
    account.resetTokenHash = undefined;
    account.resetTokenExpiresAt = undefined;
    account.resetAttempts = 0;
    await account.save();
  },
};
