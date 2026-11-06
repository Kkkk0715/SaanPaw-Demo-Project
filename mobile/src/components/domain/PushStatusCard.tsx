import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { Card } from '@/components/ui';
import { describePushStatus, usePushStatus } from '@/services/pushNotifications';

/** Whether this phone can receive SaanPaw alerts, and why not when it can't. */
export function PushStatusCard() {
  const info = describePushStatus(usePushStatus());
  return (
    <Card>
      <View style={{ flexDirection: 'row', gap: theme.spacing(1), alignItems: 'flex-start' }}>
        <Ionicons
          name={info.ok ? 'notifications' : 'notifications-off-outline'}
          size={18}
          color={info.ok ? theme.colors.primary : theme.colors.accent}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ ...theme.type.bodyMedium, color: theme.colors.text }}>{info.title}</Text>
          <Text style={{ ...theme.type.caption, color: theme.colors.textSoft }}>{info.detail}</Text>
        </View>
      </View>
    </Card>
  );
}
