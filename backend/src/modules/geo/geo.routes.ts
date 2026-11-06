import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { isWithinServiceArea } from '../../config/serviceArea';
import { reverseGeocode } from '../../services/reverseGeocode.service';
import { roadRoute } from '../../services/routing.service';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { queryNumber } from '../../utils/validation';

const router = Router();

/** GET /geo/reverse?lat=..&lng=.. - the street address for a map pin, for any signed-in role. */
router.get(
  '/reverse',
  authenticate,
  asyncHandler(async (req, res) => {
    const lat = queryNumber(req.query.lat);
    const lng = queryNumber(req.query.lng);
    if (lat === undefined || lng === undefined || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw ApiError.badRequest('lat and lng are required');
    }
    // Only pins inside the service area are looked up: nothing outside SJDM can be reported anyway.
    if (!isWithinServiceArea([lng, lat])) return res.json({ address: null });
    const result = await reverseGeocode(lat, lng);
    res.json(result ?? { address: null });
  }),
);

/**
 * GET /geo/route?fromLat=..&fromLng=..&toLat=..&toLng=.. - the road route between two pins (a
 * shelter and the report it is recovering), so the map can follow the streets instead of a
 * straight line. `{ path: null }` when no route was found; the app then draws the straight line.
 */
router.get(
  '/route',
  authenticate,
  asyncHandler(async (req, res) => {
    const [fromLat, fromLng, toLat, toLng] = ['fromLat', 'fromLng', 'toLat', 'toLng'].map((k) => queryNumber(req.query[k]));
    if ([fromLat, fromLng, toLat, toLng].some((n) => n === undefined || Math.abs(n) > 180)) {
      throw ApiError.badRequest('fromLat, fromLng, toLat and toLng are required');
    }
    // Both ends are in the city (a shelter and a report), so nothing else is routed.
    if (!isWithinServiceArea([fromLng!, fromLat!]) || !isWithinServiceArea([toLng!, toLat!])) {
      return res.json({ path: null });
    }
    const route = await roadRoute(fromLat!, fromLng!, toLat!, toLng!);
    res.json(route ?? { path: null });
  }),
);

export default router;
