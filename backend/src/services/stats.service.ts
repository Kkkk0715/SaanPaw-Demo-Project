import { AnimalCase } from '../models/AnimalCase';
import { Shelter } from '../models/Shelter';
import { ShelterAnimal } from '../models/ShelterAnimal';
import { LostPetReport } from '../models/LostPetReport';
import { FoundAnimalReport } from '../models/FoundAnimalReport';
import { geolocationService } from './geolocation.service';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface AreaReportCounts {
  /** Every report ever filed inside the area (lost + found), whatever its status now. */
  total: number;
  lost: number;
  found: number;
  /** Still open (active or possible match). */
  open: number;
  /** Pets back home (lost reports marked recovered). */
  recovered: number;
  radiusMeters: number;
}

export const statsService = {
  /**
   * How many reports there are around a point: a user's home with their alert radius, or a
   * shelter with its operating radius. Removed (moderated) reports are not counted.
   */
  async areaReports(lng: number, lat: number, radiusMeters: number): Promise<AreaReportCounts> {
    const lostIn = { isHiddenByModeration: false, ...geolocationService.withinFilter('lastSeenLocation', lng, lat, radiusMeters) };
    const foundIn = { isHiddenByModeration: false, ...geolocationService.withinFilter('foundLocation', lng, lat, radiusMeters) };
    const open = { status: { $in: ['active', 'matched'] } };
    const [lost, found, lostOpen, foundOpen, recovered] = await Promise.all([
      LostPetReport.countDocuments(lostIn),
      FoundAnimalReport.countDocuments(foundIn),
      LostPetReport.countDocuments({ ...lostIn, ...open }),
      FoundAnimalReport.countDocuments({ ...foundIn, ...open }),
      LostPetReport.countDocuments({ ...lostIn, status: 'recovered' }),
    ]);
    return { total: lost + found, lost, found, open: lostOpen + foundOpen, recovered, radiusMeters };
  },

  /** City-wide counters, shaped like the shared `DashboardStats`. "Today" is the last 24 hours. */
  async platformStats() {
    const since = new Date(Date.now() - DAY_MS);
    const monthAgo = new Date(Date.now() - 30 * DAY_MS);
    const live = { status: { $in: ['active', 'matched'] }, isHiddenByModeration: false };

    const [
      lostToday,
      foundToday,
      lostLive,
      foundLive,
      reunitedReports,
      reunitedFoundCases,
      reunitedAnimals,
      underRescue,
      sheltersOnline,
    ] = await Promise.all([
        LostPetReport.countDocuments({ reportedAt: { $gte: since }, isHiddenByModeration: false }),
        FoundAnimalReport.countDocuments({ reportedAt: { $gte: since }, isHiddenByModeration: false }),
        LostPetReport.countDocuments(live),
        FoundAnimalReport.countDocuments(live),
        // A lost pet back home: set by its owner, or by a shelter case marked Reunited.
        LostPetReport.countDocuments({ status: 'recovered', updatedAt: { $gte: monthAgo } }),
        // A found animal a shelter reunited with its owner. Its report becomes "closed", not
        // "recovered", so the line above never saw it - this is why Reunited stayed at 0.
        AnimalCase.countDocuments({
          status: 'reunited',
          foundReportId: { $ne: null },
          lostReportId: null, // matches a missing field too
          updatedAt: { $gte: monthAgo },
        }),
        // Animals the shelter took in itself. Ones copied from a report case are already counted above.
        ShelterAnimal.countDocuments({ caseStatus: 'reunited', sourceReportId: null, updatedAt: { $gte: monthAgo } }),
        ShelterAnimal.countDocuments({ caseStatus: 'under_rescue' }),
        Shelter.countDocuments({ approvalStatus: 'approved' }),
      ]);

    return {
      lostToday,
      foundToday,
      activeReports: lostLive + foundLive,
      reunitedThisMonth: reunitedReports + reunitedFoundCases + reunitedAnimals,
      underRescue,
      sheltersOnline,
    };
  },
};
