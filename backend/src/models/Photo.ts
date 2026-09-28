import { Schema, model } from 'mongoose';

/**
 * An uploaded photo kept in the database. Used where the server has no writable disk and no
 * object storage configured (Vercel without Blob): a few hundred phone photos fit easily in a
 * free Atlas cluster, and it needs no extra account or setup.
 */
const photoSchema = new Schema(
  {
    contentType: { type: String, required: true },
    data: { type: Buffer, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const Photo = model('Photo', photoSchema);
