import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { EmailOutbox } from '../models/EmailOutbox';

/**
 * Sends mail through Gmail SMTP using an App Password (myaccount.google.com/apppasswords) -
 * never the account's real login password, which Gmail refuses for SMTP with 2FA on anyway.
 *
 * Without GMAIL_USER/GMAIL_APP_PASSWORD configured, this logs the message instead of sending it,
 * so approving a shelter (etc.) still works end to end before those credentials exist.
 */
const configured = Boolean(env.email.gmailUser && env.email.gmailAppPassword);

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: env.email.gmailUser, pass: env.email.gmailAppPassword },
      // Bounded, so a slow SMTP server fails fast and gets retried instead of hanging the request
      // until Vercel kills it (which is how an account could be deleted with no email sent).
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }
  return transporter;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** What happened to an email: delivered now, saved to retry later, or not sent at all. */
export interface EmailResult {
  sent: boolean;
  /** True when it could not go out now but is saved and will be retried automatically. */
  queued: boolean;
}

const RETRY_DELAYS_MS = [0, 1500, 4000];
/** Attempts across the outbox before an email is given up on (about a day of retries). */
const MAX_OUTBOX_ATTEMPTS = 12;

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 500);

/** A wrong App Password or a refused address won't fix itself by retrying in a second. */
function isPermanent(err: unknown): boolean {
  const e = err as { code?: string; responseCode?: number };
  return e?.code === 'EAUTH' || e?.code === 'EENVELOPE' || (typeof e?.responseCode === 'number' && e.responseCode >= 550);
}

async function deliver(message: EmailMessage) {
  await getTransporter().sendMail({
    from: `SaanPaw <${env.email.gmailUser}>`,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}

/**
 * Sends an email, trying up to three times. If it still fails, the email is saved to the outbox
 * and retried later (retryQueuedEmails), so a passing Gmail hiccup never means the person is
 * simply not told. Never throws: a failed send must not break the action that triggered it -
 * callers that need to know (account deletion) read the result.
 */
export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  if (!configured) {
    logger.warn(`email: GMAIL_USER/GMAIL_APP_PASSWORD not set - logging instead of sending to ${message.to}`);
    logger.info(`email (not sent): [${message.subject}] to ${message.to}\n${message.text}`);
    return { sent: false, queued: false };
  }
  let lastError: unknown;
  for (const delay of RETRY_DELAYS_MS) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      await deliver(message);
      return { sent: true, queued: false };
    } catch (err) {
      lastError = err;
      logger.warn(`email: attempt to ${message.to} failed (${errorText(err)})`);
      if (isPermanent(err)) break;
    }
  }
  logger.error(`email: could not send to ${message.to}, saving it to retry later`, lastError);
  try {
    await EmailOutbox.create({
      ...message,
      attempts: RETRY_DELAYS_MS.length,
      lastError: errorText(lastError),
      nextAttemptAt: new Date(Date.now() + 2 * 60_000),
    });
    return { sent: false, queued: true };
  } catch (err) {
    logger.error('email: could not save to the outbox either', err);
    return { sent: false, queued: false };
  }
}

let retrying = false;

/**
 * Sends queued emails that are due, a few at a time. Called whenever the Developer console loads
 * its data, so on a serverless host with no background jobs the queue still drains within minutes
 * of anyone using the console. Waits longer between attempts each time; gives up after about a day.
 */
export async function retryQueuedEmails(limit = 5): Promise<void> {
  if (!configured || retrying) return;
  retrying = true;
  try {
    const due = await EmailOutbox.find({ status: 'queued', nextAttemptAt: { $lte: new Date() } })
      .sort({ nextAttemptAt: 1 })
      .limit(limit);
    for (const item of due) {
      try {
        await deliver({ to: item.to, subject: item.subject, text: item.text, html: item.html ?? undefined });
        item.status = 'sent';
        item.sentAt = new Date();
        logger.info(`email: sent queued email to ${item.to} on attempt ${item.attempts + 1}`);
      } catch (err) {
        item.attempts += 1;
        item.lastError = errorText(err);
        const backoffMinutes = Math.min(240, 2 ** item.attempts);
        item.nextAttemptAt = new Date(Date.now() + backoffMinutes * 60_000);
        if (item.attempts >= MAX_OUTBOX_ATTEMPTS || isPermanent(err)) item.status = 'failed';
      }
      await item.save();
    }
  } catch (err) {
    logger.error('email: retrying queued emails failed', err);
  } finally {
    retrying = false;
  }
}

/** How many emails are waiting to be retried, and how many were given up on - for the console. */
export async function emailQueueCounts() {
  const [queued, failed] = await Promise.all([
    EmailOutbox.countDocuments({ status: 'queued' }),
    EmailOutbox.countDocuments({ status: 'failed' }),
  ]);
  return { queued, failed };
}

export function shelterCredentialsEmail(params: { shelterName: string; email: string; password: string }): EmailMessage {
  const text =
    `Hi ${params.shelterName},\n\n` +
    `Your shelter has been approved on SaanPaw. Sign in to the Developer-issued console with:\n\n` +
    `Email: ${params.email}\n` +
    `Password: ${params.password}\n\n` +
    `Change this password after you sign in (Shelter Profile > Change password).\n\n` +
    `- SaanPaw, San Jose Del Monte, Bulacan`;
  const html = `
    <p>Hi ${params.shelterName},</p>
    <p>Your shelter has been approved on SaanPaw. Sign in with:</p>
    <p><b>Email:</b> ${params.email}<br/><b>Password:</b> ${params.password}</p>
    <p>Change this password after you sign in (Shelter Profile &gt; Change password).</p>
    <p>- SaanPaw, San Jose Del Monte, Bulacan</p>
  `;
  return { to: params.email, subject: 'Your SaanPaw shelter account is approved', text, html };
}

