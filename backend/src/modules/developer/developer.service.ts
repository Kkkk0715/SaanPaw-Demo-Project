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
import { moderationService } from '../../services/moderation.service';
import { deleteReportCascade, deleteShelterCascade, deleteUserCascade } from '../../services/cascadeDelete.service';
import { sendEmail, shelterCredentialsEmail } from '../../services/email.service';
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

export const developerService = {
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
    const [stats, shelters, users, lost, found, shelterAnimals, flags, systemConfig] = await Promise.all([
      statsService.platformStats(),
      Shelter.find().sort({ registeredAt: -1 }).lean(),
      User.find().sort({ joinedAt: -1 }).limit(OVERVIEW_LIMIT).lean(),
      // Removed reports stay out of the console, matching what "Remove" promises.
      LostPetReport.find({ isHiddenByModeration: false }).sort({ reportedAt: -1 }).limit(OVERVIEW_LIMIT).lean(),
      FoundAnimalReport.find({ isHiddenByModeration: false }).sort({ reportedAt: -1 }).limit(OVERVIEW_LIMIT).lean(),
      ShelterAnimal.find({ isHiddenByModeration: false }).sort({ intakeDate: -1 }).limit(OVERVIEW_LIMIT).lean(),
      ModerationFlag.find().sort({ createdAt: -1 }).limit(OVERVIEW_LIMIT).lean(),
      getSystemConfig(),
    ]);

    const userById = new Map(users.map((u) => [String(u._id), u]));
    const shelterById = new Map(shelters.map((s) => [String(s._id), s]));
    return {
      stats,
      shelters: shelters.map((sh) => serializeShelter(sh, { includePrivate: true })),
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
      shelter.approvalStatus = 'rejected';
      shelter.rejectionReason = params.reason;
      await shelter.save();
      return { shelter: serializeShelter(shelter, { includePrivate: true }) };
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

  /** The file itself - only ever served to a signed-in Developer. */
  async getProofDocument(id: string) {
    const doc = await ShelterProofDocument.findById(id).lean();
    if (!doc || !doc.shelterId) throw ApiError.notFound('Document not found');
    return doc;
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

  /** Manual ban: locks the account and hides everything the user reported. */
  async banUser(userId: string) {
    const user = await User.findByIdAndUpdate(userId, { isBanned: true }, { new: true });
    if (!user) throw ApiError.notFound('User not found');
    await Promise.all([
      LostPetReport.updateMany({ reporterId: userId }, { isHiddenByModeration: true }),
      FoundAnimalReport.updateMany({ reporterId: userId }, { isHiddenByModeration: true }),
    ]);
    return serializeUser(user);
  },

  // ----- Account & Report Deletion -----
  // A true delete, unlike banning or flag resolution (both soft hides) - see cascadeDelete.service.ts.
  async deleteShelter(shelterId: string) {
    const shelter = await deleteShelterCascade(shelterId);
    if (!shelter) throw ApiError.notFound('Shelter not found');
    return { id: shelterId };
  },

  async deleteUser(userId: string) {
    const user = await deleteUserCascade(userId);
    if (!user) throw ApiError.notFound('User not found');
    return { id: userId };
  },

  async deleteReport(kind: 'lost' | 'found', reportId: string) {
    const report = await deleteReportCascade(kind, reportId);
    if (!report) throw ApiError.notFound('Report not found');
    return { id: reportId };
  },
};
