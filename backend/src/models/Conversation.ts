import { Schema, model, InferSchemaType } from 'mongoose';

/** Message Box: the one thread between a User and a Shelter (one per pair - see the index below). */
const conversationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    shelterId: { type: Schema.Types.ObjectId, ref: 'Shelter', required: true, index: true },
    subject: { type: String, trim: true, default: '' },
    relatedReportId: { type: Schema.Types.ObjectId },
    lastMessageAt: { type: Date, default: Date.now },
    unreadForUser: { type: Number, default: 0 },
    unreadForShelter: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// One thread per user and shelter. The unique index for that is created by messagingService once
// older duplicates are merged - declared here, it would fail to build while duplicates exist.

export type ConversationDoc = InferSchemaType<typeof conversationSchema>;
export const Conversation = model('Conversation', conversationSchema);
