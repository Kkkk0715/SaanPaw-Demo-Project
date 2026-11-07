import { Schema, model, InferSchemaType } from 'mongoose';
import { ANIMAL_TYPES, SHELTER_ANIMAL_STATUSES } from '../config/constants';

const shelterAnimalSchema = new Schema(
  {
    shelterId: { type: Schema.Types.ObjectId, ref: 'Shelter', required: true, index: true },
    name: { type: String, trim: true },
    animalType: { type: String, enum: ANIMAL_TYPES, required: true },
    breed: { type: String, trim: true },
    color: { type: String, trim: true },
    sex: { type: String, enum: ['male', 'female', 'unknown'], default: 'unknown' },
    size: { type: String, enum: ['small', 'medium', 'large'] },
    distinctMarks: { type: String, trim: true },
    description: { type: String, trim: true },
    imageUrls: { type: [String], default: [] },
    intakeType: { type: String, enum: ['surrendered', 'recovered', 'rescued'], default: 'surrendered' },
    intakeDate: { type: Date, default: Date.now },
    caseStatus: {
      type: String,
      enum: SHELTER_ANIMAL_STATUSES,
      default: 'under_rescue',
    },
    postedPublicly: { type: Boolean, default: false },
    notes: { type: String, trim: true },
    isHiddenByModeration: { type: Boolean, default: false },
    /**
     * Set when this record came from a case on a resident's report (the shelter marked it
     * Recovered, Reunited or Adopted). Its status changes are copied back to that case and report.
     */
    caseId: { type: Schema.Types.ObjectId, ref: 'AnimalCase' },
    sourceReportId: { type: Schema.Types.ObjectId },
    sourceReportKind: { type: String, enum: ['lost', 'found'] },
    moderationFlagId: { type: Schema.Types.ObjectId, ref: 'ModerationFlag' },
  },
  { timestamps: true },
);

export type ShelterAnimalDoc = InferSchemaType<typeof shelterAnimalSchema>;
export const ShelterAnimal = model('ShelterAnimal', shelterAnimalSchema);
