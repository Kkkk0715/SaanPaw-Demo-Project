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
import { User } from '../models/User';
import { deleteStoredPhoto } from './storage.service';

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

/** Deletes one report and everything that referenced it. Returns the deleted doc, or null if it never existed. */
export async function deleteReportCascade(kind: 'lost' | 'found', reportId: string) {
  const report =
    kind === 'lost'
      ? await LostPetReport.findByIdAndDelete(reportId).lean()
      : await FoundAnimalReport.findByIdAndDelete(reportId).lean();
  if (!report) return null;

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
    ...((report as { imageUrls?: string[] }).imageUrls ?? []).map((url) => deleteStoredPhoto(url)),
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
    caseIds.length
      ? Promise.all([
          LostPetReport.updateMany({ caseId: { $in: caseIds } }, { $unset: { caseId: 1 } }),
          FoundAnimalReport.updateMany({ caseId: { $in: caseIds } }, { $unset: { caseId: 1 } }),
        ])
      : Promise.resolve(),
    ...animals.flatMap((a) => a.imageUrls.map((url) => deleteStoredPhoto(url))),
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
    ...lostReports.map((r) => deleteReportCascade('lost', String(r._id))),
    ...foundReports.map((r) => deleteReportCascade('found', String(r._id))),
    deleteConversationsCascade({ userId }),
    Notification.deleteMany({ audienceType: 'user', audienceId: userId }),
    user.photoUrl ? deleteStoredPhoto(user.photoUrl) : Promise.resolve(),
  ]);

  return user;
}
