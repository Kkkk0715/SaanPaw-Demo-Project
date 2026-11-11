import { Schema, model } from 'mongoose';

/**
 * A one-time code mailed to an address before an account is created with it, proving the address
 * exists and belongs to the person signing up. Codes and tokens are stored hashed, like passwords.
 */
const emailVerificationSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    purpose: { type: String, enum: ['register_user', 'register_shelter'], required: true },
    codeHash: { type: String },
    expiresAt: { type: Date, required: true },
    sentAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    /** Issued once the code is right; the registration request must carry it. */
    tokenHash: { type: String },
    tokenExpiresAt: { type: Date },
  },
  { timestamps: true },
);

emailVerificationSchema.index({ email: 1, purpose: 1 }, { unique: true });
// MongoDB removes finished or abandoned verifications by itself a day after they were last touched.
emailVerificationSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

export const EmailVerification = model('EmailVerification', emailVerificationSchema);
