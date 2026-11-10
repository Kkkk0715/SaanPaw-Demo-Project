import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Notifications from 'expo-notifications';

/** Shows a notification while the app is open in the foreground too, not just backgrounded. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** The Android channel every SaanPaw alert is sent on (the server names it too). */
export const ALERT_CHANNEL_ID = 'alerts';

/**
 * Where push setup got to on this phone, shown in Profile. Push used to fail silently, which is
 * how "no notifications reach the phone" went unnoticed: on an Android build without Firebase
 * configured, getting a push token throws, and the app just carried on without one.
 */
export type PushStatus =
  | { state: 'unknown' }
  | { state: 'on' }
  | { state: 'unsupported'; reason: string }
  | { state: 'denied' }
  | { state: 'failed'; reason: string };

let status: PushStatus = { state: 'unknown' };
const listeners = new Set<(s: PushStatus) => void>();
const setStatus = (next: PushStatus) => {
  status = next;
  listeners.forEach((l) => l(next));
};

/**
 * Called once the token has (or has not) reached the server. The phone can have a token and still
 * get nothing if the server never stored it, so "on" is only shown after the server has it.
 */
export function markPushTokenSaved(saved: boolean, reason?: string) {
  if (saved) setStatus({ state: 'on' });
  else
    setStatus({
      state: 'failed',
      reason: `This phone could not be registered with SaanPaw for alerts${reason ? ` (${reason})` : ''}. Reopen the app to try again.`,
    });
}

/** The current push status, updating when registration finishes. */
export function usePushStatus(): PushStatus {
  const [value, setValue] = useState(status);
  useEffect(() => {
    listeners.add(setValue);
    setValue(status);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}

/** One line for Profile: what the status means for the person holding the phone. */
export function describePushStatus(s: PushStatus): { title: string; detail: string; ok: boolean } {
  switch (s.state) {
    case 'on':
      return { title: 'Push notifications are on', detail: 'Alerts arrive on this phone even when SaanPaw is closed.', ok: true };
    case 'denied':
      return {
        title: 'Push notifications are off',
        detail: 'Notifications are blocked for SaanPaw. Allow them in your phone settings, then reopen the app.',
        ok: false,
      };
    case 'unsupported':
      return { title: 'Push notifications are unavailable here', detail: s.reason, ok: false };
    case 'failed':
      return { title: 'Push notifications could not be set up', detail: s.reason, ok: false };
    default:
      return { title: 'Setting up push notifications…', detail: 'Checking this phone.', ok: false };
  }
}

/**
 * Registers this device for push and returns its Expo push token, or null if push isn't available
 * (web build, Expo Go on Android, no permission, Firebase not configured in this build). The rest of
 * the app works the same either way; the reason is kept in `usePushStatus()` for Profile.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'web') {
    setStatus({ state: 'unsupported', reason: 'The web version of SaanPaw cannot receive push notifications.' });
    return null;
  }
  if (Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    setStatus({
      state: 'unsupported',
      reason: 'Expo Go cannot receive push notifications on Android. Install a build of the app (eas build) instead.',
    });
    return null;
  }

  try {
    if (Platform.OS === 'android') {
      // HIGH importance is what makes Android pop the alert up on screen with sound; the default
      // importance only drops it silently into the notification shade.
      await Notifications.setNotificationChannelAsync(ALERT_CHANNEL_ID, {
        name: 'Lost & found alerts',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#047857',
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let permission = existing.status;
    if (permission !== 'granted') {
      permission = (await Notifications.requestPermissionsAsync()).status;
    }
    if (permission !== 'granted') {
      setStatus({ state: 'denied' });
      return null;
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      setStatus({ state: 'failed', reason: 'This build has no EAS project id, so it cannot get a push token.' });
      return null;
    }

    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    // Stays "setting up" until the server has stored the token (see markPushTokenSaved).
    return data;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // On Android this is almost always Firebase missing from the build.
    const reason = /firebase|FCM|google-services/i.test(message)
      ? 'This build of the app was made without Firebase (google-services.json), which Android needs for push notifications.'
      : `Could not get a push token: ${message}`;
    console.warn(`push: ${message}`);
    setStatus({ state: 'failed', reason });
    return null;
  }
}
