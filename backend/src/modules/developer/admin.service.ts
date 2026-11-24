import bcrypt from 'bcryptjs';
import zlib from 'zlib';
import mongoose from 'mongoose';
import { env } from '../../config/env';
import { DeveloperAccount } from '../../models/DeveloperAccount';
import { User } from '../../models/User';
import { Shelter } from '../../models/Shelter';
import { LostPetReport } from '../../models/LostPetReport';
import { FoundAnimalReport } from '../../models/FoundAnimalReport';
import { AnimalCase } from '../../models/AnimalCase';
import { Release } from '../../models/Release';
import { ConfigSnapshot } from '../../models/ConfigSnapshot';
import { Backup, BackupChunk } from '../../models/Backup';
import { getSystemConfig, updateSystemConfig, type SystemConfigValue } from '../../services/systemConfig.service';
import { sendEmail, type EmailMessage } from '../../services/email.service';
import { authService } from '../auth/auth.service';
import { ApiError } from '../../utils/ApiError';
import { generateTemporaryPassword } from '../../utils/password';
import { combineName, serializeFoundReport, serializeLostReport } from '../../utils/geoHelpers';
import { logger } from '../../utils/logger';
import { assertNotGuestAccount } from '../../services/guestReporter.service';

const TZ = 'Asia/Manila';
const escapeRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const manilaDay = (iso: string, endOfDay = false) => new Date(`${iso}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}+08:00`);

