import { Schema, model, InferSchemaType } from 'mongoose';

/** Message Box: 1:1 thread between a User and a Shelter about a recovered pet. */
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

export type ConversationDoc = InferSchemaType<typeof conversationSchema>;
export const Conversation = model('Conversation', conversationSchema);
