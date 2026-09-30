import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Shelter } from '../../models/Shelter';
import { User } from '../../models/User';
import { LostPetReport } from '../../models/LostPetReport';
import { FoundAnimalReport } from '../../models/FoundAnimalReport';
import { ModerationFlag } from '../../models/ModerationFlag';
import { moderationService } from '../../services/moderation.service';
import { sendEmail, shelterCredentialsEmail } from '../../services/email.service';
import { statsService } from '../../services/stats.service';
import { ApiError } from '../../utils/ApiError';
import {
  combineName,
  serializeFlag,
  serializeFoundReport,
  serializeLostReport,
  serializeShelter,
  serializeUser,
} from '../../utils/geoHelpers';

const OVERVIEW_LIMIT = 500;

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
    const [stats, shelters, users, lost, found, flags] = await Promise.all([
      statsService.platformStats(),
      Shelter.find().sort({ registeredAt: -1 }).lean(),
      User.find().sort({ joinedAt: -1 }).limit(OVERVIEW_LIMIT).lean(),
      // Removed reports stay out of the console, matching what "Remove" promises.
      LostPetReport.find({ isHiddenByModeration: false }).sort({ reportedAt: -1 }).limit(OVERVIEW_LIMIT).lean(),
      FoundAnimalReport.find({ isHiddenByModeration: false }).sort({ reportedAt: -1 }).limit(OVERVIEW_LIMIT).lean(),
      ModerationFlag.find().sort({ createdAt: -1 }).limit(OVERVIEW_LIMIT).lean(),
    ]);

    const userById = new Map(users.map((u) => [String(u._id), u]));
    return {
      stats,
      shelters: shelters.map(serializeShelter),
      users: users.map(serializeUser),
      reports: [...lost.map(serializeLostReport), ...found.map(serializeFoundReport)],
      flags: flags.map((f) => {
        const reporter = userById.get(String(f.reporterId));
        return serializeFlag(f, reporter ? combineName(reporter) : 'Unknown user', Boolean(reporter?.isBanned));
      }),
    };
  },

  // ----- Shelter Approval Management -----
  async listPendingShelters() {
    const shelters = await Shelter.find({ approvalStatus: 'pending' }).sort({ createdAt: 1 }).lean();
    return shelters.map(serializeShelter);
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
      return { shelter: serializeShelter(shelter) };
    }

    const adminEmail = (params.adminEmail ?? shelter.email)?.toLowerCase().trim();
    if (!adminEmail) {
      throw ApiError.badRequest('adminEmail is required: this shelter has no contact email on file');
    }
    const generated = params.temporaryPassword ? undefined : crypto.randomBytes(6).toString('base64url');
    const password = params.temporaryPassword ?? generated!;

    shelter.approvalStatus = 'approved';
    shelter.approvedBy = params.developerId as never;
    shelter.adminEmail = adminEmail;
    shelter.adminPasswordHash = await bcrypt.hash(password, 10);
    await shelter.save();

    // Best-effort: the developer console still shows the password either way, so a failed or
    // unconfigured send (see email.service.ts) never blocks the approval itself.
    const { sent } = await sendEmail(shelterCredentialsEmail({ shelterName: shelter.name, email: adminEmail, password }));

    return { shelter: serializeShelter(shelter), adminEmail, temporaryPassword: generated, emailSent: sent };
  },

  // ----- System Management -----
  async systemConfig() {
    // TODO: surface real config (feature flags, DB health, build version, deploy state).
    return {
      build: process.env.npm_package_version ?? '0.1.0',
      node: process.version,
      uptimeSeconds: Math.round(process.uptime()),
    };
  },

  // ----- Report Monitoring -----
  async listFlags(status: 'open' | 'dismissed' | 'actioned' = 'open') {
    const flags = await ModerationFlag.find({ status }).sort({ createdAt: -1 }).lean();
    const users = await User.find({ _id: { $in: flags.map((f) => f.reporterId) } }).lean();
    const userById = new Map(users.map((u) => [String(u._id), u]));
    return flags.map((f) => {
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

    if (params.action === 'dismiss') {
      flag.status = 'dismissed';
    } else {
      flag.status = 'actioned';
      if (flag.reportType === 'lost') {
        await LostPetReport.findByIdAndUpdate(flag.reportId, { isHiddenByModeration: true });
      } else {
        await FoundAnimalReport.findByIdAndUpdate(flag.reportId, { isHiddenByModeration: true });
      }
    }
    flag.resolvedBy = params.developerId as never;
    flag.resolutionNote = params.note;
    await flag.save();

    // An upheld flag counts against the reporter; enough of them ban the account.
    if (params.action === 'remove_report') {
      await User.findByIdAndUpdate(flag.reporterId, { $inc: { flaggedReportCount: 1 } });
    }
    const escalation =
      params.action === 'remove_report'
        ? await moderationService.escalateReporter(String(flag.reporterId))
        : { banned: false };

    const reporter = await User.findById(flag.reporterId).lean();
    return {
      flag: serializeFlag(flag.toObject(), reporter ? combineName(reporter) : 'Unknown user', Boolean(reporter?.isBanned)),
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
};
