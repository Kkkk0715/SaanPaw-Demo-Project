import { Schema, model, InferSchemaType } from 'mongoose';
import { env } from '../config/env';
import { SHELTER_APPROVAL_STATUSES } from '../config/constants';

const pointSchema = new Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true },
  },
  { _id: false },
);

const shelterSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    barangay: { type: String, required: true, trim: true },
    houseUnitNo: { type: String, trim: true },
    street: { type: String, trim: true },
    subdivision: { type: String, trim: true },
    contactNumber: { type: String, trim: true },
    email: { type: String, lowercase: true, trim: true },
    photoUrl: { type: String, trim: true },
    location: { type: pointSchema, required: true },
    operatingRadiusMeters: { type: Number, default: () => env.alerts.defaultShelterRadius },
    approvalStatus: { type: String, enum: SHELTER_APPROVAL_STATUSES, default: 'pending' },
    permitNumber: { type: String, trim: true },
    capacity: { type: Number, default: 30 },
    currentOccupancy: { type: Number, default: 0 },
    logoColor: { type: String, default: '#2563EB' },
    rejectionReason: { type: String },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'DeveloperAccount' },
    // Credentials issued by the Developer after LGU verification:
    adminEmail: { type: String, lowercase: true, trim: true },
    adminPasswordHash: { type: String },
  },
  { timestamps: { createdAt: 'registeredAt', updatedAt: 'updatedAt' } },
);

shelterSchema.index({ location: '2dsphere' });

export type ShelterDoc = InferSchemaType<typeof shelterSchema>;
export const Shelter = model('Shelter', shelterSchema);
