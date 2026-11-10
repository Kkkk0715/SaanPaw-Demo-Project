import { Notification } from '../models/Notification';
import { Shelter } from '../models/Shelter';
import { User } from '../models/User';
import type { NOTIFICATION_TYPES } from '../config/constants';
import { logger } from '../utils/logger';

/**
 * Push notifications go straight to Expo's push service over HTTPS.
 *
 * This used to load the expo-server-sdk package through a runtime-built dynamic import (it is an
 * ES module and this backend compiles to CommonJS). That trick also hid the package from Vercel's
 * bundler, so on the deployed backend the SDK - or one of its own dependencies - could be missing:
 * every push then failed inside a try/catch, while the in-app notification was still saved. That is
 * exactly "the alert shows in the app's list but never pops up on the phone". Calling the push
 * service directly needs no package at all, so there is nothing left to go missing.
 */
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** Expo accepts at most 100 messages per request. */
const CHUNK_SIZE = 100;
const PUSH_TIMEOUT_MS = 8000;

const isExpoPushToken = (token: unknown): token is string =>
  typeof token === 'string' && /^Expo(nent)?PushToken\[.+\]$/.test(token);

export interface PushPayload {
  token?: string | null;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PushOutcome {
  /** Messages Expo accepted for delivery. */
  sent: number;
  /** One line per message Expo refused, e.g. "InvalidCredentials: ..." when Firebase is not set up. */
  errors: string[];
  /** Payloads skipped because the account has no (valid) push token. */
  skipped: number;
}

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

/** A phone that uninstalled the app (or reset its token) is forgotten, so it stops being tried. */
async function forgetToken(token: string): Promise<void> {
  await Promise.all([
    User.updateMany({ expoPushToken: token }, { $unset: { expoPushToken: 1 } }),
    Shelter.updateMany({ expoPushToken: token }, { $unset: { expoPushToken: 1 } }),
  ]).catch(() => undefined);
}

/**
 * Sends to every payload that has a valid Expo push token and skips the rest. Never throws: a
 * failed push must not undo whatever triggered it (a report filed, a message sent).
 */
export async function sendPushNotifications(payloads: PushPayload[]): Promise<PushOutcome> {
  const outcome: PushOutcome = { sent: 0, errors: [], skipped: 0 };
  const messages = payloads
    .filter((p) => {
      const ok = isExpoPushToken(p.token);
      if (!ok) outcome.skipped += 1;
      return ok;
    })
    // 'alerts' is the high-importance Android channel the app creates, so the alert pops up on the
    // screen; high priority wakes a phone that is idle instead of holding the alert back.
    .map((p) => ({
      to: p.token as string,
      title: p.title,
      body: p.body,
      data: p.data ?? {},
      sound: 'default',
      channelId: 'alerts',
      priority: 'high',
    }));
  if (!messages.length) return outcome;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  // Only needed when "Enhanced push security" is turned on for the project in Expo.
  if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;

  for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
    const chunk = messages.slice(i, i + CHUNK_SIZE);
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(chunk),
        signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
      });
      const payload = (await response.json().catch(() => null)) as { data?: ExpoTicket[]; errors?: { message?: string }[] } | null;
      if (!response.ok || !payload?.data) {
        const reason = payload?.errors?.map((e) => e.message).join('; ') || `HTTP ${response.status}`;
        outcome.errors.push(reason);
        logger.error(`push: Expo refused the request (${reason})`);
        continue;
      }
      payload.data.forEach((ticket, idx) => {
        if (ticket.status === 'ok') {
          outcome.sent += 1;
          return;
        }
        const code = ticket.details?.error ?? 'Error';
        outcome.errors.push(`${code}: ${ticket.message ?? 'unknown'}`);
        logger.error(`push: delivery error ${code} (${ticket.message ?? 'unknown'})`);
        if (code === 'DeviceNotRegistered') void forgetToken(chunk[idx].to);
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      outcome.errors.push(reason);
      logger.error('push: failed to reach Expo push service', err);
    }
  }
  return outcome;
}

type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/**
 * The one place that creates a Notification: persists it for the in-app list, then pushes it to
 * the phone that user or shelter signed in on (if any). Never throws: every call site runs this
 * after its own primary write already succeeded, so a notification failure must never turn that
 * already-committed write into a failed request.
 */
export async function notify(params: {
  audienceType: 'user' | 'shelter';
  audienceId: unknown;
  type: NotificationType;
  refId?: unknown;
  title: string;
  body: string;
}): Promise<void> {
  try {
    await Notification.create({
      audienceType: params.audienceType,
      audienceId: params.audienceId,
      type: params.type,
      refId: params.refId,
      title: params.title,
      body: params.body,
    });

    const account =
      params.audienceType === 'user'
        ? await User.findById(params.audienceId, 'expoPushToken').lean()
        : await Shelter.findById(params.audienceId, 'expoPushToken').lean();

    await sendPushNotifications([
      {
        token: account?.expoPushToken,
        title: params.title,
        body: params.body,
        data: { type: params.type, refId: params.refId ? String(params.refId) : undefined },
      },
    ]);
  } catch (err) {
    logger.error('notify: failed to create/push notification', err);
  }
}

/**
 * Profile's "Send a test notification": pushes straight to the phone this account signed in on and
 * reports exactly what Expo said, so a setup problem (no token yet, Firebase credentials missing in
 * Expo) is visible instead of silent.
 */
export async function sendTestPush(audienceType: 'user' | 'shelter', audienceId: string) {
  const account =
    audienceType === 'user'
      ? await User.findById(audienceId, 'expoPushToken').lean()
      : await Shelter.findById(audienceId, 'expoPushToken').lean();
  const token = account?.expoPushToken;
  if (!isExpoPushToken(token)) {
    return {
      ok: false,
      message: 'This account has no phone registered for push yet. Reopen the app and allow notifications.',
    };
  }
  const outcome = await sendPushNotifications([
    {
      token,
      title: 'SaanPaw test notification',
      body: 'Push notifications are working on this phone.',
      data: { type: 'test' },
    },
  ]);
  if (outcome.sent) return { ok: true, message: 'Sent. It should appear on this phone within a few seconds.' };
  return { ok: false, message: outcome.errors[0] ?? 'Expo did not accept the notification.' };
}
