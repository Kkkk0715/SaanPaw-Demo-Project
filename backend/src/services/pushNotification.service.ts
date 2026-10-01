import { Expo, type ExpoPushMessage } from 'expo-server-sdk';
import { Notification } from '../models/Notification';
import { Shelter } from '../models/Shelter';
import { User } from '../models/User';
import type { NOTIFICATION_TYPES } from '../config/constants';
import { logger } from '../utils/logger';

const expo = new Expo();

export interface PushPayload {
  token?: string | null;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Sends to as many of the given tokens as are valid Expo push tokens; silently skips the rest
 * (a device that never registered one, or registered on web where none exists). Never throws -
 * a failed or partial push must not block whatever triggered it, same as sendEmail().
 */
export async function sendPushNotifications(payloads: PushPayload[]): Promise<void> {
  const messages: ExpoPushMessage[] = payloads
    .filter((p): p is PushPayload & { token: string } => Boolean(p.token) && Expo.isExpoPushToken(p.token))
    .map((p) => ({ to: p.token, title: p.title, body: p.body, data: p.data, sound: 'default' }));

  if (!messages.length) return;

  try {
    for (const chunk of expo.chunkPushNotifications(messages)) {
      const receipts = await expo.sendPushNotificationsAsync(chunk);
      for (const r of receipts) {
        if (r.status === 'error') logger.error(`push: delivery error (${r.message ?? 'unknown'})`);
      }
    }
  } catch (err) {
    logger.error('push: failed to send batch', err);
  }
}

type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/**
 * The one place that creates a Notification: persists it for the in-app list, then best-effort
 * pushes it to whichever device token (if any) that user or shelter has registered. Every call
 * site that used to call `Notification.create` directly should call this instead, so an alert
 * is never silently in-app-only again.
 */
export async function notify(params: {
  audienceType: 'user' | 'shelter';
  audienceId: unknown;
  type: NotificationType;
  refId?: unknown;
  title: string;
  body: string;
}): Promise<void> {
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
}