async function adminEmail(developerId: string) {
  const a = await DeveloperAccount.findById(developerId, 'email name').lean();
  return { email: a?.email ?? 'unknown', name: a?.name || a?.email || 'SaanPaw admin' };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function simpleEmail(to: string, subject: string, lines: string[]): EmailMessage {
  return {
    to,
    subject,
    text: `${lines.join('\n\n')}\n\n- SaanPaw, San Jose Del Monte, Bulacan`,
    html: `${lines.map((l) => `<p>${esc(l)}</p>`).join('')}<p>- SaanPaw, San Jose Del Monte, Bulacan</p>`,
  };
}

// =====================================================================================
// Analytics with a date range
// =====================================================================================

type Interval = 'day' | 'week' | 'month';
const FORMAT: Record<Interval, string> = { day: '%Y-%m-%d', week: '%G-W%V', month: '%Y-%m' };

async function countBy(model: any, dateField: string, from: Date, to: Date, interval: Interval, extra: Record<string, unknown> = {}) {
  const rows: { _id: string; n: number }[] = await model.aggregate([
    { $match: { [dateField]: { $gte: from, $lte: to }, ...extra } },
    { $group: { _id: { $dateToString: { format: FORMAT[interval], date: `$${dateField}`, timezone: TZ } }, n: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [r._id, r.n]));
}

/** Every bucket label between from and to, so the chart has no gaps on quiet days. */
function buckets(from: Date, to: Date, interval: Interval): string[] {
  const out: string[] = [];
  const fmt = (d: Date) => {
    const local = new Date(d.getTime() + 8 * 3600_000);
    if (interval === 'month') return local.toISOString().slice(0, 7);
    if (interval === 'day') return local.toISOString().slice(0, 10);
    // ISO week label, matching Mongo's %G-W%V.
    const t = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
    return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  };
  const step = interval === 'day' ? 1 : interval === 'week' ? 7 : 28;
  for (let d = new Date(from); d <= to; d = new Date(d.getTime() + step * 86_400_000)) {
    const label = fmt(d);
    if (out[out.length - 1] !== label) out.push(label);
  }
  const last = fmt(to);
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

export async function analytics(q: { from?: string; to?: string; interval?: Interval }) {
  const to = q.to ? manilaDay(q.to, true) : new Date();
  const from = q.from ? manilaDay(q.from) : new Date(to.getTime() - 29 * 86_400_000);
  if (from > to) throw ApiError.badRequest('The start date must be before the end date.');
  const days = (to.getTime() - from.getTime()) / 86_400_000;
  if (days > 732) throw ApiError.badRequest('Pick a range of two years or less.');
  const interval: Interval = q.interval ?? (days > 120 ? 'month' : days > 45 ? 'week' : 'day');

  const range = { $gte: from, $lte: to };
  const [users, shelters, lost, found, recovered, totalUsers, totalShelters, approvedShelters, bannedUsers] = await Promise.all([
    countBy(User, 'joinedAt', from, to, interval, { isGuest: { $ne: true } }),
    countBy(Shelter, 'registeredAt', from, to, interval),
    countBy(LostPetReport, 'reportedAt', from, to, interval),
    countBy(FoundAnimalReport, 'reportedAt', from, to, interval),
    countBy(AnimalCase, 'updatedAt', from, to, interval, { status: { $in: ['recovered', 'reunited', 'adopted'] } }),
    User.countDocuments({ isGuest: { $ne: true } }),
    Shelter.countDocuments(),
    Shelter.countDocuments({ approvalStatus: 'approved' }),
    User.countDocuments({ isBanned: true }),
  ]);
  const [newUsers, newShelters, lostInRange, foundInRange, byType, byBarangay] = await Promise.all([
    User.countDocuments({ joinedAt: range, isGuest: { $ne: true } }),
    Shelter.countDocuments({ registeredAt: range }),
    LostPetReport.countDocuments({ reportedAt: range }),
    FoundAnimalReport.countDocuments({ reportedAt: range }),
    Promise.all([
      LostPetReport.aggregate([{ $match: { reportedAt: range } }, { $group: { _id: '$animalType', n: { $sum: 1 } } }]),
      FoundAnimalReport.aggregate([{ $match: { reportedAt: range } }, { $group: { _id: '$animalType', n: { $sum: 1 } } }]),
    ]),
    Promise.all([
      LostPetReport.aggregate([{ $match: { reportedAt: range } }, { $group: { _id: '$barangay', n: { $sum: 1 } } }]),
      FoundAnimalReport.aggregate([{ $match: { reportedAt: range } }, { $group: { _id: '$barangay', n: { $sum: 1 } } }]),
    ]),
  ]);
  const merge = (lists: { _id: string; n: number }[][]) => {
    const m = new Map<string, number>();
    for (const list of lists) for (const r of list) m.set(r._id ?? 'unknown', (m.get(r._id ?? 'unknown') ?? 0) + r.n);
    return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  };

  // Users at the end of each bucket (cumulative), for the "number of users" line.
  const usersBefore = await User.countDocuments({ joinedAt: { $lt: from }, isGuest: { $ne: true } });
  let running = usersBefore;
  const series = buckets(from, to, interval).map((label) => {
    running += users.get(label) ?? 0;
    return {
      label,
      newUsers: users.get(label) ?? 0,
      totalUsers: running,
      newShelters: shelters.get(label) ?? 0,
      lost: lost.get(label) ?? 0,
      found: found.get(label) ?? 0,
      recovered: recovered.get(label) ?? 0,
    };
  });

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    interval,
    totals: { users: totalUsers, bannedUsers, shelters: totalShelters, approvedShelters },
    inRange: {
      newUsers,
      newShelters,
      lost: lostInRange,
      found: foundInRange,
      recovered: series.reduce((n, s) => n + s.recovered, 0),
    },
    series,
    byAnimalType: merge(byType as never),
    topBarangays: merge(byBarangay as never).slice(0, 8),
  };
}

// =====================================================================================
// Admin accounts
// =====================================================================================

const serializeAdmin = (a: any, selfId?: string) => ({
  id: String(a._id),
  email: a.email,
  name: a.name ?? '',
  disabled: Boolean(a.disabled),
  createdAt: a.createdAt?.toISOString?.(),
  lastLoginAt: a.lastLoginAt?.toISOString?.(),
  createdByEmail: a.createdByEmail,
  isYou: selfId ? String(a._id) === selfId : false,
});

export async function listAdmins(selfId: string) {
  const list = await DeveloperAccount.find({}, '-passwordHash -resetCodeHash -resetTokenHash').sort({ createdAt: 1 }).lean();
  return list.map((a) => serializeAdmin(a, selfId));
}

/** Adds an admin and emails them a one-time password; they change it with "Forgot password". */
export async function addAdmin(selfId: string, input: { email: string; name: string }) {
  if (await DeveloperAccount.exists({ email: input.email })) throw ApiError.conflict('That email is already an admin.');
  const me = await adminEmail(selfId);
  const temporary = generateTemporaryPassword();
  const acct = await DeveloperAccount.create({
    email: input.email,
    name: input.name,
    passwordHash: await bcrypt.hash(temporary, 10),
    createdByEmail: me.email,
  });
  const email = await sendEmail(
    simpleEmail(input.email, 'You are now a SaanPaw administrator', [
      `Hi ${input.name},`,
      `${me.name} added you as an administrator of the SaanPaw Developer Console.`,
      `Sign in with your email (${input.email}) and this one-time password: ${temporary}`,
      'Then set your own password: on the sign-in page choose "Forgot password" and follow the code sent to this address.',
    ]),
  );
  return { admin: serializeAdmin(acct.toObject(), selfId), email };
}

/** Turns an admin's access off or back on. Never yourself, and never the last active admin. */
export async function setAdminDisabled(selfId: string, id: string, disabled: boolean) {
  if (id === selfId && disabled) throw ApiError.badRequest('You cannot turn off your own access.');
  if (disabled && (await DeveloperAccount.countDocuments({ disabled: { $ne: true }, _id: { $ne: id } })) === 0) {
    throw ApiError.badRequest('At least one admin must keep access.');
  }
  const acct = await DeveloperAccount.findByIdAndUpdate(id, { disabled }, { new: true }).lean();
  if (!acct) throw ApiError.notFound('Admin not found');
  return serializeAdmin(acct, selfId);
}

// =====================================================================================
// Recover account (users and shelters)
// =====================================================================================

/**
 * Gets someone back into their account: lifts a ban (and shows their reports again), or restores
 * a revoked/rejected shelter, and - when asked - emails them a password-reset code.
 */
export async function recoverUser(id: string, opts: { sendReset: boolean; note?: string }) {
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User not found');
  assertNotGuestAccount(user);
  const wasBanned = user.isBanned;
  if (wasBanned) {
    user.isBanned = false;
    user.flaggedReportCount = 0;
    await user.save();
    await Promise.all([
      LostPetReport.updateMany({ reporterId: id, moderationFlagId: { $exists: false } }, { isHiddenByModeration: false }),
      FoundAnimalReport.updateMany({ reporterId: id, moderationFlagId: { $exists: false } }, { isHiddenByModeration: false }),
    ]);
  }
  await sendEmail(
    simpleEmail(user.email, 'Your SaanPaw account has been recovered', [
      `Hi ${combineName(user)},`,
      wasBanned ? 'Your SaanPaw account has been restored. You can sign in again.' : 'A SaanPaw administrator helped recover your account.',
      ...(opts.note ? [`Note from the team: ${opts.note}`] : []),
      ...(opts.sendReset ? ['We are also sending you a separate email with a code to set a new password.'] : []),
    ]),
  );
  if (opts.sendReset) await authService.forgotPassword('user', user.email);
  return { id, restored: wasBanned, resetSent: opts.sendReset };
}

export async function recoverShelter(id: string, opts: { sendReset: boolean; note?: string }) {
  const shelter = await Shelter.findById(id);
  if (!shelter) throw ApiError.notFound('Shelter not found');
  const wasBlocked = shelter.approvalStatus !== 'approved';
  if (wasBlocked) {
    shelter.approvalStatus = 'approved';
    await shelter.save();
  }
  const to = shelter.adminEmail || shelter.email;
  if (to) {
    await sendEmail(
      simpleEmail(to, 'Your SaanPaw shelter account has been recovered', [
        `Hi ${shelter.name},`,
        wasBlocked ? 'Your shelter account has been restored and approved. You can sign in again.' : 'A SaanPaw administrator helped recover your shelter account.',
        ...(opts.note ? [`Note from the team: ${opts.note}`] : []),
        ...(opts.sendReset ? ['We are also sending a separate email with a code to set a new password.'] : []),
      ]),
    );
    if (opts.sendReset && shelter.adminEmail) await authService.forgotPassword('shelter_admin', shelter.adminEmail);
  }
  return { id, restored: wasBlocked, resetSent: Boolean(opts.sendReset && shelter.adminEmail) };
}

// =====================================================================================
// Version history and rollback
// =====================================================================================

const serializeRelease = (r: any) => ({
  id: String(r._id),
  surface: r.surface,
  version: r.version,
  notes: r.notes ?? '',
  commitSha: r.commitSha,
  commitMessage: r.commitMessage,
  commitAuthor: r.commitAuthor,
  deploymentUrl: r.deploymentUrl,
  environment: r.environment,
  createdByEmail: r.createdByEmail,
  createdAt: r.createdAt?.toISOString?.(),
  rolledBackAt: r.rolledBackAt?.toISOString?.(),
});

let selfRecorded = false;
/**
 * Records the API deployment that is running right now, once per deployment: Vercel puts the
 * commit and the deployment address in the environment, so every pushed update shows up in the
 * version history without anyone typing it in.
 */
export async function recordRunningDeployment() {
  if (selfRecorded) return;
  selfRecorded = true;
  try {
    const sha = process.env.VERCEL_GIT_COMMIT_SHA;
    const url = process.env.VERCEL_URL;
    if (!sha && !url) return; // local development
    const exists = await Release.exists({ surface: 'api', commitSha: sha, deploymentUrl: url });
    if (exists) return;
    await Release.create({
      surface: 'api',
      version: `${process.env.npm_package_version ?? '0.1.0'}+${(sha ?? 'local').slice(0, 7)}`,
      commitSha: sha,
      commitMessage: process.env.VERCEL_GIT_COMMIT_MESSAGE?.slice(0, 300),
      commitAuthor: process.env.VERCEL_GIT_COMMIT_AUTHOR_NAME,
      deploymentUrl: url,
      environment: process.env.VERCEL_ENV ?? env.nodeEnv,
      notes: process.env.VERCEL_GIT_COMMIT_MESSAGE?.slice(0, 300),
    });
  } catch (err) {
    selfRecorded = false;
    logger.warn('releases: could not record this deployment', err);
  }
}

export async function listReleases() {
  await recordRunningDeployment();
  const list = await Release.find().sort({ createdAt: -1 }).limit(200).lean();
  return {
    releases: list.map(serializeRelease),
    current: { commitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null, deploymentUrl: process.env.VERCEL_URL ?? null },
    rollbackEnabled: Boolean(process.env.VERCEL_TOKEN && process.env.VERCEL_PROJECT_ID),
  };
}

export async function addRelease(developerId: string, input: { surface: 'api' | 'console' | 'mobile'; version: string; notes?: string }) {
  const me = await adminEmail(developerId);
  const r = await Release.create({ ...input, createdByEmail: me.email });
  return serializeRelease(r.toObject());
}

/**
 * Rolls the API back to an earlier deployment through Vercel's API (instant rollback). Needs
 * VERCEL_TOKEN and VERCEL_PROJECT_ID on the API project; without them the console shows the
 * manual steps instead.
 */
export async function rollbackRelease(developerId: string, id: string) {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!token || !projectId) {
    throw ApiError.badRequest('Rollback from here needs VERCEL_TOKEN and VERCEL_PROJECT_ID set on the API project. Use Vercel → Deployments → Instant Rollback instead.');
  }
  const release = await Release.findById(id);
  if (!release?.deploymentUrl) throw ApiError.badRequest('This version has no deployment to roll back to.');
  const team = process.env.VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(process.env.VERCEL_TEAM_ID)}` : '';
  const headers = { Authorization: `Bearer ${token}` };
  const dep = await fetch(`https://api.vercel.com/v13/deployments/${encodeURIComponent(release.deploymentUrl)}${team}`, { headers });
  if (!dep.ok) throw new ApiError(502, `Vercel could not find that deployment (${dep.status}).`);
  const { id: deploymentId } = (await dep.json()) as { id: string };
  const res = await fetch(`https://api.vercel.com/v1/projects/${encodeURIComponent(projectId)}/rollback/${deploymentId}${team}`, {
    method: 'POST',
    headers,
  });
  if (!res.ok) throw new ApiError(502, `Vercel refused the rollback (${res.status}): ${(await res.text()).slice(0, 200)}`);
  release.rolledBackAt = new Date();
  release.createdByEmail = release.createdByEmail ?? (await adminEmail(developerId)).email;
  await release.save();
  return serializeRelease(release.toObject());
}

// ----- System Management history -----

const pickConfig = (c: Partial<SystemConfigValue>): SystemConfigValue => ({
  aiModeration: Boolean(c.aiModeration),
  smartAlerts: Boolean(c.smartAlerts),
  geoFence: Boolean(c.geoFence),
  maintenanceMode: Boolean(c.maintenanceMode),
});

/** Every settings change keeps the state before it, so it can be undone from the history. */
export async function changeConfigWithHistory(developerId: string, patch: Partial<SystemConfigValue>, kind: 'change' | 'rollback' = 'change') {
  const before = pickConfig(await getSystemConfig());
  const updated = await updateSystemConfig(patch);
  const after = pickConfig(updated);
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    await ConfigSnapshot.create({ before, after, kind, changedByEmail: (await adminEmail(developerId)).email });
  }
  return updated;
}

