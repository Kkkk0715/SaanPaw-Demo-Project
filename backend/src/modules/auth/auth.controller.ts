import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  emailCodeSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailCodeSchema,
  verifyResetCodeSchema,
} from '../../utils/validation';
import { emailVerificationService } from '../../services/emailVerification.service';
import { authService } from './auth.service';

const loginSchema = z.object({
  role: z.enum(['developer', 'shelter_admin', 'user']),
  email: z.string().email(),
  password: z.string().min(6),
});

export const authController = {
  async login(req: Request, res: Response) {
    const { role, email, password } = loginSchema.parse(req.body);
    const result = await authService.login(role, email, password);
    res.json(result);
  },

  async forgotPassword(req: Request, res: Response) {
    const { role, email } = forgotPasswordSchema.parse(req.body);
    res.json({ ok: true, ...(await authService.forgotPassword(role, email)) });
  },

  async verifyResetCode(req: Request, res: Response) {
    const { role, email, code } = verifyResetCodeSchema.parse(req.body);
    res.json(await authService.verifyResetCode(role, email, code));
  },

  async resetPassword(req: Request, res: Response) {
    const { role, email, resetToken, code, newPassword } = resetPasswordSchema.parse(req.body);
    await authService.resetPassword(role, email, { resetToken, code }, newPassword);
    res.json({ ok: true });
  },

  /** Sign-up step 1: email a code to the address, after checking it can receive email at all. */
  async sendEmailCode(req: Request, res: Response) {
    const { email, purpose } = emailCodeSchema.parse(req.body);
    res.json(await emailVerificationService.sendCode(email, purpose));
  },

  /** Sign-up step 2: check the code; returns the token the registration request includes. */
  async verifyEmailCode(req: Request, res: Response) {
    const { email, purpose, code } = verifyEmailCodeSchema.parse(req.body);
    res.json(await emailVerificationService.verifyCode(email, purpose, code));
  },
};
