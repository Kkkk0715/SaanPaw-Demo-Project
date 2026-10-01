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

const RESET_CODE_TTL_MS = 15 * 60_000;
const invalidResetCode = () => ApiError.badRequest('That code is invalid or has expired. Request a new one.');

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
        throw ApiError.unauthorized('Invalid shelter credentials');
      }
      if (shelter.approvalStatus !== 'approved') {
        throw ApiError.forbidden(`Shelter account is ${shelter.approvalStatus}`);
      }
      return {
        token: sign({ id: String(shelter._id), role: 'shelter_admin', shelterId: String(shelter._id) }),
      };
    }

    const user = await User.findOne({ email: normalized });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw ApiError.unauthorized('Invalid credentials');
    }
    if (user.isBanned) throw ApiError.forbidden('Account is banned');
    return { token: sign({ id: String(user._id), role: 'user' }) };
  },

  hashPassword(plain: string) {
    return bcrypt.hash(plain, 10);
  },

  /**
   * Always resolves the same way whether or not the email is registered, so the response can
   * never be used to find out which emails have accounts. Emails a 6-digit code when it is.
   */
  async forgotPassword(role: 'user' | 'shelter_admin', email: string) {
    const normalized = email.toLowerCase().trim();
    const code = crypto.randomInt(100_000, 1_000_000).toString();
    const resetCodeHash = await bcrypt.hash(code, 10);
    const resetCodeExpiresAt = new Date(Date.now() + RESET_CODE_TTL_MS);

    if (role === 'user') {
      const user = await User.findOne({ email: normalized });
      if (!user) return;
      user.resetCodeHash = resetCodeHash;
      user.resetCodeExpiresAt = resetCodeExpiresAt;
      await user.save();
    } else {
      const shelter = await Shelter.findOne({ adminEmail: normalized });
      if (!shelter) return;
      shelter.resetCodeHash = resetCodeHash;
      shelter.resetCodeExpiresAt = resetCodeExpiresAt;
      await shelter.save();
    }
    await sendEmail(passwordResetEmail({ email: normalized, code }));
  },

  async resetPassword(role: 'user' | 'shelter_admin', email: string, code: string, newPassword: string) {
    const normalized = email.toLowerCase().trim();
    const newHash = await bcrypt.hash(newPassword, 10);

    if (role === 'user') {
      const user = await User.findOne({ email: normalized });
      if (!user?.resetCodeHash || !user.resetCodeExpiresAt || user.resetCodeExpiresAt < new Date()) {
        throw invalidResetCode();
      }
      if (!(await bcrypt.compare(code, user.resetCodeHash))) throw invalidResetCode();
      user.passwordHash = newHash;
      user.resetCodeHash = undefined;
      user.resetCodeExpiresAt = undefined;
      await user.save();
      return;
    }

    const shelter = await Shelter.findOne({ adminEmail: normalized });
    if (!shelter?.resetCodeHash || !shelter.resetCodeExpiresAt || shelter.resetCodeExpiresAt < new Date()) {
      throw invalidResetCode();
    }
    if (!(await bcrypt.compare(code, shelter.resetCodeHash))) throw invalidResetCode();
    shelter.adminPasswordHash = newHash;
    shelter.resetCodeHash = undefined;
    shelter.resetCodeExpiresAt = undefined;
    await shelter.save();
  },
};
