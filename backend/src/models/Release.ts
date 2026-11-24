import { Schema, model, InferSchemaType } from 'mongoose';

/**
 * Version history: one entry per deployed update. The API records its own deployments
 * automatically (from Vercel's git details); admins add the mobile app and console releases with
 * their notes. A deployment can be rolled back from the console when VERCEL_TOKEN is set.
 */
const releaseSchema = new Schema(
  {
    surface: { type: String, enum: ['api', 'console', 'mobile'], required: true },
    version: { type: String, required: true, trim: true },
    notes: { type: String, trim: true },
    commitSha: { type: String },
    commitMessage: { type: String },
    commitAuthor: { type: String },
    /** The Vercel deployment's own address (unique per deployment), used for rollback. */
    deploymentUrl: { type: String },
    environment: { type: String },
    createdByEmail: { type: String },
    rolledBackAt: { type: Date },
  },
  { timestamps: true },
);
releaseSchema.index({ surface: 1, commitSha: 1, deploymentUrl: 1 });

export type ReleaseDoc = InferSchemaType<typeof releaseSchema>;
export const Release = model('Release', releaseSchema);
