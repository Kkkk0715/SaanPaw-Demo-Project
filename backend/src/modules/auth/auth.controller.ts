import type { Request, Response } from 'express';
import { z } from 'zod';
import { forgotPasswordSchema, resetPasswordSchema } from '../../utils/validation';
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
    await authService.forgotPassword(role, email);
    res.json({ ok: true });
  },

  async resetPassword(req: Request, res: Response) {
    const { role, email, code, newPassword } = resetPasswordSchema.parse(req.body);
    await authService.resetPassword(role, email, code, newPassword);
    res.json({ ok: true });
  },
};
