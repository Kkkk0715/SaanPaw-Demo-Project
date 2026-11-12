import type { Request, Response } from 'express';
import { developerService } from './developer.service';
import { flagStatusQuerySchema, resolveFlagSchema, reviewShelterSchema, systemConfigPatchSchema } from '../../utils/validation';

/** The administrator's reason for a ban or deletion (request body or ?reason=), trimmed and capped. */
const reasonFrom = (req: Request): string | undefined => {
  const raw = (req.body as { reason?: unknown } | undefined)?.reason ?? req.query.reason;
  return typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, 1000) : undefined;
};

export const developerController = {
  me: async (req: Request, res: Response) => res.json(await developerService.me(req.auth!.id)),

  dashboard: async (_req: Request, res: Response) =>
    res.json(await developerService.getDashboard()),

  overview: async (_req: Request, res: Response) => res.json(await developerService.overview()),

  banUser: async (req: Request, res: Response) =>
    res.json(await developerService.banUser(req.params.id, reasonFrom(req))),

  listPendingShelters: async (_req: Request, res: Response) =>
    res.json(await developerService.listPendingShelters()),

  reviewShelter: async (req: Request, res: Response) =>
    res.json(
      await developerService.reviewShelter({
        // The body is validated first and spread first, so it can never replace the ids below.
        ...reviewShelterSchema.parse(req.body),
        shelterId: req.params.id,
        developerId: req.auth!.id,
      }),
    ),

  listShelterProofs: async (req: Request, res: Response) =>
    res.json(await developerService.listShelterProofs(req.params.id)),

  getProofDocument: async (req: Request, res: Response) => {
    const doc = await developerService.getProofDocument(req.params.id);
    res.setHeader('Content-Type', doc.contentType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.filename ?? 'document')}"`);
    res.setHeader('Content-Length', String(doc.data.length));
    res.end(doc.data);
  },

  systemConfig: async (_req: Request, res: Response) =>
    res.json(await developerService.systemConfig()),

  updateSystemConfig: async (req: Request, res: Response) =>
    res.json(await developerService.updateSystemConfig(systemConfigPatchSchema.parse(req.body ?? {}))),

  listFlags: async (req: Request, res: Response) =>
    res.json(await developerService.listFlags(flagStatusQuerySchema.parse(req.query).status)),

  resolveFlag: async (req: Request, res: Response) =>
    res.json(
      await developerService.resolveFlag({
        ...resolveFlagSchema.parse(req.body),
        flagId: req.params.id,
        developerId: req.auth!.id,
      }),
    ),

  deleteShelter: async (req: Request, res: Response) =>
    res.json(await developerService.deleteShelter(req.params.id, reasonFrom(req))),

  deleteUser: async (req: Request, res: Response) =>
    res.json(await developerService.deleteUser(req.params.id, reasonFrom(req))),

  deleteReport: async (req: Request, res: Response) => {
    const kind = req.params.kind === 'found' ? 'found' : 'lost';
    res.json(await developerService.deleteReport(kind, req.params.id));
  },
};
