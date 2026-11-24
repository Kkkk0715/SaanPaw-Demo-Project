import { Schema, model, InferSchemaType } from 'mongoose';

/**
 * An administrator of the Developer Console. Admins can add other admins, turn an admin's access
 * off, and recover their own password by email code (the same flow as the apps).
 */
const developerAccountSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, default: 'developer', immutable: true },
    /** Turned off by another admin: cannot sign in, but nothing they did is removed. */
    disabled: { type: Boolean, default: false },
    createdByEmail: { type: String },
    lastLoginAt: { type: Date },
    // Forgot-password, same as users and shelters: hashed one-time code, then a one-time token.
    resetCodeHash: { type: String },
    resetCodeExpiresAt: { type: Date },
    resetCodeSentAt: { type: Date },
    resetAttempts: { type: Number, default: 0 },
    resetTokenHash: { type: String },
    resetTokenExpiresAt: { type: Date },
  },
  { timestamps: true },
);

export type DeveloperAccountDoc = InferSchemaType<typeof developerAccountSchema>;
export const DeveloperAccount = model('DeveloperAccount', developerAccountSchema);
