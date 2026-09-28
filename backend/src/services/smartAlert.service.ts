import { Notification } from '../models/Notification';
import { User } from '../models/User';
import { Shelter } from '../models/Shelter';
import { logger } from '../utils/logger';

/**
 * Smart Alert System.
 *
 * When a lost/found report is filed inside the service area, notify:
 *   - Users whose `homeLocation` is within their own `alertRadiusMeters` of the report
 *   - Shelters whose `location` is within their `operatingRadiusMeters` of the report
 * Delivery is persisted as Notification docs and pushed via Expo.
 */
export const smartAlertService = {
  async dispatchReportAlert(params: {
    reportType: 'lost' | 'found';
    reportId: string;
    /** The reporter already knows, so they are left out of the alert. */
    reporterId?: string;
    lng: number;
    lat: number;
    summary: string;
  }): Promise<void> {
    const point = { type: 'Point' as const, coordinates: [params.lng, params.lat] };

    // Radius is per-recipient, so use $geoWithin/$centerSphere per recipient set.
    const [users, shelters] = await Promise.all([
      User.find({
        isBanned: false,
        ...(params.reporterId ? { _id: { $ne: params.reporterId } } : {}),
        homeLocation: {
          $geoWithin: { $centerSphere: [[params.lng, params.lat], 20_000 / 6_378_100] },
        },
      }).lean(),
      Shelter.find({
        approvalStatus: 'approved',
        location: {
          $geoWithin: { $centerSphere: [[params.lng, params.lat], 30_000 / 6_378_100] },
        },
      }).lean(),
    ]);

    const notifications = [
      ...users
        .filter((u) => withinMeters(u.homeLocation?.coordinates as number[], point.coordinates, u.alertRadiusMeters))
        .map((u) => ({
          audienceType: 'user' as const,
          audienceId: u._id,
          type: params.reportType === 'lost' ? ('lost_report' as const) : ('found_report' as const),
          refId: params.reportId,
          title: params.reportType === 'lost' ? 'Lost pet reported nearby' : 'Found animal reported nearby',
          body: params.summary,
        })),
      ...shelters
        .filter((s) => withinMeters(s.location?.coordinates as number[], point.coordinates, s.operatingRadiusMeters))
        .map((s) => ({
          audienceType: 'shelter' as const,
          audienceId: s._id,
          type: params.reportType === 'lost' ? ('lost_report' as const) : ('found_report' as const),
          refId: params.reportId,
          title: 'New report in your operating radius',
          body: params.summary,
        })),
    ];

    if (notifications.length) {
      await Notification.insertMany(notifications);
      logger.info(`smartAlert: queued ${notifications.length} notifications for ${params.reportType} ${params.reportId}`);
      // TODO: push via Expo (expo-server-sdk) using stored push tokens.
    }
  },
};

function withinMeters(a: number[] | undefined, b: number[], radius: number): boolean {
  if (!a || a.length !== 2) return false;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const R = 6_371_000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) <= radius;
}
