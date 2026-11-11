import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '@saanpaw/shared';
import type { MobileRole } from '@/context/AuthContext';
import { notificationTarget } from './notificationTarget';

/** A tap already acted on, so the cold-start check and the live listener never both navigate. */
let handled: string | null = null;

/**
 * Opens the right screen when a push notification is tapped - both while the app is running and
 * when the tap is what launched it. Used inside the user and shelter navigators, which are screens
 * of the root stack (`rootScreen`), so the target is reached through them.
 */
export function useNotificationTaps(role: MobileRole, rootScreen: 'User' | 'Shelter') {
  const navigation = useNavigation<any>();
  const { sync } = useApp();
  const refreshRef = useRef(sync.refresh);
  refreshRef.current = sync.refresh;

  // Fresh data the moment something changes, instead of waiting for the next timed reload: when an
  // alert arrives while the app is open, and when the app comes back from the background (the timed
  // reload does not run while it is in the background).
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const received = Notifications.addNotificationReceivedListener(() => void refreshRef.current());
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshRef.current();
    });
    return () => {
      received.remove();
      appState.remove();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return; // no push on the web build
    const open = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const id = response.notification.request.identifier;
      if (handled === id) return;
      handled = id;
      const data = (response.notification.request.content.data ?? {}) as { type?: string; refId?: string };
      const target = notificationTarget(role, data.type, data.refId);
      void refreshRef.current();
      navigation.navigate(rootScreen, { screen: target.screen, params: target.params });
    };

    void Notifications.getLastNotificationResponseAsync().then(open).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [navigation, role, rootScreen]);
}
