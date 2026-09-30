import bcrypt from 'bcryptjs';
import { Shelter } from '../../models/Shelter';
import { ShelterAnimal } from '../../models/ShelterAnimal';
import { AnimalCase } from '../../models/AnimalCase';
import { LostPetReport } from '../../models/LostPetReport';
import { FoundAnimalReport } from '../../models/FoundAnimalReport';
import { Notification } from '../../models/Notification';
import { geolocationService } from '../../services/geolocation.service';
import { ApiError } from '../../utils/ApiError';
import {
  serializeShelter,
  serializeShelterAnimal,
  serializeLostReport,
  serializeFoundReport,
  serializeNotification,
  serializeCase,
  latLngToGeoPoint,
} from '../../utils/geoHelpers';
import type { ANIMAL_CASE_STATUSES } from '../../config/constants';

type CaseStatus = (typeof ANIMAL_CASE_STATUSES)[number];

export const shelterService = {
  // ----- Register -----
  async register(input: {
    name: string;
    barangay: string;
    contactNumber?: string;
    email?: string;
    houseUnitNo?: string;
    street?: string;
    subdivision?: string;
    location: { latitude: number; longitude: number };
    operatingRadiusMeters: number;
    permitNumber?: string;
    capacity?: number;
  }) {
    const shelter = await Shelter.create({
      name: input.name,
      barangay: input.barangay,
      contactNumber: input.contactNumber,
      email: input.email,
      houseUnitNo: input.houseUnitNo,
      street: input.street,
      subdivision: input.subdivision,
      location: latLngToGeoPoint(input.location),
      operatingRadiusMeters: input.operatingRadiusMeters,
      permitNumber: input.permitNumber,
      capacity: input.capacity,
      approvalStatus: 'pending',
    });
    return serializeShelter(shelter);
  },

  // ----- Dashboard -----
  async getDashboard(shelterId: string) {
    const shelter = await Shelter.findById(shelterId).lean();
    if (!shelter) throw ApiError.notFound('Shelter not found');
    const [lng, lat] = shelter.location!.coordinates as number[];
    const open = { status: { $in: ['active', 'matched'] }, isHiddenByModeration: false };
    const radius = shelter.operatingRadiusMeters;

    // Only reports inside this shelter's operating radius count as its active reports.
    const [lostActive, foundActive, reunited, underRescue] = await Promise.all([
      LostPetReport.countDocuments({ ...open, ...geolocationService.withinFilter('lastSeenLocation', lng, lat, radius) }),
      FoundAnimalReport.countDocuments({ ...open, ...geolocationService.withinFilter('foundLocation', lng, lat, radius) }),
      ShelterAnimal.countDocuments({ shelterId, caseStatus: 'reunited' }),
      ShelterAnimal.countDocuments({ shelterId, caseStatus: 'under_rescue' }),
    ]);
    return { activeReports: lostActive + foundActive, reunited, underRescue };
  },

  // ----- Shelter Animals Management -----
  async listShelterAnimals(shelterId: string) {
    const animals = await ShelterAnimal.find({ shelterId }).sort({ intakeDate: -1 }).lean();
    return animals.map(serializeShelterAnimal);
  },

  async addShelterAnimal(shelterId: string, data: Record<string, unknown>) {
    const animal = await ShelterAnimal.create({ ...data, shelterId });
    return serializeShelterAnimal(animal);
  },

  // ----- Recovered Animals Posting -----
  async postRecovered(shelterId: string, data: Record<string, unknown>) {
    const animal = await ShelterAnimal.create({
      ...data,
      shelterId,
      postedPublicly: true,
      caseStatus: 'under_rescue',
    });
    return serializeShelterAnimal(animal);
  },

  // ----- Animal Report Management (lost/found within operating radius) -----
  async listAreaReports(shelterId: string) {
    const shelter = await Shelter.findById(shelterId).lean();
    if (!shelter) throw ApiError.notFound('Shelter not found');
    
    const [lng, lat] = shelter.location!.coordinates as number[];
    const radius = shelter.operatingRadiusMeters;
    
    // Reports this shelter has opened a case for stay listed after they are recovered or closed,
    // otherwise the case card loses the animal it is about as soon as the case is resolved.
    const cases = await AnimalCase.find({ shelterId }, 'lostReportId foundReportId').lean();
    const lostCaseIds = cases.map((c) => c.lostReportId).filter(Boolean);
    const foundCaseIds = cases.map((c) => c.foundReportId).filter(Boolean);

    const [lost, found] = await Promise.all([
      LostPetReport.find({
        isHiddenByModeration: false,
        $or: [
          {
            status: { $in: ['active', 'matched'] },
            ...geolocationService.withinFilter('lastSeenLocation', lng, lat, radius),
          },
          { _id: { $in: lostCaseIds } },
        ],
      }).lean(),
      FoundAnimalReport.find({
        isHiddenByModeration: false,
        $or: [
          {
            status: { $in: ['active', 'matched'] },
            ...geolocationService.withinFilter('foundLocation', lng, lat, radius),
          },
          { _id: { $in: foundCaseIds } },
        ],
      }).lean(),
    ]);
    
    return {
      lost: lost.map(serializeLostReport),
      found: found.map(serializeFoundReport),
    };
  },

  // ----- Cases -----
  async listCases(shelterId: string) {
    const shelter = await Shelter.findById(shelterId).lean();
    const cases = await AnimalCase.find({ shelterId }).sort({ updatedAt: -1 }).lean();
    return cases.map((c) => serializeCase(c, shelter?.name));
  },

  /** Shelter responds to a lost or found report: opens a case and marks the report as matched. */
  async openCase(shelterId: string, reportId: string, note?: string) {
    const shelter = await Shelter.findById(shelterId).lean();
    if (!shelter) throw ApiError.notFound('Shelter not found');

    const lost = await LostPetReport.findById(reportId);
    const report = lost ?? (await FoundAnimalReport.findById(reportId));
    if (!report) throw ApiError.notFound('Report not found');

    const existing = await AnimalCase.findOne({ shelterId, [lost ? 'lostReportId' : 'foundReportId']: report._id });
    if (existing) throw ApiError.conflict('This shelter already has a case for that report');

    const doc = await AnimalCase.create({
      shelterId,
      [lost ? 'lostReportId' : 'foundReportId']: report._id,
      status: 'under_rescue',
      history: [{ status: 'under_rescue', note, changedBy: shelterId, changedAt: new Date() }],
    });
    report.caseId = doc._id;
    report.status = 'matched';
    await report.save();

    if (lost) {
      await Notification.create({
        audienceType: 'user',
        audienceId: lost.reporterId,
        type: 'status_update',
        refId: lost._id,
        title: 'A shelter responded to your report',
        body: `${shelter.name} opened a rescue case. Status: Under rescue.`,
      });
    }
    return serializeCase(doc.toObject(), shelter.name);
  },

  // ----- Animal Status Management -----
  async updateCaseStatus(params: {
    shelterId: string;
    caseId: string;
    status: CaseStatus;
    notes?: string;
  }) {
    const doc = await AnimalCase.findOne({ _id: params.caseId, shelterId: params.shelterId });
    if (!doc) throw ApiError.notFound('Animal case not found');
    const shelter = await Shelter.findById(params.shelterId).lean();

    doc.status = params.status;
    if (params.notes) doc.notes = params.notes;
    doc.history.push({
      status: params.status,
      note: params.notes,
      changedBy: params.shelterId as never,
      changedAt: new Date(),
    });
    await doc.save();

    if (doc.lostReportId) {
      const lost = await LostPetReport.findById(doc.lostReportId);
      if (lost) {
        if (params.status === 'reunited') {
          lost.status = 'recovered';
          await lost.save();
        }
        await Notification.create({
          audienceType: 'user',
          audienceId: lost.reporterId,
          type: 'status_update',
          refId: lost._id,
          title: 'Case status updated',
          body: `${shelter?.name ?? 'The shelter'} set the case to "${params.status.replace('_', ' ')}". ${params.notes ?? ''}`.trim(),
        });
      }
    }
    return serializeCase(doc.toObject(), shelter?.name);
  },

  async updateAnimal(shelterId: string, id: string, patch: { caseStatus?: CaseStatus; postedPublicly?: boolean }) {
    const update: Record<string, unknown> = {};
    if (patch.caseStatus !== undefined) update.caseStatus = patch.caseStatus;
    if (patch.postedPublicly !== undefined) update.postedPublicly = patch.postedPublicly;
    const animal = await ShelterAnimal.findOneAndUpdate({ _id: id, shelterId }, update, { new: true });
    if (!animal) throw ApiError.notFound('Animal not found');
    return serializeShelterAnimal(animal);
  },

  async getMe(shelterId: string) {
    const shelter = await Shelter.findById(shelterId).lean();
    if (!shelter) throw ApiError.notFound('Shelter not found');
    return serializeShelter(shelter);
  },

  // ----- Shelter Profile Management -----
  async updateProfile(shelterId: string, patch: Record<string, unknown>) {
    const allowed = [
      'name',
      'contactNumber',
      'houseUnitNo',
      'street',
      'subdivision',
      'photoUrl',
      'barangay',
      'location',
      'operatingRadiusMeters',
      'email',
      'capacity',
      'currentOccupancy',
    ];
    const update = Object.fromEntries(
      Object.entries(patch)
        .filter(([k]) => allowed.includes(k))
        .map(([k, v]) => {
          // Convert location from LatLng to GeoPoint if present
          if (k === 'location' && v && typeof v === 'object' && 'latitude' in v) {
            return [k, latLngToGeoPoint(v as any)];
          }
          return [k, v];
        })
    );
    
    const shelter = await Shelter.findByIdAndUpdate(shelterId, update, { new: true });
    return shelter ? serializeShelter(shelter) : null;
  },

  // ----- Change the password the Developer issued -----
  async changePassword(shelterId: string, currentPassword: string, newPassword: string) {
    const shelter = await Shelter.findById(shelterId);
    if (!shelter?.adminPasswordHash) throw ApiError.notFound('Shelter not found');
    if (!(await bcrypt.compare(currentPassword, shelter.adminPasswordHash))) {
      // 403, not 401: the session itself is valid. A 401 here would trip the
      // client's global "session expired" handler and sign the shelter out.
      throw ApiError.forbidden('Current password is incorrect');
    }
    shelter.adminPasswordHash = await bcrypt.hash(newPassword, 10);
    await shelter.save();
    return { ok: true };
  },

  // ----- Notification Management -----
  async listNotifications(shelterId: string) {
    const notifications = await Notification.find({
      audienceType: 'shelter',
      audienceId: shelterId,
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    return notifications.map(serializeNotification);
  },

  async markNotificationRead(shelterId: string, id: string) {
    const notif = await Notification.findOneAndUpdate(
      { _id: id, audienceType: 'shelter', audienceId: shelterId },
      { isRead: true },
      { new: true },
    );
    if (!notif) throw ApiError.notFound('Notification not found');
    return serializeNotification(notif);
  },
};
