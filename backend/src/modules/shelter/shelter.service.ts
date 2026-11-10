import bcrypt from 'bcryptjs';
import { Shelter } from '../../models/Shelter';
import { ShelterAnimal } from '../../models/ShelterAnimal';
import { AnimalCase } from '../../models/AnimalCase';
import { LostPetReport } from '../../models/LostPetReport';
import { FoundAnimalReport } from '../../models/FoundAnimalReport';
import { MatchSuggestion } from '../../models/MatchSuggestion';
import { withLiveOccupancy } from '../../services/occupancy.service';
import { Notification } from '../../models/Notification';
import { ShelterProofDocument } from '../../models/ShelterProofDocument';
import { deleteShelterAnimalCascade } from '../../services/cascadeDelete.service';
import { findDuplicatePhotos } from '../../services/photoFingerprint.service';
import { notify } from '../../services/pushNotification.service';
import { alertOwnersOfNewMatches, findMatchingLostReports, type AnimalType } from '../../services/matching.service';
import { moderationService } from '../../services/moderation.service';
import { geolocationService } from '../../services/geolocation.service';
import { geoPointToLatLng } from '../../utils/geoHelpers';
import { ApiError } from '../../utils/ApiError';
import { logger } from '../../utils/logger';
import {
  serializeShelter,
  serializeShelterAnimal,
  serializeLostReport,
  serializeFoundReport,
  serializeNotification,
  serializeCase,
  latLngToGeoPoint,
} from '../../utils/geoHelpers';
import {
  CASE_STATUS_LABELS,
  CLOSING_CASE_STATUSES,
  SHELTERED_CASE_STATUSES,
  canChangeCaseStatus,
  type ANIMAL_CASE_STATUSES,
  type SHELTER_ANIMAL_STATUSES,
} from '../../config/constants';

/** How long an uploaded proof document waits to be attached to an application before it is ignored. */
const PROOF_CLAIM_WINDOW_MS = 2 * 60 * 60 * 1000;

type CaseStatus = (typeof ANIMAL_CASE_STATUSES)[number];
type AnimalStatus = (typeof SHELTER_ANIMAL_STATUSES)[number];

/** A recovered case becomes an animal in care; reunited and adopted carry straight over. */
const animalStatusForCase = (status: CaseStatus): AnimalStatus => (status === 'recovered' ? 'under_rescue' : (status as AnimalStatus));

type CaseDoc = InstanceType<typeof AnimalCase>;
type ReportDoc = InstanceType<typeof LostPetReport> | InstanceType<typeof FoundAnimalReport>;

/**
 * Copies the animal on a resident's report into the shelter's own Shelter Animals records, once
 * the shelter has it (Recovered) or the case ends as Reunited or Adopted - so it leaves Animal
 * Reports and shows under the matching Shelter Animals tab, where its status can still be updated.
 */
async function shelterAnimalFromCase(caseDoc: CaseDoc, report: ReportDoc, status: AnimalStatus) {
  const kind: 'lost' | 'found' = caseDoc.lostReportId ? 'lost' : 'found';
  const r = report as unknown as Record<string, unknown> & { _id: unknown; imageUrls?: string[] };
  const fallbackName = [r.color, r.breed || r.animalType].filter(Boolean).join(' ');
  const animal = await ShelterAnimal.create({
    shelterId: caseDoc.shelterId,
    name: (r.name as string | undefined) || fallbackName || 'Unnamed animal',
    animalType: r.animalType,
    breed: r.breed,
    color: r.color,
    sex: r.sex,
    size: r.size,
    distinctMarks: r.distinctMarks,
    description: r.description,
    imageUrls: r.imageUrls ?? [],
    intakeType: 'recovered',
    intakeDate: new Date(),
    caseStatus: status,
    postedPublicly: false,
    notes: caseDoc.notes || (r.description as string | undefined),
    caseId: caseDoc._id,
    sourceReportId: r._id,
    sourceReportKind: kind,
  });
  caseDoc.shelterAnimalId = animal._id;
  await caseDoc.save();
  return animal;
}

/** The report a case was opened from, either kind. */
async function reportForCase(caseDoc: { lostReportId?: unknown; foundReportId?: unknown }): Promise<ReportDoc | null> {
  if (caseDoc.lostReportId) return LostPetReport.findById(caseDoc.lostReportId);
  if (caseDoc.foundReportId) return FoundAnimalReport.findById(caseDoc.foundReportId);
  return null;
}

