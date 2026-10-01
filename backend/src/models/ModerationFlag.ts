import { Schema, model, InferSchemaType } from 'mongoose';

/**
 * Report Monitoring: an AI check flags reports that look false / inappropriate.
 * The Developer reviews flags and may remove reports or ban repeat offenders.
 */
const moderationFlagSchema = new Schema(
  {
    reportType: { type: String, enum: ['lost', 'found', 'shelter_animal'], required: true },
    reportId: { type: Schema.Types.ObjectId, required: true, index: true },
    // No `ref`: points into User for 'lost'/'found', or Shelter for 'shelter_animal'.
    reporterId: { type: Schema.Types.ObjectId, required: true, index: true },
    reason: {
      type: String,
      enum: ['ai_false_positive', 'inappropriate', 'duplicate', 'manual'],
      required: true,
    },
    aiConfidence: { type: Number },
    /** What the screen found, shown to the Developer next to the flag. */
    detail: { type: String },
    status: { type: String, enum: ['open', 'dismissed', 'actioned'], default: 'open', index: true },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'DeveloperAccount' },
    resolutionNote: { type: String },
  },
  { timestamps: true },
);

export type ModerationFlagDoc = InferSchemaType<typeof moderationFlagSchema>;
export const ModerationFlag = model('ModerationFlag', moderationFlagSchema);
