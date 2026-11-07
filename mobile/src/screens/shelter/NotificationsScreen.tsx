import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { theme } from '@/constants/theme';
import { formatDistance, useApp } from '@saanpaw/shared';
import {
  Banner,
  Button,
  Card,
  Caption,
  EmptyState,
  Screen,
  SectionHeader,
} from '@/components/ui';
import { NotificationRow } from '@/components/domain';
import { notificationTarget } from '@/navigation/notificationTarget';

/** Shelter Admin Module - Alerts for reports inside the operating radius. */
export function ShelterNotificationsScreen({ navigation }: NativeStackScreenProps<any>) {
  const { notificationsFor, markNotificationRead, markAllNotificationsRead, currentShelter } = useApp();

  const items = notificationsFor('shelter_admin');
  const unread = items.filter((n) => !n.isRead).length;

  return (
    <Screen>
      <Banner
        tone="warning"
        icon="radio"
        title={`Smart alerts within ${formatDistance(currentShelter.operatingRadiusMeters)}`}
        message={`Every lost and found report filed inside ${currentShelter.name}'s operating radius raises an alert here immediately.`}
      />

      <SectionHeader
        title={unread ? `${unread} unread` : 'All caught up'}
        action="Change radius"
        onAction={() => navigation.navigate('ShelterProfile')}
      />

      {unread ? (
        <Button
          label="Mark all as read"
          variant="ghost"
          icon="checkmark-done-outline"
          onPress={() => markAllNotificationsRead('shelter_admin')}
        />
      ) : null}

      <View style={{ gap: theme.spacing(1) }}>
        {items.length ? (
          items.map((n) => (
            <NotificationRow
              key={n.id}
              item={n}
              onPress={() => {
                markNotificationRead(n.id);
                const target = notificationTarget('shelter_admin', n.type, n.relatedReportId);
                if (target.screen !== 'ShelterNotifications') navigation.navigate(target.screen, target.params);
              }}
            />
          ))
        ) : (
          <Card>
            <EmptyState
              icon="notifications-off-outline"
              title="No alerts"
              message={`Nothing has been reported within ${formatDistance(currentShelter.operatingRadiusMeters)} of the shelter. Widen the operating radius to cover more of the city.`}
              action="Shelter profile"
              onAction={() => navigation.navigate('ShelterProfile')}
            />
          </Card>
        )}
      </View>

      <Caption style={{ textAlign: 'center' }}>
        Alerts are geo-fenced to San Jose Del Monte, Bulacan.
      </Caption>
    </Screen>
  );
}