/** What an outcome does to the report behind a case. Recovered keeps a lost report open for its owner. */
async function applyOutcomeToReport(report: ReportDoc, kind: 'lost' | 'found', status: CaseStatus) {
  let next: string | null = null;
  if (status === 'reunited') next = kind === 'lost' ? 'recovered' : 'closed';
  else if (CLOSING_CASE_STATUSES.includes(status)) next = 'closed';
  else if (status === 'recovered' && kind === 'found') next = 'closed'; // the stray is in the shelter now
  if (next && report.status !== next) {
    report.status = next as never;
    await report.save();
  }
}

/**
 * Reverse of the lost-report matching flow in user.service.ts: a freshly intake/recovered shelter
 * animal is checked against existing lost reports too, so an owner who already filed sees this
 * animal as a candidate the next time they open their report, not only animals posted after it.
 * A shelter animal has no location of its own - it inherits its shelter's, same as the forward
 * direction's candidate-gathering does.
 */
async function matchAnimalAgainstLostReports(animal: {
  _id: unknown;
  shelterId: unknown;
  animalType: AnimalType;
  color?: string | null;
  breed?: string | null;
  size?: string | null;
  imageUrls: string[];
}): Promise<void> {
  try {
    const shelter = await Shelter.findById(animal.shelterId, 'location name').lean();
    const location = geoPointToLatLng(shelter?.location as any);
    if (!location) return;
    const ranked = await findMatchingLostReports({
      animalType: animal.animalType,
      color: animal.color ?? undefined,
      breed: animal.breed ?? undefined,
      size: animal.size ?? undefined,
      location,
      imageUrl: animal.imageUrls[0],
    });
    if (ranked.length) {
      await MatchSuggestion.insertMany(
        ranked.map((m) => ({
          lostReportId: m.lostReportId,
          candidateId: animal._id,
          candidateSource: 'shelter_animal',
          score: m.score,
          reasons: m.reasons,
        })),
        { ordered: false },
      );
      await alertOwnersOfNewMatches(
        ranked.map((m) => m.lostReportId),
        `A ${animal.animalType} now in the care of ${shelter?.name ?? 'a shelter'}`,
      );
    }
  } catch (err) {
    logger.error('matching: failed to rank lost reports for new shelter animal', err);
  }
}

/** Runs the same AI content screen a citizen's lost/found report gets, over a shelter's own posting. */
async function screenAnimalPosting(
  shelterId: string,
  animal: { _id: unknown; imageUrls: string[] },
  data: Record<string, unknown>,
): Promise<string[]> {
  const duplicates = await findDuplicatePhotos(animal.imageUrls, String(animal._id));
  await moderationService.screenShelterAnimal({
    shelterId,
    animalId: String(animal._id),
    text: [data.name, data.breed, data.color, data.distinctMarks, data.description]
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
      .join(' '),
    imageCount: animal.imageUrls.length,
    imageUrl: animal.imageUrls[0],
    duplicatePhotos: duplicates.length,
  });
  return duplicates.length ? [duplicatePhotoNotice(duplicates.length)] : [];
}

