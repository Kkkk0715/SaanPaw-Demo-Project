import { Schema, model, InferSchemaType } from 'mongoose';

/**
 * A singleton document (there is only ever one, found with an empty filter) holding the
 * developer-controlled toggles shown on the console's System Management page. These are
 * enforced server-side wherever they're checked - see systemConfig.service.ts - not just stored.
 */
const systemConfigSchema = new Schema(
  {
    aiModeration: { type: Boolean, default: true },
    smartAlerts: { type: Boolean, default: true },
    geoFence: { type: Boolean, default: true },
    maintenanceMode: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: false, updatedAt: 'updatedAt' } },
);

export type SystemConfigDoc = InferSchemaType<typeof systemConfigSchema>;
export const SystemConfig = model('SystemConfig', systemConfigSchema);
