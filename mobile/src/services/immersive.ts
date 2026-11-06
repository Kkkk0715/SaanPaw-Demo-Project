import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';

/**
 * Full-screen app: hides Android's bottom navigation bar (back / home / recent buttons) while
 * SaanPaw is open. The top status bar is hidden by <StatusBar hidden /> in App.tsx. Either bar
 * slides back in for a moment when the person swipes from that edge, then hides again.
 *
 * Android shows the bar again after the app goes to the background (and after some system
 * dialogs), so it is hidden again every time the app comes back to the foreground.
 */
export function useImmersiveMode() {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const hide = () => {
      void NavigationBar.setVisibilityAsync('hidden').catch(() => {});
    };
    hide();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') hide();
    });
    return () => sub.remove();
  }, []);
}