export function passwordResetEmail(params: { email: string; code: string }): EmailMessage {
  const text =
    `Someone requested a password reset for this SaanPaw account.\n\n` +
    `Your code: ${params.code}\n\n` +
    `Enter this in the app within 15 minutes to set a new password. If you didn't request this, ` +
    `you can ignore this email - your password hasn't changed.\n\n` +
    `- SaanPaw, San Jose Del Monte, Bulacan`;
  const html = `
    <p>Someone requested a password reset for this SaanPaw account.</p>
    <p style="font-size: 28px; font-weight: 700; letter-spacing: 4px;">${params.code}</p>
    <p>Enter this in the app within 15 minutes to set a new password. If you didn't request this,
    you can ignore this email - your password hasn't changed.</p>
    <p>- SaanPaw, San Jose Del Monte, Bulacan</p>
  `;
  return { to: params.email, subject: 'Your SaanPaw password reset code', text, html };
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Sent just before an account is deleted for reaching the upheld-flag limit, listing each upheld
 * flag so the person knows exactly what caused it.
 */
export function accountDeletedEmail(params: { name: string; email: string; reasons: string[]; limit: number }): EmailMessage {
  const list = params.reasons.map((r, i) => `${i + 1}. ${r}`).join('\n');
  const text =
    `Hi ${params.name},\n\n` +
    `Your SaanPaw account (${params.email}) has been deleted.\n\n` +
    `Why: ${params.limit} of your reports were flagged and, after review by a SaanPaw administrator, ` +
    `the flags were upheld and the reports removed. Accounts that reach ${params.limit} upheld flags are deleted ` +
    `to keep lost-pet alerts in San Jose Del Monte trustworthy.\n\n` +
    `The upheld flags were:\n${list}\n\n` +
    `Your reports, messages and notifications have been removed along with the account. ` +
    `If you believe this was a mistake, reply to this email.\n\n` +
    `- SaanPaw, San Jose Del Monte, Bulacan`;
  const html = `
    <p>Hi ${escapeHtml(params.name)},</p>
    <p>Your SaanPaw account (<b>${escapeHtml(params.email)}</b>) has been <b>deleted</b>.</p>
    <p><b>Why:</b> ${params.limit} of your reports were flagged and, after review by a SaanPaw administrator,
    the flags were upheld and the reports removed. Accounts that reach ${params.limit} upheld flags are deleted
    to keep lost-pet alerts in San Jose Del Monte trustworthy.</p>
    <p>The upheld flags were:</p>
    <ol>${params.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ol>
    <p>Your reports, messages and notifications have been removed along with the account.
    If you believe this was a mistake, reply to this email.</p>
    <p>- SaanPaw, San Jose Del Monte, Bulacan</p>
  `;
  return { to: params.email, subject: 'Your SaanPaw account has been deleted', text, html };
}

export type AccountAction = 'user_deleted' | 'user_banned' | 'shelter_deleted' | 'shelter_rejected' | 'shelter_revoked';

const ACTION_COPY: Record<AccountAction, { subject: string; what: string; consequence: string }> = {
  user_deleted: {
    subject: 'Your SaanPaw account has been deleted',
    what: 'has been deleted by a SaanPaw administrator',
    consequence: 'Your reports, messages and notifications have been removed along with the account.',
  },
  user_banned: {
    subject: 'Your SaanPaw account has been suspended',
    what: 'has been banned by a SaanPaw administrator',
    consequence: 'You can no longer sign in, and your reports are no longer shown to others.',
  },
  shelter_deleted: {
    subject: 'Your SaanPaw shelter account has been deleted',
    what: 'has been deleted by a SaanPaw administrator',
    consequence:
      'Its animals, recovery cases, conversations and proof documents have been removed along with the account.',
  },
  shelter_rejected: {
    subject: 'Your SaanPaw shelter application was not approved',
    what: 'was reviewed and not approved',
    consequence: 'You may apply again once the issue below is resolved.',
  },
  shelter_revoked: {
    subject: 'Your SaanPaw shelter access has been revoked',
    what: 'has had its access revoked by a SaanPaw administrator',
    consequence: 'The shelter can no longer sign in or receive smart alerts about reports nearby.',
  },
};

/**
 * Tells a user or shelter that their account was deleted, banned, rejected or revoked - and why,
 * in the administrator's own words. Sent before the account is removed, while the address is known.
 */
export function accountActionEmail(params: {
  action: AccountAction;
  name: string;
  email: string;
  reason?: string;
}): EmailMessage {
  const copy = ACTION_COPY[params.action];
  const reason = params.reason?.trim() || 'No reason was given. Reply to this email to ask for details.';
  const text =
    `Hi ${params.name},\n\n` +
    `Your SaanPaw ${params.action.startsWith('shelter') ? 'shelter account' : 'account'} (${params.email}) ${copy.what}.\n\n` +
    `Reason: ${reason}\n\n` +
    `${copy.consequence} If you believe this was a mistake, reply to this email.\n\n` +
    `- SaanPaw, San Jose Del Monte, Bulacan`;
  const html = `
    <p>Hi ${escapeHtml(params.name)},</p>
    <p>Your SaanPaw ${params.action.startsWith('shelter') ? 'shelter account' : 'account'} (<b>${escapeHtml(params.email)}</b>) ${copy.what}.</p>
    <p><b>Reason:</b> ${escapeHtml(reason)}</p>
    <p>${copy.consequence} If you believe this was a mistake, reply to this email.</p>
    <p>- SaanPaw, San Jose Del Monte, Bulacan</p>
  `;
  return { to: params.email, subject: copy.subject, text, html };
}
