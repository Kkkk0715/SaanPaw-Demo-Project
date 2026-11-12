import { AnimalCase } from '../models/AnimalCase';
import { Conversation } from '../models/Conversation';
import { FoundAnimalReport } from '../models/FoundAnimalReport';
import { LostPetReport } from '../models/LostPetReport';
import { Message } from '../models/Message';
import { MatchSuggestion } from '../models/MatchSuggestion';
import { ModerationFlag } from '../models/ModerationFlag';
import { Notification } from '../models/Notification';
import { Shelter } from '../models/Shelter';
import { ShelterAnimal } from '../models/ShelterAnimal';
import { ShelterProofDocument } from '../models/ShelterProofDocument';
import { User } from '../models/User';
import { deleteStoredPhoto } from './storage.service';
import { forgetPhoto } from './photoFingerprint.service';
import { notify } from './pushNotification.service';

/** Removes the stored file and its duplicate-check fingerprint together. */
const removePhoto = (url: string) => Promise.all([deleteStoredPhoto(url), forgetPhoto(url)]);

/**
 * A developer deleting an account, shelter, or report is a true delete, not a soft hide (that's
 * `isHiddenByModeration`, used by banning and flag resolution instead). Nothing in the schema
 * cascades on its own, so every reference into the deleted record is cleaned up here - otherwise
 * a stray `caseId`, `MatchSuggestion`, or uploaded photo blob outlives the thing it pointed to.
 */

async function deleteConversationsCascade(filter: Record<string, unknown>): Promise<void> {
  const conversations = await Conversation.find(filter, '_id').lean();
  const ids = conversations.map((c) => c._id);
  if (!ids.length) return;
  await Promise.all([Message.deleteMany({ conversationId: { $in: ids } }), Conversation.deleteMany({ _id: { $in: ids } })]);
}

export type DeletionReason = 'account_deleted' | 'report_deleted';

