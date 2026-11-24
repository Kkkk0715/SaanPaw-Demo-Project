import { Schema, model, InferSchemaType } from 'mongoose';

export const TICKET_CATEGORIES = ['account', 'report', 'shelter', 'app_problem', 'suggestion', 'other'] as const;
export const TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
export const TICKET_PRIORITIES = ['low', 'normal', 'high'] as const;

const ticketMessageSchema = new Schema(
  {
    authorType: { type: String, enum: ['user', 'shelter', 'admin'], required: true },
    authorName: { type: String, required: true },
    body: { type: String, required: true, trim: true },
    at: { type: Date, default: () => new Date() },
  },
  { _id: true },
);

/**
 * Support ticket: a user or shelter asks the SaanPaw team for help (account trouble, a wrong report,
 * an app problem), and the team answers from the Developer Console. Replies notify the requester.
 */
const ticketSchema = new Schema(
  {
    /** Short human reference shown to both sides, e.g. "T-4F2A91". */
    ref: { type: String, required: true, unique: true },
    requesterType: { type: String, enum: ['user', 'shelter'], required: true },
    requesterId: { type: Schema.Types.ObjectId, required: true, index: true },
    requesterName: { type: String, required: true },
    requesterEmail: { type: String },
    subject: { type: String, required: true, trim: true },
    category: { type: String, enum: TICKET_CATEGORIES, default: 'other' },
    status: { type: String, enum: TICKET_STATUSES, default: 'open', index: true },
    priority: { type: String, enum: TICKET_PRIORITIES, default: 'normal' },
    messages: { type: [ticketMessageSchema], default: [] },
    lastActivityAt: { type: Date, default: () => new Date(), index: true },
    unreadForRequester: { type: Number, default: 0 },
    unreadForAdmin: { type: Number, default: 1 },
  },
  { timestamps: true },
);

export type TicketDoc = InferSchemaType<typeof ticketSchema>;
export const Ticket = model('Ticket', ticketSchema);
