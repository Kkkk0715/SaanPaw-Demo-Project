import { Schema, model } from 'mongoose';

/**
 * A document a shelter submits as proof of its credentials (LGU permit, business registration,
 * ID, photos of the facility). Kept in the database rather than with the public photo uploads:
 * these are private records, so they are only ever served to a signed-in Developer
 * (GET /developer/proofs/:id), never through the public /uploads path.
 *
 * Uploaded before the application exists (the registration form uploads, then submits), so
 * `shelterId` starts empty and is set when the application that lists it is created.
 */
const shelterProofDocumentSchema = new Schema(
  {
    shelterId: { type: Schema.Types.ObjectId, ref: 'Shelter', index: true },
    filename: { type: String, trim: true, default: 'document' },
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    data: { type: Buffer, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const ShelterProofDocument = model('ShelterProofDocument', shelterProofDocumentSchema);
