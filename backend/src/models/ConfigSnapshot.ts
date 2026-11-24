import { Schema, model, InferSchemaType } from 'mongoose';

/** Every System Management change keeps the settings as they were, so any change can be undone. */
const configSnapshotSchema = new Schema(
  {
    before: {
      aiModeration: Boolean,
      smartAlerts: Boolean,
      geoFence: Boolean,
      maintenanceMode: Boolean,
    },
    after: {
      aiModeration: Boolean,
      smartAlerts: Boolean,
      geoFence: Boolean,
      maintenanceMode: Boolean,
    },
    changedByEmail: { type: String },
    /** "change" from System Management, or "rollback" when an earlier state was restored. */
    kind: { type: String, enum: ['change', 'rollback'], default: 'change' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export type ConfigSnapshotDoc = InferSchemaType<typeof configSnapshotSchema>;
export const ConfigSnapshot = model('ConfigSnapshot', configSnapshotSchema);
