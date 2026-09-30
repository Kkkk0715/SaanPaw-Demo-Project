import { Alert, Platform } from 'react-native';

/**
 * react-native-web has no Alert UI, so a native Alert.alert() on web silently does
 * nothing — fall back to window.confirm there instead.
 */
export function confirmAsync(options: {
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
}): Promise<boolean> {
  const { title, message, confirmLabel = 'OK', destructive } = options;

  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }

  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
