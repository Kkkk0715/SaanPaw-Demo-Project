import { Schema, model, InferSchemaType } from 'mongoose';

const matchSuggestionSchema = new Schema(
  {
    lostReportId: { type: Schema.Types.ObjectId, ref: 'LostPetReport', required: true, index: true },
    // No `ref`: candidateId points into FoundAnimalReport or ShelterAnimal depending on candidateSource.
    candidateId: { type: Schema.Types.ObjectId, required: true, index: true },
    candidateSource: { type: String, enum: ['found_report', 'shelter_animal'], required: true },
    score: { type: Number, required: true },
    reasons: { type: [String], default: [] },
    status: {
      type: String,
      enum: ['suggested', 'confirmed', 'dismissed'],
      default: 'suggested',
    },
  },
  { timestamps: true },
);

matchSuggestionSchema.index({ lostReportId: 1, candidateId: 1, candidateSource: 1 }, { unique: true });

export type MatchSuggestionDoc = InferSchemaType<typeof matchSuggestionSchema>;
export const MatchSuggestion = model('MatchSuggestion', matchSuggestionSchema);
