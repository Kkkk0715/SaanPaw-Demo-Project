import { User } from '../../models/User';
import { Shelter } from '../../models/Shelter';
import { ShelterAnimal } from '../../models/ShelterAnimal';
import { LostPetReport } from '../../models/LostPetReport';
import { FoundAnimalReport } from '../../models/FoundAnimalReport';
import { AnimalCase } from '../../models/AnimalCase';
import { Notification } from '../../models/Notification';
import { MatchSuggestion } from '../../models/MatchSuggestion';
import { smartAlertService } from '../../services/smartAlert.service';
import { moderationService } from '../../services/moderation.service';
import {
  alertOwnersOfNewMatches,
  evaluateNewCandidates,
  findMatches,
  findMatchingLostReports,
} from '../../services/matching.service';
import { statsService } from '../../services/stats.service';
import { deleteReportCascade } from '../../services/cascadeDelete.service';
import { findDuplicatePhotos } from '../../services/photoFingerprint.service';
import { geolocationService } from '../../services/geolocation.service';
import { authService } from '../auth/auth.service';
import { REPORT_STATUSES } from '../../config/constants';
import { ApiError } from '../../utils/ApiError';
import { logger } from '../../utils/logger';
import { barangayForPin } from '../../services/pinBarangay.service';
import { withLiveOccupancy } from '../../services/occupancy.service';
import { notify } from '../../services/pushNotification.service';
import {
  combineName,
  serializeUser,
  serializeShelter,
  serializeLostReport,
  serializeFoundReport,
  serializeShelterAnimal,
  serializeMatchSuggestion,
  serializeNotification,
  serializeCase,
  latLngToGeoPoint,
  geoPointToLatLng,
} from '../../utils/geoHelpers';

/**
 * When the reporter marks a report Recovered (or Closed) while a shelter still has an open recovery
 * case on it, that shelter is told - an alert and a push - so it can close the case instead of
 * still heading out for an animal that is already home. The app always said this happened; it didn't.
 */
async function tellShelterAboutOwnerUpdate(
  kind: 'lost' | 'found',
  report: { _id: unknown; name?: string | null; animalType: string; barangay?: string | null },
  status: string,
): Promise<void> {
  if (status !== 'recovered' && status !== 'closed') return;
  try {
    const openCase = await AnimalCase.findOne(
      { [kind === 'lost' ? 'lostReportId' : 'foundReportId']: report._id, status: 'under_rescue' },
      'shelterId',
    ).lean();
    if (!openCase) return;
    const what = report.name || `the ${report.animalType}`;
    const done =
      status === 'recovered'
        ? kind === 'lost'
          ? `The owner marked ${what} as recovered`
          : `The finder marked ${what} as returned to its owner`
        : `The reporter closed the report for ${what}`;
    await notify({
      audienceType: 'shelter',
      audienceId: openCase.shelterId,
      type: 'status_update',
      refId: report._id,
      title: 'Update on a case you are handling',
      body: `${done} (Brgy. ${report.barangay ?? 'San Jose Del Monte'}). Set the case outcome in Case Status.`,
    });
  } catch (err) {
    logger.error('status: failed to tell the shelter about an owner update', err);
  }
}

/** When each lost report was last checked for new candidates (per server instance). */
const lastMatchCheck = new Map<string, number>();
const MATCH_RECHECK_MS = 2 * 60_000;
/** A pair whose photo comparison could not run is tried again after this long. */
const UNCHECKED_RETRY_MS = 6 * 60 * 60_000;

