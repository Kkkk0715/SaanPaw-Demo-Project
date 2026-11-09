import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { env } from '../../config/env';
import { Shelter } from '../../models/Shelter';
import { User } from '../../models/User';
import { LostPetReport } from '../../models/LostPetReport';
import { FoundAnimalReport } from '../../models/FoundAnimalReport';
import { ShelterAnimal } from '../../models/ShelterAnimal';
import { ModerationFlag } from '../../models/ModerationFlag';
import { ShelterProofDocument } from '../../models/ShelterProofDocument';
import { DeveloperAccount } from '../../models/DeveloperAccount';
import { AnimalCase } from '../../models/AnimalCase';
import { Notification } from '../../models/Notification';
import { Message } from '../../models/Message';
import { Conversation } from '../../models/Conversation';
import { moderationService } from '../../services/moderation.service';
import { withLiveOccupancy } from '../../services/occupancy.service';
import { deleteReportCascade, deleteShelterCascade, deleteUserCascade } from '../../services/cascadeDelete.service';
import {
  accountActionEmail,
  retryQueuedEmails,
  sendEmail,
  shelterCredentialsEmail,
  type EmailResult,
} from '../../services/email.service';
import { statsService } from '../../services/stats.service';
import { getSystemConfig, updateSystemConfig, type SystemConfigValue } from '../../services/systemConfig.service';
import { ApiError } from '../../utils/ApiError';
import { generateTemporaryPassword } from '../../utils/password';
import {
  combineName,
  serializeFlag,
  serializeFoundReport,
  serializeLostReport,
  serializeShelter,
  serializeShelterAnimal,
  serializeUser,
} from '../../utils/geoHelpers';

const OVERVIEW_LIMIT = 500;


/** Facts about the running instance, computed fresh on every call - never stored. */
function deploymentInfo() {
  return {
    environment: env.nodeEnv,
    databaseConnected: mongoose.connection.readyState === 1,
    uptimeSeconds: Math.round(process.uptime()),
    nodeVersion: process.version,
  };
}

/**
 * Real document totals for System Management's "Database monitoring" panel, counted in the
 * database itself. The panel used to count only what the console had loaded, so collections it
 * never loads (cases, notifications, messages) always read 0, and capped lists read low.
 */
async function collectionCounts() {
  const [lost, found, users, shelters, shelterAnimals, animalCases, flags, notifications, conversations, messages] =
    await Promise.all([
      LostPetReport.estimatedDocumentCount(),
      FoundAnimalReport.estimatedDocumentCount(),
      User.estimatedDocumentCount(),
      Shelter.estimatedDocumentCount(),
      ShelterAnimal.estimatedDocumentCount(),
      AnimalCase.estimatedDocumentCount(),
      ModerationFlag.estimatedDocumentCount(),
      Notification.estimatedDocumentCount(),
      Conversation.estimatedDocumentCount(),
      Message.estimatedDocumentCount(),
    ]);
  return [
    { name: 'reports', count: lost + found, detail: `${lost} lost · ${found} found` },
    { name: 'users', count: users },
    { name: 'shelters', count: shelters },
    { name: 'shelterAnimals', count: shelterAnimals },
    { name: 'animalCases', count: animalCases },
    { name: 'moderationFlags', count: flags },
    { name: 'notifications', count: notifications },
    { name: 'conversations', count: conversations },
    { name: 'messages', count: messages },
  ];
}