export async function configHistory() {
  const list = await ConfigSnapshot.find().sort({ createdAt: -1 }).limit(100).lean();
  return list.map((s: any) => ({
    id: String(s._id),
    before: pickConfig(s.before ?? {}),
    after: pickConfig(s.after ?? {}),
    kind: s.kind,
    changedByEmail: s.changedByEmail,
    createdAt: s.createdAt?.toISOString?.(),
  }));
}

/** Puts the settings back to how they were just before that change. */
export async function rollbackConfig(developerId: string, snapshotId: string) {
  const snap = await ConfigSnapshot.findById(snapshotId).lean();
  if (!snap) throw ApiError.notFound('That change is no longer in the history.');
  return { config: await changeConfigWithHistory(developerId, pickConfig((snap as any).before ?? {}), 'rollback') };
}

// =====================================================================================
// Database backups
// =====================================================================================

/** Collections never copied: the backups themselves. */
const SKIP = new Set(['backups', 'backupchunks']);
const CHUNK_BYTES = 8 * 1024 * 1024;

/**
 * Format: gzip of frames [type:1 byte][length:4 bytes][payload]; type 1 = collection name (utf8),
 * type 2 = one document (BSON, so ids and dates come back exactly).
 */
function frame(type: number, payload: Buffer) {
  const head = Buffer.alloc(5);
  head.writeUInt8(type, 0);
  head.writeUInt32BE(payload.length, 1);
  return Buffer.concat([head, payload]);
}