/** "November 12, 2026" on the Philippine calendar. */
const manilaDate = (d: Date) =>
  d.toLocaleDateString('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: 'long', day: 'numeric' });

/**
 * A shelter animal that came from a now-deleted report stays in the shelter's records, but nothing
 * of the reporter stays with it (RA 10173): the link to the report and case goes (that is how the
 * owner's name and number were shown), as does the reporter's description. One still in care is
 * now a stray (intake "rescued", so it can go up for adoption), gets a note saying what happened,
 * and the shelter is told. Its photos are kept - the caller must not delete them.
 */
async function detachShelterAnimalsFromReport(reportId: string, reason: DeletionReason) {
  const animals = await ShelterAnimal.find({ sourceReportId: reportId });
  if (!animals.length) return;
  const now = new Date();
  await Promise.all(
    animals.map(async (animal) => {
      const shelter = await Shelter.findById(animal.shelterId, 'name').lean();
      const shelterName = shelter?.name ?? 'the shelter';
      const inCare = animal.caseStatus === 'under_rescue';
      // A lost report was filed by the owner; a found report by whoever spotted the stray.
      const who = animal.sourceReportKind === 'lost' ? `The owner of ${animal.name}` : `The person who reported ${animal.name}`;
      const what = reason === 'account_deleted' ? 'deleted their account' : 'deleted their report';
      const note = inCare
        ? `The reporter ${what} on ${manilaDate(now)}. This animal is now a stray in ${shelterName}'s care.`
        : `The reporter ${what} on ${manilaDate(now)}. The link to their report and case was removed.`;

      animal.set({ notes: note, ownerRemovedAt: now, ownerRemovedReason: reason, ...(inCare ? { intakeType: 'rescued' } : {}) });
      animal.set('caseId', undefined);
      animal.set('sourceReportId', undefined);
      animal.set('sourceReportKind', undefined);
      animal.set('description', undefined);
      await animal.save();

      await notify({
        audienceType: 'shelter',
        audienceId: animal.shelterId,
        // No refId: for a shelter that would open it as a report. Tapping it opens Rescued Pets & Strays.
        type: 'status_update',
        title: reason === 'account_deleted' ? 'Owner account deleted' : 'Report deleted',
        body: inCare
          ? `${who} ${what}. ${animal.name} is now listed as a stray in your care.`
          : `${who} ${what}. Their details were removed from ${animal.name}'s record.`,
      });
    }),
  );
}

/**
 * Deletes one report and everything that referenced it. Returns the deleted doc, or null if it never existed.
 * A shelter animal made from it is kept and detached (see above), so photos it still uses are not deleted.
 */
export async function deleteReportCascade(kind: 'lost' | 'found', reportId: string, reason: DeletionReason = 'report_deleted') {
  const report =
    kind === 'lost'
      ? await LostPetReport.findByIdAndDelete(reportId).lean()
      : await FoundAnimalReport.findByIdAndDelete(reportId).lean();
  if (!report) return null;

  await detachShelterAnimalsFromReport(reportId, reason);
  const photos = (report as { imageUrls?: string[] }).imageUrls ?? [];
  const stillUsed = photos.length
    ? new Set((await ShelterAnimal.find({ imageUrls: { $in: photos } }, 'imageUrls').lean()).flatMap((a) => a.imageUrls))
    : new Set<string>();

  await Promise.all([
    ModerationFlag.deleteMany({ reportId }),
    kind === 'lost'
      ? MatchSuggestion.deleteMany({ lostReportId: reportId })
      : MatchSuggestion.deleteMany({ candidateId: reportId, candidateSource: 'found_report' }),
    AnimalCase.deleteMany(kind === 'lost' ? { lostReportId: reportId } : { foundReportId: reportId }),
    deleteConversationsCascade({ relatedReportId: reportId }),
    kind === 'lost'
      ? FoundAnimalReport.updateMany({ matchedLostReportId: reportId }, { $unset: { matchedLostReportId: 1 } })
      : LostPetReport.updateMany({ matchedFoundReportId: reportId }, { $unset: { matchedFoundReportId: 1 } }),
    ...photos.filter((url) => !stillUsed.has(url)).map((url) => removePhoto(url)),
  ]);

  return report;
}

/** Deletes a shelter account and everything it owns: animals, cases, conversations, notifications. */
export async function deleteShelterCascade(shelterId: string) {
  const shelter = await Shelter.findByIdAndDelete(shelterId).lean();
  if (!shelter) return null;

  const animals = await ShelterAnimal.find({ shelterId }, '_id imageUrls').lean();
  const cases = await AnimalCase.find({ shelterId }, '_id').lean();
  const caseIds = cases.map((c) => c._id);

  await Promise.all([
    ShelterAnimal.deleteMany({ shelterId }),
    AnimalCase.deleteMany({ shelterId }),
    deleteConversationsCascade({ shelterId }),
    Notification.deleteMany({ audienceType: 'shelter', audienceId: shelterId }),
    ShelterProofDocument.deleteMany({ shelterId }),
    ModerationFlag.deleteMany({ reportType: 'shelter_animal', reporterId: shelterId }),
    MatchSuggestion.deleteMany({ candidateId: { $in: animals.map((a) => a._id) }, candidateSource: 'shelter_animal' }),
    caseIds.length
      ? Promise.all([
          // A report this shelter was handling is open again for other shelters to take on.
          LostPetReport.updateMany(
            { caseId: { $in: caseIds } },
            [{ $set: { status: { $cond: [{ $eq: ['$status', 'matched'] }, 'active', '$status'] } } }, { $unset: 'caseId' }],
          ),
          FoundAnimalReport.updateMany(
            { caseId: { $in: caseIds } },
            [{ $set: { status: { $cond: [{ $eq: ['$status', 'matched'] }, 'active', '$status'] } } }, { $unset: 'caseId' }],
          ),
        ])
      : Promise.resolve(),
    ...animals.flatMap((a) => a.imageUrls.map((url) => removePhoto(url))),
    shelter.photoUrl ? deleteStoredPhoto(shelter.photoUrl) : Promise.resolve(),
  ]);

  return shelter;
}

/** Deletes a user account and everything it owns: their reports (cascaded the same way), conversations, notifications. */
export async function deleteUserCascade(userId: string) {
  const user = await User.findByIdAndDelete(userId).lean();
  if (!user) return null;

  const [lostReports, foundReports] = await Promise.all([
    LostPetReport.find({ reporterId: userId }, '_id').lean(),
    FoundAnimalReport.find({ reporterId: userId }, '_id').lean(),
  ]);

  await Promise.all([
    ...lostReports.map((r) => deleteReportCascade('lost', String(r._id), 'account_deleted')),
    ...foundReports.map((r) => deleteReportCascade('found', String(r._id), 'account_deleted')),
    deleteConversationsCascade({ userId }),
    Notification.deleteMany({ audienceType: 'user', audienceId: userId }),
    user.photoUrl ? deleteStoredPhoto(user.photoUrl) : Promise.resolve(),
  ]);

  return user;
}

/** Deletes one of a shelter's animal records, its photos, flags and the match suggestions pointing at it. */
export async function deleteShelterAnimalCascade(shelterId: string, animalId: string) {
  const animal = await ShelterAnimal.findOneAndDelete({ _id: animalId, shelterId }).lean();
  if (!animal) return null;
  await Promise.all([
    ModerationFlag.deleteMany({ reportType: 'shelter_animal', reportId: animalId }),
    MatchSuggestion.deleteMany({ candidateId: animalId, candidateSource: 'shelter_animal' }),
    ...animal.imageUrls.map((url) => removePhoto(url)),
  ]);
  return animal;
}
