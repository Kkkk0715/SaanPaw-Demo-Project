/** One-time code rules shared by sign-up verification and password reset. */

/** A code works for this long after it is sent. */
export const OTP_TTL_MS = 10 * 60_000;
/** A new code can be requested this long after the last one. */
export const OTP_RESEND_COOLDOWN_MS = 60_000;
/** Wrong guesses allowed per code before a new one must be requested. */
export const OTP_MAX_ATTEMPTS = 5;
/** After the code is right, the next step (create the account / set the password) must happen within this. */
export const OTP_TOKEN_TTL_MS = 30 * 60_000;

/** What the app needs to show the countdown and the resend button. */
export interface OtpSent {
  expiresAt: string;
  resendAfterSeconds: number;
}

export const otpSent = (expiresAt: Date, sentAt: Date): OtpSent => ({
  expiresAt: expiresAt.toISOString(),
  resendAfterSeconds: Math.max(0, Math.ceil((sentAt.getTime() + OTP_RESEND_COOLDOWN_MS - Date.now()) / 1000)),
});
