import { Router, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { LostPetReport } from '../../models/LostPetReport';
import { FoundAnimalReport } from '../../models/FoundAnimalReport';
import { Shelter } from '../../models/Shelter';
import { ShelterAnimal } from '../../models/ShelterAnimal';
import { objectIdParam } from '../../middleware/security';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { serializeFoundReport, serializeLostReport, serializeShelter, serializeShelterAnimal } from '../../utils/geoHelpers';
import { facebookConfig } from '../../services/facebook.service';
import { receivePhoto } from '../../middleware/upload';
import { geoFence } from '../../middleware/geoFence';
import { getSystemConfig } from '../../services/systemConfig.service';
import { guestAccountId, hashGuestKey, newGuestKey } from '../../services/guestReporter.service';
import { userService } from '../user/user.service';
import { guestKeySchema, guestReportSchema, reportStatusSchema } from '../../utils/validation';
import { savePhotoHandler } from '../upload/upload.routes';
import { describeHandler } from '../ai/ai.routes';

/**
 * What anyone may see without an account: the guest mode of the app, and report links shared on
 * Facebook. Reporters' phone numbers and account ids are never included; only first names.
 */
export const publicRoutes = Router();
publicRoutes.param('id', objectIdParam);
publicRoutes.use(rateLimit({ windowMs: 60_000, max: 120 }));

function publicReport(r: Record<string, any>): Record<string, any> {
  const { reporterPhone: _p, reporterId: _id, moderationFlagId: _m, caseId: _c, ...rest } = r;
  return { ...rest, reporterName: String(r.reporterName ?? '').split(' ')[0] || 'A SaanPaw user' };
}

async function findReport(kind: string, id: string) {
  const doc =
    kind === 'lost'
      ? await LostPetReport.findOne({ _id: id, isHiddenByModeration: false }).lean()
      : await FoundAnimalReport.findOne({ _id: id, isHiddenByModeration: false }).lean();
  if (!doc) throw ApiError.notFound('This report is no longer available.');
  return publicReport(kind === 'lost' ? serializeLostReport(doc) : serializeFoundReport(doc));
}

publicRoutes.get('/reports/:kind(lost|found)/:id', asyncHandler(async (req, res) => res.json(await findReport(req.params.kind, req.params.id))));

/** Open reports for the guest map and search: newest first. */
publicRoutes.get(
  '/reports',
  asyncHandler(async (req, res) => {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(300).default(200) }).parse(req.query);
    const open = { isHiddenByModeration: false, status: { $in: ['active', 'matched'] } };
    const [lost, found] = await Promise.all([
      LostPetReport.find(open).sort({ reportedAt: -1 }).limit(limit).lean(),
      FoundAnimalReport.find(open).sort({ reportedAt: -1 }).limit(limit).lean(),
    ]);
    res.json(
      [...lost.map(serializeLostReport), ...found.map(serializeFoundReport)]
        .map(publicReport)
        .sort((a, b) => +new Date(b.reportedAt ?? 0) - +new Date(a.reportedAt ?? 0))
        .slice(0, limit),
    );
  }),
);

publicRoutes.get(
  '/shelters',
  asyncHandler(async (_req, res) => {
    const list = await Shelter.find({ approvalStatus: 'approved' }).sort({ name: 1 }).lean();
    res.json(list.map((s) => serializeShelter(s)));
  }),
);

publicRoutes.get(
  '/shelters/:id/animals',
  asyncHandler(async (req, res) => {
    const list = await ShelterAnimal.find({ shelterId: req.params.id, postedPublicly: true, isHiddenByModeration: false })
      .sort({ intakeDate: -1 })
      .limit(200)
      .lean();
    res.json(list.map(serializeShelterAnimal));
  }),
);

// ----- Guest mode: report a lost or found animal without an account -----
// Limits are per network address, since there is no account to count against. Every guest
// report still goes through the same photo screening, AI moderation and duplicate checks.

const limited = (max: number, windowMinutes: number, message: string) =>
  rateLimit({ windowMs: windowMinutes * 60_000, max, keyGenerator: (req) => `guest:${req.ip}`, message: { error: message, details: null } });

async function notDuringMaintenance(_req: Request, _res: Response, next: NextFunction) {
  try {
    if ((await getSystemConfig()).maintenanceMode) {
      throw new ApiError(503, 'SaanPaw is temporarily down for maintenance. Please try again shortly.');
    }
    next();
  } catch (err) {
    next(err);
  }
}

publicRoutes.post(
  '/guest/photos',
  notDuringMaintenance,
  limited(20, 60, 'Too many photos from this network. Try again in an hour, or sign in.'),
  receivePhoto,
  savePhotoHandler,
);

publicRoutes.post(
  '/guest/describe',
  limited(10, 60, 'Too many photo readings. Fill in the details yourself.'),
  describeHandler,
);

