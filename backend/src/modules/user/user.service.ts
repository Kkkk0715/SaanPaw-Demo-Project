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
import { findMatches, findMatchingLostReports } from '../../services/matching.service';
import { statsService } from '../../services/stats.service';
import { deleteReportCascade } from '../../services/cascadeDelete.service';
import { findDuplicatePhotos } from '../../services/photoFingerprint.service';
import { geolocationService } from '../../services/geolocation.service';
import { authService } from '../auth/auth.service';
import { REPORT_STATUSES } from '../../config/constants';
import { ApiError } from '../../utils/ApiError';
import { logger } from '../../utils/logger';
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
} from '../../utils/geoHelpers';

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
    const report = await LostPetReport.findOneAndUpdate(
      { _id: id, reporterId },
      { status },
      { new: true },
    );
    if (!report) throw ApiError.notFound('Report not found');
    return serializeLostReport(report);
  },

  async updateFoundReportStatus(reporterId: string, id: string, status: string) {
    if (!REPORT_STATUSES.includes(status as never)) throw ApiError.badRequest('Invalid status');
    const report = await FoundAnimalReport.findOneAndUpdate({ _id: id, reporterId }, { status }, { new: true });
    if (!report) throw ApiError.notFound('Report not found');
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
    const shelters = await Shelter.find({ approvalStatus: 'approved' }).lean();
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
  async matchSuggestions(lostReportId: string) {
    const matches = await MatchSuggestion.find({ lostReportId })
      .sort({ score: -1, createdAt: -1 })
      .limit(10)
      .lean();
    return matches.map(serializeMatchSuggestion);
  },

  /** Ad-hoc "scan a photo" search, not tied to any report of the caller's own - results aren't persisted. */
  async scanPhoto(input: {
    animalType: string;
    color?: string;
    breed?: string;
    size?: string;
    location: { latitude: number; longitude: number };
    photoUrl?: string;
  }) {
    const ranked = await findMatches({
      animalType: input.animalType as any,
      color: input.color,
      breed: input.breed,
      size: input.size,
      location: input.location,
      imageUrl: input.photoUrl,
    });
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
