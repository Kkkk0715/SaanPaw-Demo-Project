import { Schema, model } from 'mongoose';

/**
 * An email that could not be sent after several tries (Gmail down, rate limited, network blip).
 * Kept here with its full content - the account it was about may already be deleted - and retried
 * automatically (email.service.ts retryQueuedEmails) until it goes out or runs out of attempts.
 */
const emailOutboxSchema = new Schema(
  {
    to: { type: String, required: true },
    subject: { type: String, required: true },
    text: { type: String, required: true },
    html: { type: String },
    status: { type: String, enum: ['queued', 'sent', 'failed'], default: 'queued', index: true },
    attempts: { type: Number, default: 0 },
    lastError: { type: String },
    nextAttemptAt: { type: Date, default: Date.now },
    sentAt: { type: Date },
  },
  { timestamps: true },
);

export const EmailOutbox = model('EmailOutbox', emailOutboxSchema);