export const developerService = {
  /** The signed-in Developer's own account, so the console shows the email they signed in with. */
  async me(developerId: string) {
    const acct = await DeveloperAccount.findById(developerId).select('email').lean();
    if (!acct) throw ApiError.notFound('Developer account not found');
    return { email: acct.email };
  },

  /** Dashboard: daily lost/found stats + pending queues. */
  async getDashboard() {
    const [stats, pendingShelters, openFlags] = await Promise.all([
      statsService.platformStats(),
      Shelter.countDocuments({ approvalStatus: 'pending' }),
      ModerationFlag.countDocuments({ status: 'open' }),
    ]);
    return { ...stats, pendingShelters, openFlags };
  },

  /** Everything the console renders, in the shapes the shared types describe. */
  async overview() {
    // Emails that failed earlier (Gmail hiccup) are retried whenever the console loads - bounded,
    // so a still-unreachable mail server never holds the console up for long.
    await Promise.race([retryQueuedEmails(3), new Promise((resolve) => setTimeout(resolve, 4000))]);
    const [stats, shelters, users, lost, found, shelterAnimals, flags, systemConfig, collections] = await Promise.all([
      statsService.platformStats(),
      Shelter.find().sort({ registeredAt: -1 }).lean(),
      User.find().sort({ joinedAt: -1 }).limit(OVERVIEW_LIMIT).lean(),
      // Removed reports stay out of the console, matching what "Remove" promises.
      LostPetReport.find({ isHiddenByModeration: false }).sort({ reportedAt: -1 }).limit(OVERVIEW_LIMIT).lean(),
      FoundAnimalReport.find({ isHiddenByModeration: false }).sort({ reportedAt: -1 }).limit(OVERVIEW_LIMIT).lean(),
      ShelterAnimal.find({ isHiddenByModeration: false }).sort({ intakeDate: -1 }).limit(OVERVIEW_LIMIT).lean(),
      ModerationFlag.find().sort({ createdAt: -1 }).limit(OVERVIEW_LIMIT).lean(),
      getSystemConfig(),
      collectionCounts(),
    ]);

    const counted = await withLiveOccupancy(shelters);
    const userById = new Map(users.map((u) => [String(u._id), u]));
    const shelterById = new Map(shelters.map((s) => [String(s._id), s]));
    return {
      stats,
      shelters: counted.map((sh) => serializeShelter(sh, { includePrivate: true })),
      users: users.map(serializeUser),
      reports: [...lost.map(serializeLostReport), ...found.map(serializeFoundReport)],
      shelterAnimals: shelterAnimals.map(serializeShelterAnimal),
      flags: flags.map((f) => {
        if (f.reportType === 'shelter_animal') {
          const shelter = shelterById.get(String(f.reporterId));
          return serializeFlag(f, shelter ? shelter.name : 'Unknown shelter', false);
        }
        const reporter = userById.get(String(f.reporterId));
        return serializeFlag(f, reporter ? combineName(reporter) : 'Unknown user', Boolean(reporter?.isBanned));
      }),
      systemConfig,
      deployment: deploymentInfo(),
      collections,
    };
  },

  // ----- Shelter Approval Management -----
  async listPendingShelters() {
    const shelters = await Shelter.find({ approvalStatus: 'pending' }).sort({ createdAt: 1 }).lean();
    return shelters.map((sh) => serializeShelter(sh, { includePrivate: true }));
  },

  /**
   * Approving issues the shelter's login. When the developer does not pick credentials,
   * the shelter's contact email is used and a one-time password is generated and returned.
   */
  async reviewShelter(params: {
    shelterId: string;
    developerId: string;
    decision: 'approve' | 'reject';
    reason?: string;
    adminEmail?: string;
    temporaryPassword?: string;
  }) {
    const shelter = await Shelter.findById(params.shelterId);
    if (!shelter) throw ApiError.notFound('Shelter not found');

    if (params.decision === 'reject') {
      // Rejecting a pending application, or revoking an approved shelter's access.
      const wasApproved = shelter.approvalStatus === 'approved';
      shelter.approvalStatus = 'rejected';
      shelter.rejectionReason = params.reason;
      await shelter.save();
      const to = shelter.adminEmail || shelter.email;
      const email: EmailResult = to
        ? await sendEmail(
            accountActionEmail({
              action: wasApproved ? 'shelter_revoked' : 'shelter_rejected',
              name: shelter.name,
              email: to,
              reason: params.reason,
            }),
          )
        : { sent: false, queued: false };
      return { shelter: serializeShelter(shelter, { includePrivate: true }), email };
    }

    const adminEmail = (params.adminEmail ?? shelter.email)?.toLowerCase().trim();
    if (!adminEmail) {
      throw ApiError.badRequest('adminEmail is required: this shelter has no contact email on file');
    }
    const generated = params.temporaryPassword ? undefined : generateTemporaryPassword();
    const password = params.temporaryPassword ?? generated!;

    shelter.approvalStatus = 'approved';
    shelter.approvedBy = params.developerId as never;
    shelter.adminEmail = adminEmail;
    shelter.adminPasswordHash = await bcrypt.hash(password, 10);
    await shelter.save();

    // Best-effort: the developer console still shows the password either way, so a failed or
    // unconfigured send (see email.service.ts) never blocks the approval itself.
    const { sent } = await sendEmail(shelterCredentialsEmail({ shelterName: shelter.name, email: adminEmail, password }));

    return { shelter: serializeShelter(shelter, { includePrivate: true }), adminEmail, temporaryPassword: generated, emailSent: sent };
  },

  /** The proof of credentials a shelter submitted with its application (metadata only). */
  async listShelterProofs(shelterId: string) {
    const docs = await ShelterProofDocument.find({ shelterId }, 'filename contentType size createdAt')
      .sort({ createdAt: 1 })
      .lean();
    return docs.map((d) => ({
      id: String(d._id),
      filename: d.filename,
      contentType: d.contentType,
      size: d.size,
      uploadedAt: d.createdAt?.toISOString?.(),
    }));
  },

  /**
   * The file itself - only ever served to a signed-in Developer. Deliberately not `.lean()`: a lean
   * read returns the bytes as a raw BSON Binary rather than a Buffer, which `res.end` rejects
   * (that was the "Could not open the document (500)" in the console). A full document gives a Buffer,
   * the same way stored photos are read in storage.service.ts.
   */
  async getProofDocument(id: string) {
    if (!mongoose.isValidObjectId(id)) throw ApiError.notFound('Document not found');
    const doc = await ShelterProofDocument.findById(id);
    if (!doc || !doc.shelterId) throw ApiError.notFound('Document not found');
    return {
      filename: doc.filename,
      contentType: doc.contentType,
      data: Buffer.from(doc.data as unknown as Uint8Array),
    };
  },

  // ----- System Management -----
  async systemConfig() {
    return { config: await getSystemConfig(), deployment: deploymentInfo() };
  },

  async updateSystemConfig(patch: Partial<SystemConfigValue>) {
    return { config: await updateSystemConfig(patch) };
  },

  // ----- Report Monitoring -----
  async listFlags(status: 'open' | 'dismissed' | 'actioned' = 'open') {
    const flags = await ModerationFlag.find({ status }).sort({ createdAt: -1 }).lean();
    const userIds = flags.filter((f) => f.reportType !== 'shelter_animal').map((f) => f.reporterId);
    const shelterIds = flags.filter((f) => f.reportType === 'shelter_animal').map((f) => f.reporterId);
    const [users, shelters] = await Promise.all([
      User.find({ _id: { $in: userIds } }).lean(),
      Shelter.find({ _id: { $in: shelterIds } }).lean(),
    ]);
    const userById = new Map(users.map((u) => [String(u._id), u]));
    const shelterById = new Map(shelters.map((s) => [String(s._id), s]));
    return flags.map((f) => {
      if (f.reportType === 'shelter_animal') {
        const shelter = shelterById.get(String(f.reporterId));
        return serializeFlag(f, shelter ? shelter.name : 'Unknown shelter', false);
      }
      const reporter = userById.get(String(f.reporterId));
      return serializeFlag(f, reporter ? combineName(reporter) : 'Unknown user', Boolean(reporter?.isBanned));
    });
  },

  async resolveFlag(params: {
    flagId: string;
    developerId: string;
    action: 'dismiss' | 'remove_report';
    note?: string;
  }) {
    const flag = await ModerationFlag.findById(params.flagId);
    if (!flag) throw ApiError.notFound('Flag not found');
    if (flag.status !== 'open') throw ApiError.conflict('This flag has already been resolved');
    if (params.action !== 'dismiss' && params.action !== 'remove_report') {
      throw ApiError.badRequest('action must be "dismiss" or "remove_report"');
    }

    const isShelterFlag = flag.reportType === 'shelter_animal';

    if (params.action === 'dismiss') {
      flag.status = 'dismissed';
    } else {
      flag.status = 'actioned';
      if (flag.reportType === 'lost') {
        await LostPetReport.findByIdAndUpdate(flag.reportId, { isHiddenByModeration: true });
      } else if (flag.reportType === 'found') {
        await FoundAnimalReport.findByIdAndUpdate(flag.reportId, { isHiddenByModeration: true });
      } else {
        await ShelterAnimal.findByIdAndUpdate(flag.reportId, { isHiddenByModeration: true, postedPublicly: false });
      }
    }
    flag.resolvedBy = params.developerId as never;
    flag.resolutionNote = params.note;
    await flag.save();

    // An upheld flag counts against the reporter; enough of them ban the account. A shelter has
    // no equivalent ban - access is revoked by hand via Manage Shelters, a heavier, human decision.
    if (params.action === 'remove_report' && !isShelterFlag) {
      await User.findByIdAndUpdate(flag.reporterId, { $inc: { flaggedReportCount: 1 } });
    }
    const escalation =
      params.action === 'remove_report' && !isShelterFlag
        ? await moderationService.escalateReporter(String(flag.reporterId))
        : { banned: false, deleted: false, upheldFlags: 0 };

    let reporterName = 'Unknown shelter';
    let reporterBanned = escalation.banned;
    if (isShelterFlag) {
      const shelter = await Shelter.findById(flag.reporterId, 'name').lean();
      if (shelter) reporterName = shelter.name;
    } else {
      const reporter = await User.findById(flag.reporterId).lean();
      reporterName = reporter ? combineName(reporter) : escalation.banned ? 'Deleted account' : 'Unknown user';
      reporterBanned = reporterBanned || Boolean(reporter?.isBanned);
    }
    return {
      flag: serializeFlag(flag.toObject(), reporterName, reporterBanned),
      escalation,
    };
  },

  /** Manual ban: locks the account, hides everything the user reported, and emails them why. */
  async banUser(userId: string, reason?: string) {
    const user = await User.findByIdAndUpdate(userId, { isBanned: true }, { new: true });
    if (!user) throw ApiError.notFound('User not found');
    await Promise.all([
      LostPetReport.updateMany({ reporterId: userId }, { isHiddenByModeration: true }),
      FoundAnimalReport.updateMany({ reporterId: userId }, { isHiddenByModeration: true }),
    ]);
    const emailResult = await sendEmail(
      accountActionEmail({ action: 'user_banned', name: combineName(user), email: user.email, reason }),
    );
    // Not "email": the user record already has an email field (their address).
    return { ...serializeUser(user), emailResult };
  },

  // ----- Account & Report Deletion -----
  // A true delete, unlike banning or flag resolution (both soft hides) - see cascadeDelete.service.ts.
  // The email goes out first, while the address is still on file: sendEmail retries and, failing
  // that, keeps the message in the outbox to retry, so the deletion never leaves someone untold.
  async deleteShelter(shelterId: string, reason?: string) {
    const existing = await Shelter.findById(shelterId, 'name email adminEmail').lean();
    if (!existing) throw ApiError.notFound('Shelter not found');
    const to = existing.adminEmail || existing.email;
    const email: EmailResult = to
      ? await sendEmail(accountActionEmail({ action: 'shelter_deleted', name: existing.name, email: to, reason }))
      : { sent: false, queued: false };
    const shelter = await deleteShelterCascade(shelterId);
    if (!shelter) throw ApiError.notFound('Shelter not found');
    return { id: shelterId, email, emailedTo: to ?? null };
  },

  async deleteUser(userId: string, reason?: string) {
    const existing = await User.findById(userId, 'firstName middleName lastName email').lean();
    if (!existing) throw ApiError.notFound('User not found');
    const email = await sendEmail(
      accountActionEmail({ action: 'user_deleted', name: combineName(existing), email: existing.email, reason }),
    );
    const user = await deleteUserCascade(userId);
    if (!user) throw ApiError.notFound('User not found');
    return { id: userId, email, emailedTo: existing.email };
  },

  async deleteReport(kind: 'lost' | 'found', reportId: string) {
    const report = await deleteReportCascade(kind, reportId);
    if (!report) throw ApiError.notFound('Report not found');
    return { id: reportId };
  },
};
