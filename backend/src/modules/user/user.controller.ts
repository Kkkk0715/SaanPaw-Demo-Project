import type { Request, Response } from 'express';
import { messagingService } from '../messaging/messaging.service';
import { ApiError } from '../../utils/ApiError';
import { sendTestPush } from '../../services/pushNotification.service';
import {
  deleteAccountSchema,
  matchScanSchema,
  pushTokenSchema,
  reportStatusSchema,
  queryNumber,
  registerUserSchema,
  reportSchema,
  sendMessageSchema,
  startConversationSchema,
  userProfileSchema,
} from '../../utils/validation';
import { userService } from './user.service';

const uid = (req: Request) => req.auth!.id;

export const userController = {
  register: async (req: Request, res: Response) =>
    res.status(201).json(await userService.register(registerUserSchema.parse(req.body))),

  me: async (req: Request, res: Response) => res.json(await userService.getMe(uid(req))),
  deleteAccount: async (req: Request, res: Response) =>
    res.json(await userService.deleteOwnAccount(uid(req), deleteAccountSchema.parse(req.body).password)),
  updateProfile: async (req: Request, res: Response) =>
    res.json(await userService.updateProfile(uid(req), userProfileSchema.parse(req.body))),
  myReports: async (req: Request, res: Response) =>
    res.json(await userService.listMyReports(uid(req))),

  myCases: async (req: Request, res: Response) => res.json(await userService.listMyCases(uid(req))),

  dashboard: async (_req: Request, res: Response) =>
    res.json(await userService.getDashboard()),

  createLostReport: async (req: Request, res: Response) =>
    res.status(201).json(await userService.createLostReport(uid(req), reportSchema.parse(req.body))),
  updateLostReportStatus: async (req: Request, res: Response) =>
    res.json(await userService.updateLostReportStatus(uid(req), req.params.id, reportStatusSchema.parse(req.body).status)),

  updateFoundReportStatus: async (req: Request, res: Response) =>
    res.json(await userService.updateFoundReportStatus(uid(req), req.params.id, reportStatusSchema.parse(req.body).status)),
  deleteReport: async (req: Request, res: Response) => {
    const kind = req.params.kind === 'found' ? 'found' : 'lost';
    res.json(await userService.deleteReport(uid(req), kind, req.params.id));
  },

  createFoundReport: async (req: Request, res: Response) =>
    res.status(201).json(await userService.createFoundReport(uid(req), reportSchema.parse(req.body))),

  listShelters: async (_req: Request, res: Response) =>
    res.json(await userService.listShelters()),
  listShelterAnimals: async (req: Request, res: Response) =>
    res.json(await userService.listShelterAnimals(req.params.id)),

  matchSuggestions: async (req: Request, res: Response) =>
    res.json(await userService.matchSuggestions(req.params.id)),
  scanPhoto: async (req: Request, res: Response) =>
    res.json(await userService.scanPhoto(uid(req), matchScanSchema.parse(req.body))),

  mapReports: async (req: Request, res: Response) => {
    const lng = queryNumber(req.query.lng);
    const lat = queryNumber(req.query.lat);
    const radiusMeters = queryNumber(req.query.radiusMeters);
    const bbox =
      lng !== undefined && lat !== undefined && radiusMeters !== undefined ? { lng, lat, radiusMeters } : undefined;
    res.json(await userService.mapReports(bbox));
  },

  searchReports: async (req: Request, res: Response) =>
    res.json(
      await userService.searchReports({
        kind: req.query.kind === 'lost' || req.query.kind === 'found' ? req.query.kind : undefined,
        animalType: typeof req.query.animalType === 'string' ? req.query.animalType : undefined,
        dateFrom: typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined,
        dateTo: typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined,
        lng: queryNumber(req.query.lng),
        lat: queryNumber(req.query.lat),
        radiusMeters: queryNumber(req.query.radiusMeters),
      }),
    ),

  listNotifications: async (req: Request, res: Response) =>
    res.json(await userService.listNotifications(uid(req))),
  markNotificationRead: async (req: Request, res: Response) =>
    res.json(await userService.markNotificationRead(uid(req), req.params.id)),
  updatePushToken: async (req: Request, res: Response) => {
    res.json(await userService.updatePushToken(uid(req), pushTokenSchema.parse(req.body).token));
  },
  /** Profile's "Send a test notification": pushes to this account's phone and says what happened. */
  testPush: async (req: Request, res: Response) => res.json(await sendTestPush('user', uid(req))),

  // ----- Message box -----
  listConversations: async (req: Request, res: Response) =>
    res.json(await messagingService.list('user', uid(req))),
  startConversation: async (req: Request, res: Response) =>
    res.status(201).json(await messagingService.start(uid(req), startConversationSchema.parse(req.body))),
  sendMessage: async (req: Request, res: Response) =>
    res
      .status(201)
      .json(await messagingService.send('user', uid(req), req.params.id, sendMessageSchema.parse(req.body).body)),
  markConversationRead: async (req: Request, res: Response) =>
    res.json(await messagingService.markRead('user', uid(req), req.params.id)),
};
