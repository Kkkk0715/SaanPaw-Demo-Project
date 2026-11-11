import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { authController } from './auth.controller';

const router = Router();

// Shared login for all three roles; registration lives in the user & shelter modules.
router.post('/login', asyncHandler(authController.login));

// Forgot password (user and shelter_admin only - developer accounts are provisioned, not self-service).
router.post('/forgot-password', asyncHandler(authController.forgotPassword));
router.post('/verify-reset-code', asyncHandler(authController.verifyResetCode));
router.post('/reset-password', asyncHandler(authController.resetPassword));

// Sign-up email check: a code goes to the address, and registration needs the token it unlocks.
router.post('/email-code', asyncHandler(authController.sendEmailCode));
router.post('/email-code/verify', asyncHandler(authController.verifyEmailCode));

export default router;
