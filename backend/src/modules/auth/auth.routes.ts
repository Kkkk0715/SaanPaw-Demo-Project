import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { authController } from './auth.controller';
import { facebookCallback, facebookStatus, startFacebookRegistration } from './facebook.controller';
import { exchangeTicket, socialCallback, socialStatus, startSocial } from './social.controller';

const router = Router();

// Shared login for all three roles; registration lives in the user & shelter modules.
router.post('/login', asyncHandler(authController.login));

// Forgot password, for all three roles (Developer Console admins included).
router.post('/forgot-password', asyncHandler(authController.forgotPassword));
router.post('/verify-reset-code', asyncHandler(authController.verifyResetCode));
router.post('/reset-password', asyncHandler(authController.resetPassword));

// Sign-up email check: a code goes to the address, and registration needs the token it unlocks.
router.post('/email-code', asyncHandler(authController.sendEmailCode));
router.post('/email-code/verify', asyncHandler(authController.verifyEmailCode));

// Facebook: connect an account (during registration here; signed-in users use /user/facebook).
router.get('/facebook/status', facebookStatus);
router.post('/facebook/start', asyncHandler(startFacebookRegistration));
router.get('/facebook/callback', asyncHandler(facebookCallback));

// Continue with Facebook / Google: sign in or sign up (intent: 'login' | 'register').
router.get('/social/status', socialStatus);
router.post('/social/exchange', asyncHandler(exchangeTicket));
router.post('/:provider(facebook|google)/start', asyncHandler(startSocial));
router.get('/:provider(google)/callback', asyncHandler(socialCallback));

export default router;
