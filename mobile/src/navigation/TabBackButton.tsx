import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { theme } from '@/constants/theme';

/**
 * Back arrow for the tab screens (Reports, Animals, Profile, Map...). Tabs have no back button of
 * their own, so a screen opened from the home dashboard had no visible way back; this returns to
 * the screen you came from, or to Home.
 */
export function TabBackButton({ home }: { home: string }) {
  const navigation = useNavigation<any>();
  return (
    <Pressable
      onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate(home))}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel="Back"
      style={{ paddingHorizontal: theme.spacing(2), paddingVertical: 4 }}
    >
      <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
    </Pressable>
  );
}
