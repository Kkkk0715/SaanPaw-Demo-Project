import type { Request, Response } from 'express';
import { developerService } from './developer.service';

export const developerController = {
  dashboard: async (_req: Request, res: Response) =>
    res.json(await developerService.getDashboard()),

  overview: async (_req: Request, res: Response) => res.json(await developerService.overview()),

  banUser: async (req: Request, res: Response) => res.json(await developerService.banUser(req.params.id)),

  listPendingShelters: async (_req: Request, res: Response) =>
    res.json(await developerService.listPendingShelters()),

  reviewShelter: async (req: Request, res: Response) =>
    res.json(
      await developerService.reviewShelter({
        shelterId: req.params.id,
        developerId: req.auth!.id,
        ...req.body,
      }),
    ),

  systemConfig: async (_req: Request, res: Response) =>
    res.json(await developerService.systemConfig()),

  updateSystemConfig: async (req: Request, res: Response) => {
    const patch: Record<string, boolean> = {};
    for (const key of ['aiModeration', 'smartAlerts', 'geoFence', 'maintenanceMode'] as const) {
      if (typeof req.body?.[key] === 'boolean') patch[key] = req.body[key];
    }
    res.json(await developerService.updateSystemConfig(patch));
  },

  listFlags: async (req: Request, res: Response) =>
    res.json(await developerService.listFlags(req.query.status as never)),

  resolveFlag: async (req: Request, res: Response) =>
    res.json(
      await developerService.resolveFlag({
        flagId: req.params.id,
        developerId: req.auth!.id,
        ...req.body,
      }),
    ),

  deleteShelter: async (req: Request, res: Response) =>
    res.json(await developerService.deleteShelter(req.params.id)),

  deleteUser: async (req: Request, res: Response) =>
    res.json(await developerService.deleteUser(req.params.id)),

  deleteReport: async (req: Request, res: Response) => {
    const kind = req.params.kind === 'found' ? 'found' : 'lost';
    res.json(await developerService.deleteReport(kind, req.params.id));
  },
};
