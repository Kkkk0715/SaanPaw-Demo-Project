import { createNativeStackNavigator } from '@react-navigation/native-stack';
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

const Stack = createNativeStackNavigator();

export function ShelterNavigator() {
  useNotificationTaps('shelter_admin', 'Shelter');
  return (
    <Stack.Navigator
      screenOptions={{ ...headerStyle, headerTitleStyle: { ...theme.type.h2, color: theme.colors.text } }}
    >
      {/* The dashboard draws its own green hero, so it hides the stack header. */}
      <Stack.Screen name="ShelterDashboard" component={ShelterDashboardScreen} options={{ headerShown: false }} />
      <Stack.Screen name="AnimalReports" component={AnimalReportsScreen} options={{ title: 'Animal Reports' }} />
      <Stack.Screen name="ShelterAnimals" component={ShelterAnimalsScreen} options={{ title: 'Shelter Animals' }} />
      <Stack.Screen name="RecoveredAnimals" component={RecoveredAnimalsScreen} options={{ title: 'Recovered Animals' }} />
      <Stack.Screen name="RescuedAnimals" component={RescuedAnimalsScreen} options={{ title: 'Rescued Pets & Strays' }} />
      <Stack.Screen name="AnimalStatus" component={AnimalStatusScreen} options={{ title: 'Animal Status' }} />
      <Stack.Screen name="Messages" component={MessagesScreen} options={{ title: 'Message Box' }} />
      <Stack.Screen name="ShelterNotifications" component={ShelterNotificationsScreen} options={{ title: 'Notifications' }} />
      <Stack.Screen name="ShelterProfile" component={ShelterProfileScreen} options={{ title: 'Shelter Profile' }} />
      <Stack.Screen name="ReportDetail" component={ReportDetailScreen} options={{ title: 'Report details' }} />
    </Stack.Navigator>
  );
}
