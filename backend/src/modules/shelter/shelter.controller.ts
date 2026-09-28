import type { Request, Response } from 'express';
import { messagingService } from '../messaging/messaging.service';
import {
  caseStatusSchema,
  openCaseSchema,
  registerShelterSchema,
  sendMessageSchema,
  shelterAnimalPatchSchema,
  shelterAnimalSchema,
  shelterProfileSchema,
} from '../../utils/validation';
import { shelterService } from './shelter.service';

const sid = (req: Request) => req.auth!.shelterId ?? req.auth!.id;

export const shelterController = {
  register: async (req: Request, res: Response) =>
    res.status(201).json(await shelterService.register(registerShelterSchema.parse(req.body))),

  me: async (req: Request, res: Response) => res.json(await shelterService.getMe(sid(req))),

  dashboard: async (req: Request, res: Response) =>
    res.json(await shelterService.getDashboard(sid(req))),

  listShelterAnimals: async (req: Request, res: Response) =>
    res.json(await shelterService.listShelterAnimals(sid(req))),
  addShelterAnimal: async (req: Request, res: Response) =>
    res.status(201).json(await shelterService.addShelterAnimal(sid(req), shelterAnimalSchema.parse(req.body))),

  updateAnimal: async (req: Request, res: Response) =>
    res.json(await shelterService.updateAnimal(sid(req), req.params.id, shelterAnimalPatchSchema.parse(req.body))),

  postRecovered: async (req: Request, res: Response) =>
    res.status(201).json(await shelterService.postRecovered(sid(req), shelterAnimalSchema.parse(req.body))),

  listAreaReports: async (req: Request, res: Response) =>
    res.json(await shelterService.listAreaReports(sid(req))),

  listCases: async (req: Request, res: Response) =>
    res.json(await shelterService.listCases(sid(req))),
  openCase: async (req: Request, res: Response) => {
    const { reportId, note } = openCaseSchema.parse(req.body);
    res.status(201).json(await shelterService.openCase(sid(req), reportId, note));
  },

  updateCaseStatus: async (req: Request, res: Response) => {
    const { status, notes } = caseStatusSchema.parse(req.body);
    res.json(await shelterService.updateCaseStatus({ shelterId: sid(req), caseId: req.params.id, status, notes }));
  },

  updateProfile: async (req: Request, res: Response) =>
    res.json(await shelterService.updateProfile(sid(req), shelterProfileSchema.parse(req.body))),

  listNotifications: async (req: Request, res: Response) =>
    res.json(await shelterService.listNotifications(sid(req))),
  markNotificationRead: async (req: Request, res: Response) =>
    res.json(await shelterService.markNotificationRead(sid(req), req.params.id)),

  // ----- Message box -----
  listConversations: async (req: Request, res: Response) =>
    res.json(await messagingService.list('shelter', sid(req))),
  sendMessage: async (req: Request, res: Response) =>
    res
      .status(201)
      .json(await messagingService.send('shelter', sid(req), req.params.id, sendMessageSchema.parse(req.body).body)),
  markConversationRead: async (req: Request, res: Response) =>
    res.json(await messagingService.markRead('shelter', sid(req), req.params.id)),
};
