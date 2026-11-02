import { Schema, model } from 'mongoose';

/**
 * A perceptual fingerprint of every animal photo accepted at upload, used to spot the same photo
 * being reused - by the same person filing twice, or someone copying another report's picture.
 * `dHash` survives resizing and re-compression (the app re-encodes every photo it uploads), so a
 * re-saved or re-sent copy of the same picture still matches; `sha256` catches exact copies.
 */
const photoFingerprintSchema = new Schema(
  {
    url: { type: String, required: true, unique: true },
    uploaderId: { type: Schema.Types.ObjectId, index: true },
    sha256: { type: String, required: true, index: true },
    /** 64-bit difference hash as 16 hex characters. */
    dHash: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export type PhotoFingerprintDoc = { url: string; uploaderId?: unknown; sha256: string; dHash: string };
export const PhotoFingerprint = model('PhotoFingerprint', photoFingerprintSchema);
