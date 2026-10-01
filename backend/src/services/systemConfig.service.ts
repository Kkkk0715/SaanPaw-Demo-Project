import { SystemConfig } from '../models/SystemConfig';

export interface SystemConfigValue {
  aiModeration: boolean;
  smartAlerts: boolean;
  geoFence: boolean;
  maintenanceMode: boolean;
}

/**
 * Reads the singleton config, creating it with defaults on first use. No in-memory cache: this
 * app runs as stateless serverless functions, where a cache would just mean every instance has
 * its own stale copy - the extra query is cheap next to the cost of a wrong config value.
 */
export async function getSystemConfig(): Promise<SystemConfigValue & { updatedAt?: Date }> {
  const existing = await SystemConfig.findOne().lean();
  if (existing) return existing;
  const created = await SystemConfig.create({});
  return created.toObject();
}

export async function updateSystemConfig(patch: Partial<SystemConfigValue>): Promise<SystemConfigValue & { updatedAt?: Date }> {
  const updated = await SystemConfig.findOneAndUpdate({}, patch, { new: true, upsert: true });
  return updated.toObject();
}
