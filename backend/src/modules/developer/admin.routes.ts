import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { objectIdParam } from '../../middleware/security';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { DeveloperAccount } from '../../models/DeveloperAccount';
import { REPORT_STATUSES, ANIMAL_TYPES } from '../../config/constants';
import { ticketService } from '../../services/ticket.service';
import { ticketListQuerySchema, ticketPatchSchema, ticketReplySchema } from '../support/ticket.routes';
import * as admin from './admin.service';

/**
 * The admin features added to the Developer Console: support tickets, analytics by date range,
 * admin accounts, account recovery, version history with rollback, settings history, database
 * backups and paginated report search. Mounted by developer.routes.ts after its sign-in check.
 */
const router = Router();
router.param('id', objectIdParam);

/** A turned-off admin's session stops working right away, not when its token expires. */
async function requireActiveAdmin(req: Request, _res: Response, next: NextFunction) {
  try {
    const acct = await DeveloperAccount.findById(req.auth!.id, 'disabled').lean();
    if (!acct || acct.disabled) return next(ApiError.forbidden('This admin account has been turned off.'));
    next();
  } catch (err) {
    next(err);
  }
}
router.use(requireActiveAdmin);

const me = (req: Request) => req.auth!.id;
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

// ----- Support tickets -----
router.get('/tickets', asyncHandler(async (req, res) => res.json({ tickets: await ticketService.list(ticketListQuerySchema.parse(req.query)), counts: await ticketService.counts() })));
router.get('/tickets/:id', asyncHandler(async (req, res) => res.json(await ticketService.get(req.params.id))));
router.post(
  '/tickets/:id/messages',
  asyncHandler(async (req, res) => {
    const { message, status } = ticketReplySchema.parse(req.body);
    const acct = await DeveloperAccount.findById(me(req), 'name email').lean();
    res.json(await ticketService.adminReply(req.params.id, acct?.name || 'SaanPaw support', message, status));
  }),
);
router.patch('/tickets/:id', asyncHandler(async (req, res) => res.json(await ticketService.update(req.params.id, ticketPatchSchema.parse(req.body)))));

// ----- Analytics -----
router.get(
  '/analytics',
  asyncHandler(async (req, res) =>
    res.json(
      await admin.analytics(
        z
          .object({
            from: isoDay.optional(),
            to: isoDay.optional(),
            interval: z.enum(['day', 'week', 'month']).optional(),
            kind: z.enum(['lost', 'found']).optional(),
            animalType: z.enum(ANIMAL_TYPES).optional(),
            barangay: z.string().trim().min(1).max(80).optional(),
            status: z.enum(REPORT_STATUSES).optional(),
          })
          .parse(req.query),
      ),
    ),
  ),
);

// ----- Admin accounts -----
router.get('/admins', asyncHandler(async (req, res) => res.json(await admin.listAdmins(me(req)))));
router.post(
  '/admins',
  asyncHandler(async (req, res) =>
    res.status(201).json(
      await admin.addAdmin(
        me(req),
        z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email address').max(254), name: z.string().trim().min(2, 'Enter their name').max(100) }).parse(req.body),
      ),
    ),
  ),
);
router.patch('/admins/:id', asyncHandler(async (req, res) => res.json(await admin.setAdminDisabled(me(req), req.params.id, z.object({ disabled: z.boolean() }).parse(req.body).disabled))));

// ----- Recover account -----
const recoverSchema = z.object({ sendReset: z.boolean().default(true), note: z.string().trim().max(500).optional() });
router.post('/users/:id/recover', asyncHandler(async (req, res) => res.json(await admin.recoverUser(req.params.id, recoverSchema.parse(req.body ?? {})))));
router.post('/shelters/:id/recover', asyncHandler(async (req, res) => res.json(await admin.recoverShelter(req.params.id, recoverSchema.parse(req.body ?? {})))));

// ----- Versions & rollback -----
router.get('/releases', asyncHandler(async (_req, res) => res.json(await admin.listReleases())));
router.post(
  '/releases',
  asyncHandler(async (req, res) =>
    res.status(201).json(
      await admin.addRelease(
        me(req),
        z.object({ surface: z.enum(['api', 'console', 'mobile']), version: z.string().trim().min(1).max(40), notes: z.string().trim().max(2000).optional() }).parse(req.body),
      ),
    ),
  ),
);
router.post('/releases/:id/rollback', asyncHandler(async (req, res) => res.json(await admin.rollbackRelease(me(req), req.params.id))));
router.get('/system/history', asyncHandler(async (_req, res) => res.json(await admin.configHistory())));
router.post('/system/history/:id/rollback', asyncHandler(async (req, res) => res.json(await admin.rollbackConfig(me(req), req.params.id))));

// ----- Database backups -----
router.get('/backups', asyncHandler(async (_req, res) => res.json(await admin.listBackups())));
router.post('/backups', asyncHandler(async (req, res) => res.status(201).json(await admin.createBackup(me(req), z.object({ label: z.string().trim().max(100).optional() }).parse(req.body ?? {}).label))));
router.post('/backups/:id/restore', asyncHandler(async (req, res) => res.json(await admin.restoreBackup(me(req), req.params.id))));
router.delete('/backups/:id', asyncHandler(async (req, res) => res.json(await admin.deleteBackup(req.params.id))));

// ----- Report search (paginated) -----
router.get(
  '/reports',
  asyncHandler(async (req, res) =>
    res.json(
      await admin.searchReports(
        z
          .object({
            q: z.string().trim().max(100).optional(),
            kind: z.enum(['lost', 'found']).optional(),
            status: z.enum(REPORT_STATUSES).optional(),
            animalType: z.enum(ANIMAL_TYPES).optional(),
            barangay: z.string().trim().max(100).optional(),
            location: z.string().trim().max(100).optional(),
            tag: z.string().trim().max(30).optional(),
            from: isoDay.optional(),
            to: isoDay.optional(),
            sort: z.enum(['newest', 'oldest']).optional(),
            page: z.coerce.number().int().min(1).max(1000).optional(),
            limit: z.coerce.number().int().min(5).max(100).optional(),
          })
          .parse(req.query),
      ),
    ),
  ),
);

export default router;
