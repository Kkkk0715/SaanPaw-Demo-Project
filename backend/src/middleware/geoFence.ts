import type { NextFunction, Request, Response } from 'express';
import { isWithinServiceArea } from '../config/serviceArea';
import { getSystemConfig } from '../services/systemConfig.service';
import { ApiError } from '../utils/ApiError';

/**
 * Limitation #1 enforcement. Looks for a coordinate pair on the request body at
 * common keys and rejects anything outside San Jose Del Monte, Bulacan.
 * Accepts { lng, lat }, { longitude, latitude }, or GeoJSON { coordinates: [lng, lat] }.
 */
const LOCATION_KEYS = ['location', 'lastSeenLocation', 'foundLocation', 'homeLocation'];

function extractPoint(value: unknown): [number, number] | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (Array.isArray(v.coordinates) && v.coordinates.length === 2) {
    return [Number(v.coordinates[0]), Number(v.coordinates[1])];
  }
  if (v.lng != null && v.lat != null) return [Number(v.lng), Number(v.lat)];
  if (v.longitude != null && v.latitude != null) {
    return [Number(v.longitude), Number(v.latitude)];
  }
  return null;
}

// Async but self-contained: every error is routed through next(err) rather than thrown, so this
// is safe to mount directly (as every route already does) without an asyncHandler wrapper.
export async function geoFence(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!(await getSystemConfig()).geoFence) return next();
    for (const key of LOCATION_KEYS) {
      const point = extractPoint(req.body?.[key]);
      if (point && !isWithinServiceArea(point)) {
        throw ApiError.badRequest(
          'Location is outside the SaanPaw service area (San Jose Del Monte, Bulacan).',
        );
      }
    }
    next();
  } catch (err) {
    next(err);
  }
}