publicRoutes.post(
  '/guest/reports/:kind(lost|found)',
  notDuringMaintenance,
  limited(5, 60, 'Too many reports from this network. Try again in an hour, or create an account.'),
  geoFence,
  asyncHandler(async (req, res) => {
    const { reporterName, reporterPhone, ...data } = guestReportSchema.parse(req.body);
    const owner = await guestAccountId();
    const { key, hash } = newGuestKey();
    const guest = { name: reporterName, phone: reporterPhone, keyHash: hash };
    const report =
      req.params.kind === 'lost'
        ? await userService.createLostReport(owner, data, guest)
        : await userService.createFoundReport(owner, data, guest);
    // The key is shown only now: the guest's phone keeps it to mark the report resolved or delete it.
    res.status(201).json({ ...publicReport(report), reporterPhone, guestKey: key });
  }),
);

/** The guest's own report, checked against the key their phone kept. */
async function ownGuestReport(kind: string, id: string, key: string) {
  const model: any = kind === 'lost' ? LostPetReport : FoundAnimalReport;
  const doc = await model.findOne({ _id: id, byGuest: true }, '+guestKeyHash').lean();
  if (!doc || !doc.guestKeyHash || doc.guestKeyHash !== hashGuestKey(key)) {
    throw ApiError.notFound('Report not found, or it was made on another phone.');
  }
}

publicRoutes.patch(
  '/guest/reports/:kind(lost|found)/:id/status',
  limited(30, 60, 'Too many changes. Try again later.'),
  asyncHandler(async (req, res) => {
    const { key } = guestKeySchema.parse(req.body);
    const { status } = reportStatusSchema.parse(req.body);
    await ownGuestReport(req.params.kind, req.params.id, key);
    const owner = await guestAccountId();
    const r =
      req.params.kind === 'lost'
        ? await userService.updateLostReportStatus(owner, req.params.id, status)
        : await userService.updateFoundReportStatus(owner, req.params.id, status);
    res.json(publicReport(r));
  }),
);

publicRoutes.delete(
  '/guest/reports/:kind(lost|found)/:id',
  limited(30, 60, 'Too many changes. Try again later.'),
  asyncHandler(async (req, res) => {
    const { key } = guestKeySchema.parse(req.body ?? {});
    await ownGuestReport(req.params.kind, req.params.id, key);
    res.json(await userService.deleteReport(await guestAccountId(), req.params.kind === 'found' ? 'found' : 'lost', req.params.id));
  }),
);

// ----- Share page for Facebook (and any link preview) -----

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function absolute(url?: string) {
  if (!url) return undefined;
  return /^https?:\/\//.test(url) ? url : `${facebookConfig.publicApiUrl}${url.startsWith('/') ? '' : '/'}${url}`;
}

function sendHtml(res: Response, html: string) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(html);
}

/**
 * GET /share/r/:kind/:id - the address put on Facebook. Facebook reads the preview (photo, title,
 * description) from this page; people who click it are sent on to the report in SaanPaw.
 */
export const shareRoutes = Router();
shareRoutes.param('id', objectIdParam);
shareRoutes.get(
  '/r/:kind(lost|found)/:id',
  asyncHandler(async (req, res) => {
    const kind = req.params.kind;
    // The console uses hash routes (static hosting), so its report page lives at /#/r/...
    const target = `${facebookConfig.consoleUrl}/#/r/${kind}/${req.params.id}`;
    let report: Record<string, any>;
    try {
      report = await findReport(kind, req.params.id);
    } catch {
      return sendHtml(res, `<!doctype html><meta http-equiv="refresh" content="0;url=${esc(facebookConfig.consoleUrl)}"><title>SaanPaw</title><a href="${esc(facebookConfig.consoleUrl)}">SaanPaw</a>`);
    }
    const what = [report.color, report.breed || report.animalType].filter(Boolean).join(' ');
    const title = kind === 'lost' ? `LOST: ${report.name ? `${report.name}, ` : ''}${what}` : `FOUND: ${what}`;
    const place = [report.address || report.barangay, 'San Jose Del Monte'].filter(Boolean).join(', ');
    const description = `${kind === 'lost' ? 'Last seen' : 'Found'} near ${place}. ${report.description ?? ''} Help bring them home - see the full report and contact details on SaanPaw.`.trim();
    const image = absolute(report.imageUrls?.[0]);
    sendHtml(
      res,
      `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(title)} | SaanPaw</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta property="og:type" content="article">
<meta property="og:site_name" content="SaanPaw">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(`${facebookConfig.publicApiUrl}/api/v1/share/r/${kind}/${req.params.id}`)}">
${image ? `<meta property="og:image" content="${esc(image)}">` : ''}
${facebookConfig.appId ? `<meta property="fb:app_id" content="${esc(facebookConfig.appId)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0;url=${esc(target)}">
</head><body style="font-family:sans-serif;padding:24px">
<p>Opening the report on SaanPaw... <a href="${esc(target)}">Continue</a></p>
</body></html>`,
    );
  }),
);
