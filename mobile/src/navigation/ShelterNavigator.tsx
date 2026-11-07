import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@saanpaw/shared';
import { theme } from '@/constants/theme';
import { ShelterDashboardScreen } from '@/screens/shelter/DashboardScreen';
import { ShelterAnimalsScreen } from '@/screens/shelter/ShelterAnimalsScreen';
import { RecoveredAnimalsScreen } from '@/screens/shelter/RecoveredAnimalsScreen';
import { RescuedAnimalsScreen } from '@/screens/shelter/RescuedAnimalsScreen';
import { AnimalReportsScreen } from '@/screens/shelter/AnimalReportsScreen';
import { AnimalStatusScreen } from '@/screens/shelter/AnimalStatusScreen';
import { MessagesScreen } from '@/screens/shelter/MessagesScreen';
import { ShelterProfileScreen } from '@/screens/shelter/ShelterProfileScreen';
import { ShelterNotificationsScreen } from '@/screens/shelter/NotificationsScreen';
import { ReportDetailScreen } from '@/screens/common/ReportDetailScreen';
import { headerStyle } from './navTheme';
import { useNotificationTaps } from './useNotificationTaps';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

/**
 * The tab names are the screen names the shelter screens already navigate to ('AnimalReports',
 * 'ShelterProfile'...), so every existing navigate() call lands on the matching tab unchanged.
 */
const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  ShelterDashboard: 'home',
  AnimalReports: 'documents',
  ShelterAnimals: 'paw',
  ShelterProfile: 'person',
};

/** Bottom tabs for the Shelter Module, laid out the same way as the User Module's. */
function ShelterTabs() {
  const { shelterAreaReports } = useApp();
  const unhandledReports = shelterAreaReports().filter((r) => !r.caseId).length;
  // Android's gesture/3-button nav bar draws over the tab bar under edge-to-edge unless the tab
  // bar's own height/padding absorbs that inset - a fixed height alone doesn't.
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        ...headerStyle,
        headerTitleStyle: { ...theme.type.h2, color: theme.colors.text },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarStyle: {
          borderTopColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          height: 62 + insets.bottom,
          paddingTop: 6,
          paddingBottom: 8 + insets.bottom,
        },
        tabBarLabelStyle: { ...theme.type.tiny, fontSize: 10.5 },
        tabBarIcon: ({ color, size, focused }) => (
          <Ionicons
            name={
              focused
                ? TAB_ICONS[route.name]
                : (`${TAB_ICONS[route.name]}-outline` as keyof typeof Ionicons.glyphMap)
            }
            size={size - 2}
            color={color}
          />
        ),
      })}
    >
      {/* The dashboard draws its own green hero, so it hides the header. */}
      <Tab.Screen
        name="ShelterDashboard"
        component={ShelterDashboardScreen}
        options={{ headerShown: false, tabBarLabel: 'Home', title: 'Home' }}
      />
      <Tab.Screen
        name="AnimalReports"
        component={AnimalReportsScreen}
        options={{ title: 'Animal Reports', tabBarLabel: 'Reports', tabBarBadge: unhandledReports || undefined }}
      />
      <Tab.Screen
        name="ShelterAnimals"
        component={ShelterAnimalsScreen}
        options={{ title: 'Shelter Animals', tabBarLabel: 'Animals' }}
      />
      <Tab.Screen
        name="ShelterProfile"
        component={ShelterProfileScreen}
        options={{ title: 'Shelter Profile', tabBarLabel: 'Profile' }}
      />
    </Tab.Navigator>
  );
}

export function ShelterNavigator() {
  useNotificationTaps('shelter_admin', 'Shelter');
  return (
    <Stack.Navigator
      screenOptions={{ ...headerStyle, headerTitleStyle: { ...theme.type.h2, color: theme.colors.text } }}
    >
      <Stack.Screen name="ShelterTabs" component={ShelterTabs} options={{ headerShown: false }} />
      <Stack.Screen name="RecoveredAnimals" component={RecoveredAnimalsScreen} options={{ title: 'Recovered Animals' }} />
      <Stack.Screen name="RescuedAnimals" component={RescuedAnimalsScreen} options={{ title: 'Rescued Pets & Strays' }} />
      <Stack.Screen name="AnimalStatus" component={AnimalStatusScreen} options={{ title: 'Animal Status' }} />
      <Stack.Screen name="Messages" component={MessagesScreen} options={{ title: 'Message Box' }} />
      {/* Opened from the bell on the dashboard (it shows the unread count). */}
      <Stack.Screen name="ShelterNotifications" component={ShelterNotificationsScreen} options={{ title: 'Notifications' }} />
      <Stack.Screen name="ReportDetail" component={ReportDetailScreen} options={{ title: 'Report details' }} />
    </Stack.Navigator>
  );
}
