import { isWithinServiceArea, SJDM_CENTER } from '../config/serviceArea';

export const geolocationService = {
  /** Limitation #1 helper reused by controllers that build queries. */
  assertWithinServiceArea(lng: number, lat: number): void {
    if (!isWithinServiceArea([lng, lat])) {
      throw new Error('Coordinates outside San Jose Del Monte service area');
    }
  },

  /** Build a MongoDB $nearSphere filter for radius queries. */
  nearFilter(field: string, lng: number, lat: number, radiusMeters: number) {
    return {
      [field]: {
        $nearSphere: {
          $geometry: { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: radiusMeters,
        },
      },
    };
  },

  /** Radius filter that, unlike $nearSphere, also works inside countDocuments. */
  withinFilter(field: string, lng: number, lat: number, radiusMeters: number) {
    return { [field]: { $geoWithin: { $centerSphere: [[lng, lat], radiusMeters / 6_378_100] } } };
  },

  defaultCenter: SJDM_CENTER,
};
