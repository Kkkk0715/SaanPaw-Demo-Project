import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { isWithinServiceArea } from '../../config/serviceArea';
import { reverseGeocode } from '../../services/reverseGeocode.service';
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

export default router;
