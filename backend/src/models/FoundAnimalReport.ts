import { Schema, model, InferSchemaType } from 'mongoose';
import { ANIMAL_TYPES, REPORT_STATUSES } from '../config/constants';

const pointSchema = new Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true },
  },
  { _id: false },
);

const foundAnimalReportSchema = new Schema(
  {
    reporterId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reporterName: { type: String, required: true },
    reporterPhone: { type: String },
    animalType: { type: String, enum: ANIMAL_TYPES, required: true },
    breed: { type: String, trim: true },
    color: { type: String, trim: true },
    sex: { type: String, enum: ['male', 'female', 'unknown'], default: 'unknown' },
    size: { type: String, enum: ['small', 'medium', 'large'] },
    distinctMarks: { type: String, trim: true },
    description: { type: String, trim: true },
    imageUrls: { type: [String], default: [] },
    barangay: { type: String, required: true, trim: true },
    foundLocation: { type: pointSchema, required: true },
    foundAt: { type: Date },
    status: { type: String, enum: REPORT_STATUSES, default: 'active', index: true },
    caseId: { type: Schema.Types.ObjectId, ref: 'AnimalCase' },
    matchedLostReportId: { type: Schema.Types.ObjectId, ref: 'LostPetReport' },
    isHiddenByModeration: { type: Boolean, default: false },
    moderationFlagId: { type: Schema.Types.ObjectId, ref: 'ModerationFlag' },
  },
  { timestamps: { createdAt: 'reportedAt', updatedAt: 'updatedAt' } },
);

foundAnimalReportSchema.index({ foundLocation: '2dsphere' });

export type FoundAnimalReportDoc = InferSchemaType<typeof foundAnimalReportSchema>;
export const FoundAnimalReport = model('FoundAnimalReport', foundAnimalReportSchema);