export const duplicatePhotoNotice = (count: number) =>
  count === 1
    ? 'One of your photos was already used on another report, so this posting was flagged for an admin to review.'
    : `${count} of your photos were already used on other reports, so this posting was flagged for an admin to review.`;

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
    proofDocumentIds: string[];
  }) {
    // One shelter account per email, the same rule as user sign-up. A rejected application does not
    // hold the email, so a shelter can fix its details and apply again.
    const email = input.email?.toLowerCase().trim();
    if (email && (await Shelter.exists({ email, approvalStatus: { $in: ['pending', 'approved'] } }))) {
      throw ApiError.conflict('Email already registered');
    }

    // Only documents uploaded recently and not yet attached to another application can be claimed.
    const proofs = await ShelterProofDocument.find(
      {
        _id: { $in: input.proofDocumentIds },
        shelterId: { $exists: false },
        createdAt: { $gte: new Date(Date.now() - PROOF_CLAIM_WINDOW_MS) },
      },
      '_id',
    ).lean();
    if (!proofs.length) {
      throw ApiError.badRequest('Your proof documents expired or were not uploaded. Attach them again and resubmit.');
    }

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
      proofDocumentIds: proofs.map((p) => p._id),
    });
    await ShelterProofDocument.updateMany({ _id: { $in: proofs.map((p) => p._id) } }, { shelterId: shelter._id });
    return serializeShelter(shelter);
  },

  /** Public: one proof document for an application that is about to be submitted. */
  async uploadProofDocument(file: { buffer: Buffer; mimetype: string; originalname?: string }) {
    const doc = await ShelterProofDocument.create({
      filename: (file.originalname || 'document').slice(0, 150),
      contentType: file.mimetype,
      size: file.buffer.length,
      data: file.buffer,
    });
    return { id: String(doc._id), filename: doc.filename, contentType: doc.contentType, size: doc.size };
  },

  // ----- Dashboard -----
  async getDashboard(shelterId: string) {
    const shelter = await Shelter.findById(shelterId).lean();
    if (!shelter) throw ApiError.notFound('Shelter not found');
    const [lng, lat] = shelter.location!.coordinates as number[];
    const open = { status: { $in: ['active', 'matched'] }, isHiddenByModeration: false };
    const radius = shelter.operatingRadiusMeters;

    // Only reports inside this shelter's operating radius count as its active reports.
    // A shelter's reunions and ongoing recoveries are both its own animals and the cases it opened
    // from residents' reports - counting only the animals left Reunited at 0 for report cases.
    const [lostActive, foundActive, reunitedAnimals, recoveringAnimals, reunitedCases, recoveringCases] = await Promise.all([
      LostPetReport.countDocuments({ ...open, ...geolocationService.withinFilter('lastSeenLocation', lng, lat, radius) }),
      FoundAnimalReport.countDocuments({ ...open, ...geolocationService.withinFilter('foundLocation', lng, lat, radius) }),
      ShelterAnimal.countDocuments({ shelterId, caseStatus: 'reunited' }),
      ShelterAnimal.countDocuments({ shelterId, caseStatus: 'under_rescue' }),
      // Report cases now have a Shelter Animals record (counted above); only older ones without one count here.
      AnimalCase.countDocuments({ shelterId, status: 'reunited', shelterAnimalId: null }),
      AnimalCase.countDocuments({ shelterId, status: 'under_rescue' }),
    ]);
    return {
      activeReports: lostActive + foundActive,
      reunited: reunitedAnimals + reunitedCases,
      underRescue: recoveringAnimals + recoveringCases,
    };
  },

  // ----- Shelter Animals Management -----
  async listShelterAnimals(shelterId: string) {
    // Cases that ended as recovered / reunited / adopted before Shelter Animals took them in
    // (or whose copy failed) get their record now, so every such animal is listed exactly once.
    const unlisted = await AnimalCase.find({ shelterId, status: { $in: SHELTERED_CASE_STATUSES }, shelterAnimalId: null });
    for (const caseDoc of unlisted) {
      const report = await reportForCase(caseDoc);
      if (report) await shelterAnimalFromCase(caseDoc, report, animalStatusForCase(caseDoc.status as CaseStatus));
    }

    const animals = await ShelterAnimal.find({ shelterId, isHiddenByModeration: false }).sort({ intakeDate: -1 }).lean();
    return animals.map(serializeShelterAnimal);
  },

  async addShelterAnimal(shelterId: string, data: Record<string, unknown>) {
    const animal = await ShelterAnimal.create({ ...data, shelterId });
    await matchAnimalAgainstLostReports(animal);
    const notices = await screenAnimalPosting(shelterId, animal, data);
    return { ...serializeShelterAnimal(animal), notices };
  },

  async deleteAnimal(shelterId: string, id: string) {
    const removed = await deleteShelterAnimalCascade(shelterId, id);
    if (!removed) throw ApiError.notFound('Animal not found');
    return { id };
  },

  // ----- Recovered Animals Posting -----
  async postRecovered(shelterId: string, data: Record<string, unknown>) {
    const animal = await ShelterAnimal.create({
      ...data,
      shelterId,
      postedPublicly: true,
      caseStatus: 'under_rescue',
    });
    await matchAnimalAgainstLostReports(animal);
    const notices = await screenAnimalPosting(shelterId, animal, data);
    return { ...serializeShelterAnimal(animal), notices };
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

    // Notifies the reporter either way: a found report's finder deserves to know their report
    // was picked up just as much as a lost report's owner does.
    await notify({
      audienceType: 'user',
      audienceId: report.reporterId,
      type: 'status_update',
      refId: report._id,
      title: 'A shelter responded to your report',
      body: `${shelter.name} opened a recovery case. Status: ${CASE_STATUS_LABELS.under_rescue}.`,
    });
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
    // One-way only: under recovery -> one outcome. A closed case can't be reopened or cycled.
    if (!canChangeCaseStatus(doc.status as CaseStatus, params.status)) {
      throw ApiError.conflict(
        doc.status === 'under_rescue'
          ? `This case is already ${CASE_STATUS_LABELS.under_rescue.toLowerCase()}.`
          : `This case is closed as "${CASE_STATUS_LABELS[doc.status as CaseStatus]}" and can't be changed.`,
      );
    }
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

    // A case can be opened from either report kind (openCase above); keep both in sync the same
    // way instead of only ever handling the lost-report side.
    const report = await reportForCase(doc);
    const kind: 'lost' | 'found' = doc.lostReportId ? 'lost' : 'found';

    if (report) {
      await applyOutcomeToReport(report, kind, params.status);

      // Recovered, reunited or adopted: the animal now belongs on Shelter Animals, under the
      // matching tab, and leaves Animal Reports (its case is no longer open).
      if (SHELTERED_CASE_STATUSES.includes(params.status) && !doc.shelterAnimalId) {
        const animal = await shelterAnimalFromCase(doc, report, animalStatusForCase(params.status));
        // A stray now in the shelter's care may be someone's lost pet.
        if (params.status === 'recovered' && kind === 'found') await matchAnimalAgainstLostReports(animal as never);
      }

      await notify({
        audienceType: 'user',
        audienceId: report.reporterId,
        type: 'status_update',
        refId: report._id,
        title: params.status === 'recovered' ? 'The animal was recovered' : 'Case status updated',
        body: (params.status === 'recovered'
          ? `${shelter?.name ?? 'The shelter'} has recovered the animal and is caring for it at the shelter. ${params.notes ?? ''}`
          : `${shelter?.name ?? 'The shelter'} set the case to "${CASE_STATUS_LABELS[params.status]}". ${params.notes ?? ''}`
        ).trim(),
      });
    }
    return serializeCase(doc.toObject(), shelter?.name);
  },

  async updateAnimal(shelterId: string, id: string, patch: { caseStatus?: AnimalStatus; postedPublicly?: boolean }) {
    const current = await ShelterAnimal.findOne({ _id: id, shelterId }, 'caseStatus caseId sourceReportKind').lean();
    if (!current) throw ApiError.notFound('Animal not found');
    const update: Record<string, unknown> = {};
    if (patch.caseStatus !== undefined && patch.caseStatus !== current.caseStatus) {
      if (!canChangeCaseStatus(current.caseStatus as CaseStatus, patch.caseStatus)) {
        throw ApiError.conflict(
          `This animal's status is "${CASE_STATUS_LABELS[current.caseStatus as CaseStatus]}" and can't be changed back.`,
        );
      }
      update.caseStatus = patch.caseStatus;
      // An adopted or inconclusive animal stops showing publicly.
      if (CLOSING_CASE_STATUSES.includes(patch.caseStatus)) update.postedPublicly = false;
    }
    if (patch.postedPublicly !== undefined && update.postedPublicly === undefined) update.postedPublicly = patch.postedPublicly;
    const animal = await ShelterAnimal.findOneAndUpdate({ _id: id, shelterId }, update, { new: true });
    if (!animal) throw ApiError.notFound('Animal not found');

    // An animal that came from a resident's report: its outcome is the case's outcome too, so the
    // case, the report and the person who filed it all follow.
    if (update.caseStatus && current.caseId) {
      const status = update.caseStatus as CaseStatus;
      const caseDoc = await AnimalCase.findOne({ _id: current.caseId, shelterId });
      if (caseDoc && caseDoc.status !== status) {
        const shelter = await Shelter.findById(shelterId, 'name').lean();
        const note = `${CASE_STATUS_LABELS[status]} - updated from Shelter Animals.`;
        caseDoc.status = status;
        caseDoc.history.push({ status, note, changedBy: shelterId as never, changedAt: new Date() });
        await caseDoc.save();
        const report = await reportForCase(caseDoc);
        if (report) {
          await applyOutcomeToReport(report, caseDoc.lostReportId ? 'lost' : 'found', status);
          await notify({
            audienceType: 'user',
            audienceId: report.reporterId,
            type: 'status_update',
            refId: report._id,
            title: 'Case status updated',
            body: `${shelter?.name ?? 'The shelter'} set the case to "${CASE_STATUS_LABELS[status]}".`,
          });
        }
      }
    }
    return serializeShelterAnimal(animal);
  },

  async getMe(shelterId: string) {
    const found = await Shelter.findById(shelterId).lean();
    if (!found) throw ApiError.notFound('Shelter not found');
    const [shelter] = await withLiveOccupancy([found]);
    return serializeShelter(shelter, { includePrivate: true });
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
      // currentOccupancy is not editable: it is counted from the shelter's animals.
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
    
    const updated = await Shelter.findByIdAndUpdate(shelterId, update, { new: true }).lean();
    if (!updated) return null;
    const [shelter] = await withLiveOccupancy([updated]);
    return serializeShelter(shelter, { includePrivate: true });
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

  async updatePushToken(shelterId: string, token: string) {
    const shelter = await Shelter.findByIdAndUpdate(shelterId, { expoPushToken: token }, { new: true });
    return shelter ? serializeShelter(shelter) : null;
  },
};