export const userService = {
  // ----- Registration -----
  async register(input: {
    firstName: string;
    middleName?: string;
    lastName: string;
    email: string;
    phone?: string;
    password: string;
    barangay: string;
    alertRadiusMeters: number;
    location: { latitude: number; longitude: number };
  }) {
    const exists = await User.findOne({ email: input.email.toLowerCase().trim() });
    if (exists) throw ApiError.conflict('Email already registered');

    const user = await User.create({
      firstName: input.firstName,
      middleName: input.middleName,
      lastName: input.lastName,
      email: input.email.toLowerCase().trim(),
      phone: input.phone,
      passwordHash: await authService.hashPassword(input.password),
      barangay: input.barangay,
      alertRadiusMeters: input.alertRadiusMeters,
      homeLocation: latLngToGeoPoint(input.location),
    });

    return serializeUser(user);
  },

  // ----- Profile -----
  async getMe(userId: string) {
    const user = await User.findById(userId).lean();
    if (!user) throw ApiError.notFound('User not found');
    return serializeUser(user);
  },

  async updateProfile(userId: string, patch: Record<string, unknown>) {
    const update: Record<string, unknown> = {};
    for (const key of ['firstName', 'middleName', 'lastName', 'phone', 'photoUrl', 'barangay', 'alertRadiusMeters'] as const) {
      if (patch[key] !== undefined) update[key] = patch[key];
    }
    const loc = patch.location as { latitude?: number; longitude?: number } | undefined;
    if (loc?.latitude != null && loc.longitude != null) {
      update.homeLocation = latLngToGeoPoint({ latitude: loc.latitude, longitude: loc.longitude });
    }
    const user = await User.findByIdAndUpdate(userId, update, { new: true });
    if (!user) throw ApiError.notFound('User not found');
    return serializeUser(user);
  },

  async listMyReports(userId: string) {
    const [lost, found] = await Promise.all([
      LostPetReport.find({ reporterId: userId, isHiddenByModeration: false }).sort({ reportedAt: -1 }).lean(),
      FoundAnimalReport.find({ reporterId: userId, isHiddenByModeration: false }).sort({ reportedAt: -1 }).lean(),
    ]);
    return { lost: lost.map(serializeLostReport), found: found.map(serializeFoundReport) };
  },

  /** Shelter cases opened on this user's reports, so the owner can follow the rescue. */
  async listMyCases(userId: string) {
    const [lost, found] = await Promise.all([
      LostPetReport.find({ reporterId: userId }, '_id').lean(),
      FoundAnimalReport.find({ reporterId: userId }, '_id').lean(),
    ]);
    const cases = await AnimalCase.find({
      $or: [{ lostReportId: { $in: lost.map((r) => r._id) } }, { foundReportId: { $in: found.map((r) => r._id) } }],
    })
      .sort({ updatedAt: -1 })
      .lean();
    const shelters = await Shelter.find({ _id: { $in: cases.map((c) => c.shelterId) } }, 'name').lean();
    const nameById = new Map(shelters.map((s) => [String(s._id), s.name]));
    return cases.map((c) => serializeCase(c, nameById.get(String(c.shelterId))));
  },

  // ----- Dashboard -----
  getDashboard() {
    return statsService.platformStats();
  },

  // ----- Report Lost Pet -----
  async createLostReport(reporterId: string, data: any) {
    const user = await User.findById(reporterId);
    if (!user) throw ApiError.notFound('User not found');
    
    const report = await LostPetReport.create({
      ...data,
      // The barangay the pin is in, not whichever one the app happened to send.
      barangay: await barangayForPin(data.location.latitude, data.location.longitude),
      reporterId,
      reporterName: combineName(user),
      reporterPhone: user.phone,
      lastSeenLocation: latLngToGeoPoint(data.location),
    });
    
    const [lng, lat] = report.lastSeenLocation.coordinates as number[];

    // The report is saved. Screening, nearby alerts and matching are independent of each other, so
    // they run side by side: one after another, their Gemini calls added up past Vercel's time
    // limit (FUNCTION_INVOCATION_TIMEOUT) and the app showed an error for a report that had saved.
    const duplicatesTask = findDuplicatePhotos(report.imageUrls, String(report._id));
    const screenTask = duplicatesTask.then((duplicates) => moderationService.screenReport({
      reportType: 'lost',
      reportId: String(report._id),
      reporterId: String(reporterId),
      text: [data.name, data.breed, data.color, data.distinctMarks, data.description].filter(Boolean).join(' '),
      imageCount: report.imageUrls.length,
      imageUrl: report.imageUrls[0],
      animalType: report.animalType,
      color: data.color,
      barangay: report.barangay,
      description: data.description,
      duplicatePhotos: duplicates.length,
    }));

    const alertTask = smartAlertService.dispatchReportAlert({
      reportType: 'lost',
      reportId: String(report._id),
      reporterId: String(reporterId),
      lng,
      lat,
      summary: `${data.name || report.animalType} - ${data.color ?? ''} ${data.breed ?? ''}`.trim(),
    });

    // Real candidates ranked now (attribute pre-filter + Gemini photo comparison for the top few),
    // so matches are already there the first time the owner opens this report. Never blocks
    // report creation: a matching hiccup just means no suggestions yet, not a failed submission.
    const matchTask = (async () => {
      try {
        const ranked = await findMatches({
          animalType: report.animalType,
          color: data.color,
          breed: data.breed,
          size: data.size,
          location: data.location,
          imageUrl: report.imageUrls[0],
        });
        if (ranked.length) {
          await MatchSuggestion.insertMany(
            ranked.map((m) => ({
              lostReportId: report._id,
              candidateId: m.candidateId,
              candidateSource: m.candidateSource,
              score: m.score,
              reasons: m.reasons,
            })),
            { ordered: false },
          );
        }
      } catch (err) {
        logger.error('matching: failed to rank candidates for new lost report', err);
      }
    })();

    const [duplicates, screen] = await Promise.all([duplicatesTask, screenTask, alertTask, matchTask]);
    return { ...serializeLostReport(report), notices: submissionNotices(duplicates.length, screen.flagged) };
  },

  // ----- Reported Lost Pet Status Update -----
  async updateLostReportStatus(reporterId: string, id: string, status: string) {
    if (!REPORT_STATUSES.includes(status as never)) throw ApiError.badRequest('Invalid status');
    const before = await LostPetReport.findOne({ _id: id, reporterId }, 'status').lean();
    const report = await LostPetReport.findOneAndUpdate(
      { _id: id, reporterId },
      { status },
      { new: true },
    );
    if (!report) throw ApiError.notFound('Report not found');
    if (before?.status !== status) await tellShelterAboutOwnerUpdate('lost', report, status);
    return serializeLostReport(report);
  },

  async updateFoundReportStatus(reporterId: string, id: string, status: string) {
    if (!REPORT_STATUSES.includes(status as never)) throw ApiError.badRequest('Invalid status');
    const before = await FoundAnimalReport.findOne({ _id: id, reporterId }, 'status').lean();
    const report = await FoundAnimalReport.findOneAndUpdate({ _id: id, reporterId }, { status }, { new: true });
    if (!report) throw ApiError.notFound('Report not found');
    if (before?.status !== status) await tellShelterAboutOwnerUpdate('found', report, status);
    return serializeFoundReport(report);
  },

  /**
   * Same full cleanup as a Developer delete (cases, flags, matches, photos, conversations), so a
   * deleted report can't resurface through a shelter case or match suggestion that still points to it.
   */
  async deleteReport(reporterId: string, kind: 'lost' | 'found', id: string) {
    const owned =
      kind === 'lost'
        ? await LostPetReport.exists({ _id: id, reporterId })
        : await FoundAnimalReport.exists({ _id: id, reporterId });
    if (!owned) throw ApiError.notFound('Report not found');
    await deleteReportCascade(kind, id);
    return { id };
  },

  // ----- Report Found Animal -----
  async createFoundReport(reporterId: string, data: any) {
    const user = await User.findById(reporterId);
    if (!user) throw ApiError.notFound('User not found');
    
    const report = await FoundAnimalReport.create({
      ...data,
      // The barangay the pin is in, not whichever one the app happened to send.
      barangay: await barangayForPin(data.location.latitude, data.location.longitude),
      reporterId,
      reporterName: combineName(user),
      reporterPhone: user.phone,
      foundLocation: latLngToGeoPoint(data.location),
    });
    
    const [lng, lat] = report.foundLocation.coordinates as number[];

    // Same as a lost report: screening, alerts and matching run side by side after the save.
    const duplicatesTask = findDuplicatePhotos(report.imageUrls, String(report._id));
    const screenTask = duplicatesTask.then((duplicates) => moderationService.screenReport({
      reportType: 'found',
      reportId: String(report._id),
      reporterId: String(reporterId),
      text: [data.name, data.breed, data.color, data.distinctMarks, data.description].filter(Boolean).join(' '),
      imageCount: report.imageUrls.length,
      imageUrl: report.imageUrls[0],
      animalType: report.animalType,
      color: data.color,
      barangay: report.barangay,
      description: data.description,
      duplicatePhotos: duplicates.length,
    }));

    const alertTask = smartAlertService.dispatchReportAlert({
      reportType: 'found',
      reportId: String(report._id),
      reporterId: String(reporterId),
      lng,
      lat,
      summary: `${report.animalType} - ${data.color ?? ''} ${data.breed ?? ''}`.trim(),
    });

    // The reverse of the lost-report flow above: a freshly found animal is checked against
    // existing lost reports too, so an owner who already filed sees this the next time they
    // open their report instead of only matching reports filed after this one.
    const matchTask = (async () => {
      try {
        const ranked = await findMatchingLostReports({
          animalType: report.animalType,
          color: data.color,
          breed: data.breed,
          size: data.size,
          location: data.location,
          imageUrl: report.imageUrls[0],
        });
        if (ranked.length) {
          await MatchSuggestion.insertMany(
            ranked.map((m) => ({
              lostReportId: m.lostReportId,
              candidateId: report._id,
              candidateSource: 'found_report',
              score: m.score,
              reasons: m.reasons,
            })),
            { ordered: false },
          );
          await alertOwnersOfNewMatches(
            ranked.map((m) => m.lostReportId),
            `A found ${report.animalType} reported in Brgy. ${report.barangay ?? 'San Jose Del Monte'}`,
          );
        }
      } catch (err) {
        logger.error('matching: failed to rank lost reports for new found report', err);
      }
    })();

    const [duplicates, screen] = await Promise.all([duplicatesTask, screenTask, alertTask, matchTask]);
    return { ...serializeFoundReport(report), notices: submissionNotices(duplicates.length, screen.flagged) };
  },

  // ----- Shelter View -----
  async listShelters() {
    const shelters = await withLiveOccupancy(await Shelter.find({ approvalStatus: 'approved' }).lean());
    return shelters.map((sh) => serializeShelter(sh));
  },

  async listShelterAnimals(shelterId: string) {
    const animals = await ShelterAnimal.find({
      shelterId,
      // Adopted and inconclusive animals stop showing to the public.
      caseStatus: { $nin: ['adopted', 'inconclusive'] },
      isHiddenByModeration: false,
    }).lean();
    return animals.map(serializeShelterAnimal);
  },

  // ----- Image Recognition Matching -----
  /**
   * Possible matches for one lost report. Besides what was saved when reports were filed, every
   * load re-checks the open found reports and shelter animals by their details (no photo
   * comparison, so it is quick), saving any new pairing. A found report filed earlier, one whose
   * photo comparison failed, or one filed while matching was down still turns up here without
   * the owner having to run an image match.
   */
  async matchSuggestions(lostReportId: string) {
    const report = await LostPetReport.findById(lostReportId).lean();
    if (!report) return [];

    const lastSeen = geoPointToLatLng(report.lastSeenLocation as any);
    // The app reloads every 30 s; checking for new candidates once every couple of minutes per
    // report is plenty, and keeps this from adding work (and Gemini calls) to every reload.
    const due = Date.now() - (lastMatchCheck.get(lostReportId) ?? 0) > MATCH_RECHECK_MS;
    if (due && (report.status === 'active' || report.status === 'matched') && lastSeen) {
      lastMatchCheck.set(lostReportId, Date.now());
      if (lastMatchCheck.size > 5000) lastMatchCheck.delete(lastMatchCheck.keys().next().value as string);
      try {
        // Every pair checked before (shown, hidden or ruled out) is skipped; only new found reports
        // and shelter animals are checked, one photo comparison at a time. A pair whose comparison
        // could not run is retried once it is a few hours old.
        const known = await MatchSuggestion.find(
          {
            lostReportId: report._id,
            $or: [{ status: { $ne: 'unchecked' } }, { updatedAt: { $gt: new Date(Date.now() - UNCHECKED_RETRY_MS) } }],
          },
          'candidateId candidateSource',
        ).lean();
        const evaluated = await evaluateNewCandidates(
          {
            animalType: report.animalType as any,
            color: report.color ?? undefined,
            breed: report.breed ?? undefined,
            size: report.size ?? undefined,
            location: lastSeen,
            imageUrl: report.imageUrls?.[0],
          },
          new Set(known.map((k) => `${k.candidateSource}:${String(k.candidateId)}`)),
        );
        if (evaluated.length) {
          await MatchSuggestion.bulkWrite(
            evaluated.map((m) => ({
              updateOne: {
                filter: { lostReportId: report._id, candidateId: m.candidateId, candidateSource: m.candidateSource },
                update: { $set: { score: m.score, reasons: m.reasons, status: m.verdict } },
                upsert: true,
              },
            })),
            { ordered: false },
          );
        }
      } catch (err) {
        logger.error('matching: failed to refresh suggestions for lost report', err);
      }
    }

    const matches = await MatchSuggestion.find({ lostReportId, status: { $in: ['suggested', 'confirmed'] } })
      .sort({ score: -1, createdAt: -1 })
      .limit(20)
      .lean();

    // Drop suggestions whose found report / shelter animal is gone, closed or hidden.
    const foundIds = matches.filter((m) => m.candidateSource === 'found_report').map((m) => m.candidateId);
    const animalIds = matches.filter((m) => m.candidateSource === 'shelter_animal').map((m) => m.candidateId);
    const [openFound, openAnimals] = await Promise.all([
      foundIds.length
        ? FoundAnimalReport.find({ _id: { $in: foundIds }, status: { $in: ['active', 'matched'] }, isHiddenByModeration: false }, '_id').lean()
        : [],
      animalIds.length
        ? ShelterAnimal.find({ _id: { $in: animalIds }, caseStatus: { $nin: ['adopted'] }, isHiddenByModeration: false }, '_id').lean()
        : [],
    ]);
    const open = new Set([...openFound, ...openAnimals].map((d) => String(d._id)));
    return matches
      .filter((m) => open.has(String(m.candidateId)))
      .slice(0, 10)
      .map(serializeMatchSuggestion);
  },

  /** Ad-hoc "scan a photo" search, not tied to any report of the caller's own - results aren't persisted. */
  async scanPhoto(
    userId: string,
    input: {
      animalType: string;
      color?: string;
      breed?: string;
      size?: string;
      location: { latitude: number; longitude: number };
      photoUrl?: string;
      lostReportId?: string;
    },
  ) {
    const ranked = await findMatches({
      animalType: input.animalType as any,
      color: input.color,
      breed: input.breed,
      size: input.size,
      location: input.location,
      imageUrl: input.photoUrl,
    });

    // A scan for one of the owner's own lost reports is saved as that report's possible matches,
    // so what the scan found is still listed (and counted) after leaving the screen.
    if (input.lostReportId && ranked.length) {
      const own = await LostPetReport.exists({ _id: input.lostReportId, reporterId: userId });
      if (own) {
        try {
          const hidden = await MatchSuggestion.find(
            // Hidden by the owner, or already confirmed: leave those as they are.
            { lostReportId: input.lostReportId, status: { $in: ['dismissed', 'confirmed'] } },
            'candidateId candidateSource',
          ).lean();
          const skip = new Set(hidden.map((h) => `${h.candidateSource}:${String(h.candidateId)}`));
          const keepers = ranked.filter((m) => !skip.has(`${m.candidateSource}:${m.candidateId}`));
          if (keepers.length) {
            await MatchSuggestion.bulkWrite(
              keepers.map((m) => ({
                updateOne: {
                  filter: { lostReportId: input.lostReportId, candidateId: m.candidateId, candidateSource: m.candidateSource },
                  update: { $max: { score: m.score }, $set: { reasons: m.reasons, status: 'suggested' } },
                  upsert: true,
                },
              })),
              { ordered: false },
            );
          }
        } catch (err) {
          logger.error('matching: failed to save scan results', err);
        }
      }
    }

    return ranked.map((m) => ({
      candidateId: m.candidateId,
      candidateSource: m.candidateSource,
      score: m.score,
      reasons: m.reasons,
    }));
  },

  // ----- Map View Interface -----
  async mapReports(bbox?: { lng: number; lat: number; radiusMeters: number }) {
    const lostQ: Record<string, unknown> = { status: 'active', isHiddenByModeration: false };
    const foundQ: Record<string, unknown> = { status: 'active', isHiddenByModeration: false };
    
    if (bbox) {
      Object.assign(lostQ, geolocationService.nearFilter('lastSeenLocation', bbox.lng, bbox.lat, bbox.radiusMeters));
      Object.assign(foundQ, geolocationService.nearFilter('foundLocation', bbox.lng, bbox.lat, bbox.radiusMeters));
    }
    
    const [lost, found] = await Promise.all([
      LostPetReport.find(lostQ).lean(),
      FoundAnimalReport.find(foundQ).lean(),
    ]);
    
    return {
      type: 'FeatureCollection',
      features: [
        ...lost.map((r) => toFeature(r, 'lost', (r as any).lastSeenLocation)),
        ...found.map((r) => toFeature(r, 'found', (r as any).foundLocation)),
      ],
    };
  },

  // ----- Search and Filter Reports -----
  async searchReports(filter: {
    kind?: 'lost' | 'found';
    animalType?: string;
    dateFrom?: string;
    dateTo?: string;
    lng?: number;
    lat?: number;
    radiusMeters?: number;
  }) {
    const q: Record<string, unknown> = { isHiddenByModeration: false, status: 'active' };
    if (filter.animalType) q.animalType = filter.animalType;
    if (filter.dateFrom || filter.dateTo) {
      q.reportedAt = {
        ...(filter.dateFrom ? { $gte: new Date(filter.dateFrom) } : {}),
        ...(filter.dateTo ? { $lte: new Date(filter.dateTo) } : {}),
      };
    }
    
    const runLost = filter.kind !== 'found';
    const runFound = filter.kind !== 'lost';
    const withGeo = (field: string) =>
      filter.lng != null && filter.lat != null && filter.radiusMeters != null
        ? geolocationService.nearFilter(field, filter.lng, filter.lat, filter.radiusMeters)
        : {};
    
    const [lost, found] = await Promise.all([
      runLost ? LostPetReport.find({ ...q, ...withGeo('lastSeenLocation') }).lean() : [],
      runFound ? FoundAnimalReport.find({ ...q, ...withGeo('foundLocation') }).lean() : [],
    ]);
    
    return {
      lost: lost.map(serializeLostReport),
      found: found.map(serializeFoundReport),
    };
  },

  // ----- Smart Notifications feed -----
  async listNotifications(userId: string) {
    const notifications = await Notification.find({ audienceType: 'user', audienceId: userId })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    return notifications.map(serializeNotification);
  },

  async markNotificationRead(userId: string, id: string) {
    const notif = await Notification.findOneAndUpdate(
      { _id: id, audienceType: 'user', audienceId: userId },
      { isRead: true },
      { new: true },
    );
    if (!notif) throw ApiError.notFound('Notification not found');
    return serializeNotification(notif);
  },

  async updatePushToken(userId: string, token: string) {
    const user = await User.findByIdAndUpdate(userId, { expoPushToken: token }, { new: true });
    return user ? serializeUser(user) : null;
  },
};

/** What the reporter is told right after submitting. */
function submissionNotices(duplicatePhotos: number, flagged: boolean): string[] {
  const notices: string[] = [];
  if (duplicatePhotos) {
    notices.push(
      duplicatePhotos === 1
        ? 'One of your photos was already used on another report.'
        : `${duplicatePhotos} of your photos were already used on other reports.`,
    );
  }
  if (flagged) notices.push('Your report was flagged for an admin to review. It stays visible until then.');
  return notices;
}

function toFeature(r: any, kind: 'lost' | 'found', point: any) {
  return {
    type: 'Feature' as const,
    geometry: point,
    properties: {
      id: String(r._id),
      kind,
      animalType: r.animalType,
      color: r.color,
      breed: r.breed,
      barangay: r.barangay,
      address: r.address,
      landmark: r.landmark,
      reportedAt: r.reportedAt,
    },
  };
}
