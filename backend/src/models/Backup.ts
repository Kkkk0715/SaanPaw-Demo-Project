import { Schema, model, InferSchemaType } from 'mongoose';

/**
 * A full copy of the database, kept inside the database itself (in chunks), so it stays private:
 * it holds personal data and password hashes and must never sit at a public file address.
 */
const backupSchema = new Schema(
  {
    label: { type: String, trim: true },
    kind: { type: String, enum: ['manual', 'before_restore'], default: 'manual' },
    status: { type: String, enum: ['complete', 'failed'], default: 'complete' },
    sizeBytes: { type: Number, default: 0 },
    chunkCount: { type: Number, default: 0 },
    collections: [{ name: String, count: Number, _id: false }],
    createdByEmail: { type: String },
    restoredAt: { type: Date },
    error: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

const backupChunkSchema = new Schema({
  backupId: { type: Schema.Types.ObjectId, required: true, index: true },
  seq: { type: Number, required: true },
  data: { type: Buffer, required: true },
});

export type BackupDoc = InferSchemaType<typeof backupSchema>;
export const Backup = model('Backup', backupSchema);
export const BackupChunk = model('BackupChunk', backupChunkSchema);
