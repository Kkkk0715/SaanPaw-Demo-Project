import { Alert, Platform } from 'react-native';

/**
 * react-native-web has no Alert UI, so a native Alert.alert() on web silently does
 * nothing — fall back to window.confirm there instead.
 */
export function confirmAsync(options: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}): Promise<boolean> {
  const { title, message, confirmLabel = 'Yes', cancelLabel = 'No', destructive } = options;

  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }

  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/** The standard question before deleting anything: "Are you sure you want to delete this?" Yes / No. */
export const confirmDelete = (what: string, consequence?: string) =>
  confirmAsync({
    title: 'Are you sure you want to delete this?',
    message: consequence ? `${what} will be permanently deleted. ${consequence}` : `${what} will be permanently deleted. This cannot be undone.`,
    confirmLabel: 'Yes',
    cancelLabel: 'No',
    destructive: true,
  });
