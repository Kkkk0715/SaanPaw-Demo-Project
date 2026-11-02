import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../utils/logger';

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

/** Never throws: a failed or unconfigured send must not break the action that triggered it. */
export async function sendEmail(message: EmailMessage): Promise<{ sent: boolean }> {
  if (!configured) {
    logger.warn(`email: GMAIL_USER/GMAIL_APP_PASSWORD not set - logging instead of sending to ${message.to}`);
    logger.info(`email (not sent): [${message.subject}] to ${message.to}\n${message.text}`);
    return { sent: false };
  }
  try {
    await getTransporter().sendMail({
      from: `SaanPaw <${env.email.gmailUser}>`,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { sent: true };
  } catch (err) {
    logger.error(`email: failed to send to ${message.to}`, err);
    return { sent: false };
  }
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