async function dumpDatabase() {
  const db = mongoose.connection.db;
  if (!db) throw new ApiError(503, 'The database is not connected.');
  const BSON = mongoose.mongo.BSON;
  const parts: Buffer[] = [];
  const collections: { name: string; count: number }[] = [];
  for (const info of await db.listCollections({}, { nameOnly: true }).toArray()) {
    if (SKIP.has(info.name) || info.name.startsWith('system.')) continue;
    parts.push(frame(1, Buffer.from(info.name, 'utf8')));
    let count = 0;
    for await (const doc of db.collection(info.name).find({})) {
      parts.push(frame(2, Buffer.from(BSON.serialize(doc))));
      count++;
    }
    collections.push({ name: info.name, count });
  }
  return { data: zlib.gzipSync(Buffer.concat(parts)), collections };
}

const serializeBackup = (b: any) => ({
  id: String(b._id),
  label: b.label ?? '',
  kind: b.kind,
  status: b.status,
  sizeBytes: b.sizeBytes,
  collections: b.collections ?? [],
  createdByEmail: b.createdByEmail,
  createdAt: b.createdAt?.toISOString?.(),
  restoredAt: b.restoredAt?.toISOString?.(),
});

export async function createBackup(developerId: string, label?: string, kind: 'manual' | 'before_restore' = 'manual') {
  const me = await adminEmail(developerId);
  const { data, collections } = await dumpDatabase();
  const backup = await Backup.create({
    label: label || `Backup ${new Date().toLocaleString('en-PH', { timeZone: TZ })}`,
    kind,
    sizeBytes: data.length,
    chunkCount: Math.ceil(data.length / CHUNK_BYTES),
    collections,
    createdByEmail: me.email,
  });
  for (let i = 0, seq = 0; i < data.length; i += CHUNK_BYTES, seq++) {
    await BackupChunk.create({ backupId: backup._id, seq, data: data.subarray(i, i + CHUNK_BYTES) });
  }
  return serializeBackup(backup.toObject());
}

