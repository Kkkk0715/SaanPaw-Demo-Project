import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@saanpaw/shared';
import { theme } from '@/constants/theme';
import { UserDashboardScreen } from '@/screens/user/DashboardScreen';
import { ReportLostPetScreen } from '@/screens/user/ReportLostPetScreen';
import { ReportFoundAnimalScreen } from '@/screens/user/ReportFoundAnimalScreen';
import { LostPetStatusScreen } from '@/screens/user/LostPetStatusScreen';
import { ShelterViewScreen } from '@/screens/user/ShelterViewScreen';
import { ImageRecognitionScreen } from '@/screens/user/ImageRecognitionScreen';
import { MapViewScreen } from '@/screens/user/MapViewScreen';
import { UserNotificationsScreen } from '@/screens/user/NotificationsScreen';
import { SearchReportsScreen } from '@/screens/user/SearchReportsScreen';
import { UserProfileScreen } from '@/screens/user/ProfileScreen';
import { headerStyle } from './navTheme';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Home: 'home',
  Map: 'map',
  Search: 'search',
  Alerts: 'notifications',
  Profile: 'person',
};

function HomeTabs() {
  const { notificationsFor } = useApp();
  const unread = notificationsFor('user').filter((n) => !n.isRead).length;
  // Android's gesture/3-button nav bar draws over the tab bar under edge-to-edge unless the
  // tab bar's own height/padding absorbs that inset - a fixed height alone doesn't.
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
      <Tab.Screen name="Home" component={UserDashboardScreen} options={{ headerShown: false }} />
      <Tab.Screen name="Map" component={MapViewScreen} options={{ title: 'Map view' }} />
      <Tab.Screen name="Search" component={SearchReportsScreen} options={{ title: 'Search reports' }} />
      <Tab.Screen
        name="Alerts"
        component={UserNotificationsScreen}
        options={{ title: 'Smart alerts', tabBarBadge: unread || undefined }}
      />
      <Tab.Screen name="Profile" component={UserProfileScreen} options={{ headerShown: false }} />
    </Tab.Navigator>
  );
}

export function UserNavigator() {
  return (
    <Stack.Navigator screenOptions={{ ...headerStyle, headerTitleStyle: { ...theme.type.h2, color: theme.colors.text } }}>
      <Stack.Screen name="HomeTabs" component={HomeTabs} options={{ headerShown: false }} />
      <Stack.Screen name="ReportLostPet" component={ReportLostPetScreen} options={{ title: 'Report Lost Pet' }} />
      <Stack.Screen name="ReportFoundAnimal" component={ReportFoundAnimalScreen} options={{ title: 'Report Found Animal' }} />
      <Stack.Screen name="LostPetStatus" component={LostPetStatusScreen} options={{ title: 'My Reports' }} />
      <Stack.Screen name="ShelterView" component={ShelterViewScreen} options={{ title: 'Shelters' }} />
      <Stack.Screen name="ImageRecognition" component={ImageRecognitionScreen} options={{ title: 'Image Match' }} />
    </Stack.Navigator>
  );
}
