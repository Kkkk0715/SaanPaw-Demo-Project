import { Schema, model, InferSchemaType } from 'mongoose';
import { env } from '../config/env';

const pointSchema = new Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true }, // [lng, lat]
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    firstName: { type: String, required: true, trim: true },
    middleName: { type: String, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    photoUrl: { type: String, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, default: 'user', immutable: true },
    alertRadiusMeters: { type: Number, default: () => env.alerts.defaultUserRadius },
    homeLocation: { type: pointSchema, required: true },
    barangay: { type: String, required: true, trim: true },
    expoPushToken: { type: String },
    flaggedReportCount: { type: Number, default: 0 },
    isBanned: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: 'joinedAt', updatedAt: 'updatedAt' } },
);

userSchema.index({ homeLocation: '2dsphere' });

export type UserDoc = InferSchemaType<typeof userSchema>;
export const User = model('User', userSchema);