export async function listBackups() {
  const list = await Backup.find().sort({ createdAt: -1 }).limit(50).lean();
  return list.map(serializeBackup);
}

export async function deleteBackup(id: string) {
  const b = await Backup.findByIdAndDelete(id);
  if (!b) throw ApiError.notFound('Backup not found');
  await BackupChunk.deleteMany({ backupId: id });
  return { id };
}

/**
 * Puts the whole database back to a backup. A fresh "before restore" backup is taken first, so a
 * restore can itself be undone. Admin accounts are kept as they are now, so nobody is locked out
 * by restoring a copy from before their account existed.
 */
export async function restoreBackup(developerId: string, id: string) {
  const backup = await Backup.findById(id);
  if (!backup) throw ApiError.notFound('Backup not found');
  const chunks = await BackupChunk.find({ backupId: id }).sort({ seq: 1 }).lean();
  if (chunks.length !== backup.chunkCount) throw ApiError.badRequest('This backup is incomplete and cannot be restored.');
  const data = zlib.gunzipSync(Buffer.concat(chunks.map((c) => Buffer.from(c.data as unknown as Buffer))));

  const safety = await createBackup(developerId, `Before restoring "${backup.label}"`, 'before_restore');

  const db = mongoose.connection.db!;
  const BSON = mongoose.mongo.BSON;
  const byCollection = new Map<string, any[]>();
  let current = '';
  for (let off = 0; off < data.length; ) {
    const type = data.readUInt8(off);
    const len = data.readUInt32BE(off + 1);
    const payload = data.subarray(off + 5, off + 5 + len);
    off += 5 + len;
    if (type === 1) {
      current = payload.toString('utf8');
      byCollection.set(current, []);
    } else if (type === 2 && current) {
      byCollection.get(current)!.push(BSON.deserialize(payload));
    }
  }
  const keep = new Set(['developeraccounts']);
  for (const [name, docs] of byCollection) {
    if (keep.has(name)) continue;
    const col = db.collection(name);
    await col.deleteMany({});
    for (let i = 0; i < docs.length; i += 500) await col.insertMany(docs.slice(i, i + 500), { ordered: false });
  }
  backup.restoredAt = new Date();
  await backup.save();
  return { restored: serializeBackup(backup.toObject()), safetyBackup: safety };
}

