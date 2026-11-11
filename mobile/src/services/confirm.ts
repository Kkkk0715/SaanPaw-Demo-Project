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

/** Before an animal is shown to, or hidden from, the public in Shelter View. */
export const confirmPublishToggle = (name: string, isPublic: boolean) =>
  confirmAsync({
    title: isPublic ? `Hide ${name} from the public?` : `Post ${name} publicly?`,
    message: isPublic
      ? 'Pet owners will no longer see this animal under Recovered animals. You can post it again later.'
      : 'Pet owners will see this animal, its photo and details under Recovered animals in Shelter View.',
    confirmLabel: isPublic ? 'Hide' : 'Post',
    cancelLabel: 'Cancel',
  });

/** Before every unread alert is marked as read at once. */
export const confirmMarkAllRead = (count: number) =>
  confirmAsync({
    title: 'Mark all as read?',
    message: `${count} unread ${count === 1 ? 'alert' : 'alerts'} will be marked as read. They stay in the list.`,
    confirmLabel: 'Mark all read',
    cancelLabel: 'Cancel',
  });

/** The standard question before deleting anything: "Are you sure you want to delete this?" Yes / No. */
export const confirmDelete = (what: string, consequence?: string) =>
  confirmAsync({
    title: 'Are you sure you want to delete this?',
    message: consequence ? `${what} will be permanently deleted. ${consequence}` : `${what} will be permanently deleted. This cannot be undone.`,
    confirmLabel: 'Yes',
    cancelLabel: 'No',
    destructive: true,
  });
