import { Schema, model, InferSchemaType } from 'mongoose';
import { ANIMAL_TYPES } from '../config/constants';

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
      enum: ['under_rescue', 'reunited', 'adopted', 'inconclusive'],
      default: 'under_rescue',
    },
    postedPublicly: { type: Boolean, default: false },
    notes: { type: String, trim: true },
    isHiddenByModeration: { type: Boolean, default: false },
    moderationFlagId: { type: Schema.Types.ObjectId, ref: 'ModerationFlag' },
  },
  { timestamps: true },
);

export type ShelterAnimalDoc = InferSchemaType<typeof shelterAnimalSchema>;
export const ShelterAnimal = model('ShelterAnimal', shelterAnimalSchema);
