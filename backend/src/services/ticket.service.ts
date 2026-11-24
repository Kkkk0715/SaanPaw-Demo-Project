import crypto from 'crypto';
import { Ticket, TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from '../models/Ticket';
import { User } from '../models/User';
import { Shelter } from '../models/Shelter';
import { ApiError } from '../utils/ApiError';
import { combineName } from '../utils/geoHelpers';
import { notify } from './pushNotification.service';

export type RequesterType = 'user' | 'shelter';
type TicketStatus = (typeof TICKET_STATUSES)[number];

export function serializeTicket(doc: any, side: 'requester' | 'admin') {
  return {
    id: String(doc._id),
    ref: doc.ref,
    requesterType: doc.requesterType,
    requesterId: String(doc.requesterId),
    requesterName: doc.requesterName,
    ...(side === 'admin' ? { requesterEmail: doc.requesterEmail } : {}),
    subject: doc.subject,
    category: doc.category,
    status: doc.status,
    priority: doc.priority,
    messages: (doc.messages ?? []).map((m: any) => ({
      id: String(m._id),
      authorType: m.authorType,
      authorName: m.authorName,
      body: m.body,
      at: m.at?.toISOString?.() ?? m.at,
    })),
    unread: side === 'admin' ? doc.unreadForAdmin ?? 0 : doc.unreadForRequester ?? 0,
    createdAt: doc.createdAt?.toISOString?.(),
    lastActivityAt: doc.lastActivityAt?.toISOString?.(),
  };
}

async function requesterInfo(type: RequesterType, id: string) {
  if (type === 'user') {
    const u = await User.findById(id, 'firstName middleName lastName email').lean();
    if (!u) throw ApiError.notFound('Account not found');
    return { name: combineName(u), email: u.email };
  }
  const s = await Shelter.findById(id, 'name adminEmail email').lean();
  if (!s) throw ApiError.notFound('Shelter not found');
  return { name: s.name, email: s.adminEmail || s.email };
}

const newRef = () => `T-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

/** Support tickets, from the requester's side (user or shelter) and the admin's side. */
export const ticketService = {
  async create(
    type: RequesterType,
    requesterId: string,
    input: { subject: string; category: (typeof TICKET_CATEGORIES)[number]; message: string },
  ) {
    const who = await requesterInfo(type, requesterId);
    const now = new Date();
    const ticket = await Ticket.create({
      ref: newRef(),
      requesterType: type,
      requesterId,
      requesterName: who.name,
      requesterEmail: who.email,
      subject: input.subject,
      category: input.category,
      messages: [{ authorType: type, authorName: who.name, body: input.message, at: now }],
      lastActivityAt: now,
      unreadForAdmin: 1,
    });
    return serializeTicket(ticket.toObject(), 'requester');
  },

  async listMine(type: RequesterType, requesterId: string) {
    const list = await Ticket.find({ requesterType: type, requesterId }).sort({ lastActivityAt: -1 }).limit(100).lean();
    return list.map((t) => serializeTicket(t, 'requester'));
  },

  /** Opening a ticket marks the team's replies as read. */
  async getMine(type: RequesterType, requesterId: string, id: string) {
    const t = await Ticket.findOneAndUpdate({ _id: id, requesterType: type, requesterId }, { unreadForRequester: 0 }, { new: true }).lean();
    if (!t) throw ApiError.notFound('Ticket not found');
    return serializeTicket(t, 'requester');
  },

  async replyMine(type: RequesterType, requesterId: string, id: string, body: string) {
    const t = await Ticket.findOne({ _id: id, requesterType: type, requesterId });
    if (!t) throw ApiError.notFound('Ticket not found');
    if (t.status === 'closed') throw ApiError.badRequest('This ticket is closed. Open a new one if you still need help.');
    t.messages.push({ authorType: type, authorName: t.requesterName, body, at: new Date() });
    // A reply on a resolved ticket reopens it.
    if (t.status === 'resolved') t.status = 'open';
    t.lastActivityAt = new Date();
    t.unreadForAdmin = (t.unreadForAdmin ?? 0) + 1;
    t.unreadForRequester = 0;
    await t.save();
    return serializeTicket(t.toObject(), 'requester');
  },

  // ----- Admin (Developer Console) -----
  async list(filter: { status?: TicketStatus; requesterType?: RequesterType; q?: string }) {
    const query: Record<string, unknown> = {};
    if (filter.status) query.status = filter.status;
    if (filter.requesterType) query.requesterType = filter.requesterType;
    if (filter.q) {
      const rx = new RegExp(filter.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [{ subject: rx }, { requesterName: rx }, { ref: rx }, { requesterEmail: rx }];
    }
    const list = await Ticket.find(query).sort({ lastActivityAt: -1 }).limit(500).lean();
    return list.map((t) => serializeTicket(t, 'admin'));
  },

  async get(id: string) {
    const t = await Ticket.findByIdAndUpdate(id, { unreadForAdmin: 0 }, { new: true }).lean();
    if (!t) throw ApiError.notFound('Ticket not found');
    return serializeTicket(t, 'admin');
  },

  async adminReply(id: string, adminName: string, body: string, status?: TicketStatus) {
    const t = await Ticket.findById(id);
    if (!t) throw ApiError.notFound('Ticket not found');
    t.messages.push({ authorType: 'admin', authorName: adminName, body, at: new Date() });
    t.status = status ?? (t.status === 'open' ? 'in_progress' : t.status);
    t.lastActivityAt = new Date();
    t.unreadForRequester = (t.unreadForRequester ?? 0) + 1;
    t.unreadForAdmin = 0;
    await t.save();
    await notify({
      audienceType: t.requesterType,
      audienceId: t.requesterId,
      type: 'ticket',
      refId: t._id,
      title: `SaanPaw support replied (${t.ref})`,
      body: body.length > 140 ? `${body.slice(0, 137)}...` : body,
    });
    return serializeTicket(t.toObject(), 'admin');
  },

  async update(id: string, patch: { status?: TicketStatus; priority?: (typeof TICKET_PRIORITIES)[number] }) {
    const t = await Ticket.findByIdAndUpdate(id, { ...patch, lastActivityAt: new Date() }, { new: true });
    if (!t) throw ApiError.notFound('Ticket not found');
    if (patch.status && ['resolved', 'closed'].includes(patch.status)) {
      await notify({
        audienceType: t.requesterType,
        audienceId: t.requesterId,
        type: 'ticket',
        refId: t._id,
        title: `Ticket ${t.ref} ${patch.status === 'resolved' ? 'resolved' : 'closed'}`,
        body: `"${t.subject}" was marked ${patch.status}. Reply in the app if you still need help.`,
      });
    }
    return serializeTicket(t.toObject(), 'admin');
  },

  async counts() {
    const rows: { _id: string; n: number }[] = await Ticket.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]);
    return Object.fromEntries(rows.map((r) => [r._id, r.n])) as Partial<Record<TicketStatus, number>>;
  },
};