// =====================================================================================
// Report search (server-side, paginated)
// =====================================================================================

export async function searchReports(q: {
  q?: string;
  kind?: 'lost' | 'found';
  status?: string;
  animalType?: string;
  barangay?: string;
  location?: string;
  tag?: string;
  from?: string;
  to?: string;
  sort?: 'newest' | 'oldest';
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, q.page ?? 1);
  const limit = Math.min(100, Math.max(5, q.limit ?? 20));
  const base: Record<string, unknown> = { isHiddenByModeration: false };
  if (q.status) base.status = q.status;
  if (q.animalType) base.animalType = q.animalType;
  if (q.barangay) base.barangay = q.barangay;
  if (q.tag) base.aiTags = q.tag.toLowerCase();
  if (q.from || q.to) {
    base.reportedAt = { ...(q.from ? { $gte: manilaDay(q.from) } : {}), ...(q.to ? { $lte: manilaDay(q.to, true) } : {}) };
  }
  const and: Record<string, unknown>[] = [];
  if (q.location) {
    const rx = new RegExp(escapeRx(q.location), 'i');
    and.push({ $or: [{ barangay: rx }, { address: rx }, { landmark: rx }] });
  }
  if (q.q) {
    const rx = new RegExp(escapeRx(q.q), 'i');
    and.push({ $or: [{ name: rx }, { breed: rx }, { color: rx }, { description: rx }, { distinctMarks: rx }, { reporterName: rx }, { aiTags: rx }, { barangay: rx }, { address: rx }] });
  }
  const filter = and.length ? { ...base, $and: and } : base;
  const dir = q.sort === 'oldest' ? 1 : -1;

  // Both kinds share one timeline: fetch enough of each to fill this page, then merge.
  const want = page * limit;
  const [lost, found, lostCount, foundCount] = await Promise.all([
    q.kind === 'found' ? [] : LostPetReport.find(filter).sort({ reportedAt: dir }).limit(want).lean(),
    q.kind === 'lost' ? [] : FoundAnimalReport.find(filter).sort({ reportedAt: dir }).limit(want).lean(),
    q.kind === 'found' ? 0 : LostPetReport.countDocuments(filter),
    q.kind === 'lost' ? 0 : FoundAnimalReport.countDocuments(filter),
  ]);
  const merged = [...lost.map(serializeLostReport), ...found.map(serializeFoundReport)].sort(
    (a, b) => dir * (+new Date(a.reportedAt ?? 0) - +new Date(b.reportedAt ?? 0)),
  );
  const total = lostCount + foundCount;
  return {
    items: merged.slice((page - 1) * limit, page * limit),
    page,
    limit,
    total,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
}
