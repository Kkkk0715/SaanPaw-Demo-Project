import { Schema, model, InferSchemaType } from 'mongoose';
import { ANIMAL_CASE_STATUSES } from '../config/constants';

const animalCaseSchema = new Schema(
  {
    shelterId: { type: Schema.Types.ObjectId, ref: 'Shelter', required: true, index: true },
    lostReportId: { type: Schema.Types.ObjectId, ref: 'LostPetReport' },
    foundReportId: { type: Schema.Types.ObjectId, ref: 'FoundAnimalReport' },
    status: { type: String, enum: ANIMAL_CASE_STATUSES, default: 'under_rescue', index: true },
    notes: { type: String, trim: true },
    /** The Shelter Animals record this case became once the animal was recovered / reunited / adopted. */
    shelterAnimalId: { type: Schema.Types.ObjectId, ref: 'ShelterAnimal' },
    history: [
      {
        status: { type: String, enum: ANIMAL_CASE_STATUSES },
        note: { type: String, trim: true },
        changedBy: { type: Schema.Types.ObjectId, ref: 'Shelter' },
        changedAt: { type: Date, default: Date.now },
        _id: false,
      },
    ],
  },
  { timestamps: true },
);

export type AnimalCaseDoc = InferSchemaType<typeof animalCaseSchema>;
export const AnimalCase = model('AnimalCase', animalCaseSchema);
