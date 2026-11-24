import { Router, type Request } from 'express';
import { z } from 'zod';
import { objectIdParam } from '../../middleware/security';
import { asyncHandler } from '../../utils/asyncHandler';
import { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from '../../models/Ticket';
import { ticketService, type RequesterType } from '../../services/ticket.service';

export const createTicketSchema = z.object({
  subject: z.string().trim().min(3, 'Add a short subject').max(120),
  category: z.enum(TICKET_CATEGORIES).default('other'),
  message: z.string().trim().min(5, 'Describe the problem').max(3000),
});
export const ticketReplySchema = z.object({
  message: z.string().trim().min(1, 'Write a reply').max(3000),
  status: z.enum(TICKET_STATUSES).optional(),
});
export const ticketPatchSchema = z
  .object({ status: z.enum(TICKET_STATUSES).optional(), priority: z.enum(TICKET_PRIORITIES).optional() })
  .refine((v) => v.status || v.priority, 'Nothing to change');
export const ticketListQuerySchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  requesterType: z.enum(['user', 'shelter']).optional(),
  q: z.string().trim().max(100).optional(),
});

/**
 * "Help & support" for the signed-in user or shelter (mounted under /user/tickets and
 * /shelter/tickets, after those routers' own sign-in checks). `idOf` picks the account id.
 */
export function requesterTicketRoutes(type: RequesterType, idOf: (req: Request) => string) {
  const router = Router();
  router.param('id', objectIdParam);
  router.get('/', asyncHandler(async (req, res) => res.json(await ticketService.listMine(type, idOf(req)))));
  router.post(
    '/',
    asyncHandler(async (req, res) => res.status(201).json(await ticketService.create(type, idOf(req), createTicketSchema.parse(req.body)))),
  );
  router.get('/:id', asyncHandler(async (req, res) => res.json(await ticketService.getMine(type, idOf(req), req.params.id))));
  router.post(
    '/:id/messages',
    asyncHandler(async (req, res) =>
      res.json(await ticketService.replyMine(type, idOf(req), req.params.id, ticketReplySchema.parse(req.body).message)),
    ),
  );
  return router;
}
