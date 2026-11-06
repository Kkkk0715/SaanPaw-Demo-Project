import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Fredoka_600SemiBold, Fredoka_700Bold } from '@expo-google-fonts/fredoka';
import {
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
} from '@expo-google-fonts/nunito';
import { useMemo, type ReactNode } from 'react';
import { AppStoreProvider, type ApiSession } from '@saanpaw/shared';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { RootNavigator } from '@/navigation/RootNavigator';
import { API_BASE_URL } from '@/services/api';
import { theme } from '@/constants/theme';
import { useImmersiveMode } from '@/services/immersive';

/** Feeds the signed-in role's token to the data store; signed out, the store keeps its seed data. */
function StoreProvider({ children }: { children: ReactNode }) {
  const { role, token, signOut } = useAuth();
  const session = useMemo<ApiSession | undefined>(
    () =>
      role && token
        ? { baseUrl: API_BASE_URL, token, role, onUnauthorized: () => void signOut() }
        : undefined,
    [role, token, signOut],
  );
  return <AppStoreProvider session={session}>{children}</AppStoreProvider>;
}

export default function App() {
  useImmersiveMode();
  const [fontsReady] = useFonts({
    Fredoka_600SemiBold,
    Fredoka_700Bold,
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });

  // Text would flash in the system font and reflow once the real fonts land.
  if (!fontsReady) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StoreProvider>
          {/* Screens like the role picker and the two dashboards hide their header and
              set no title, so the default formatter falls through to "undefined" in the
              browser tab. Fall back to the brand name instead. */}
          <NavigationContainer documentTitle={{ formatter: (options) => options?.title ?? 'SaanPaw' }}>
            <RootNavigator />
          </NavigationContainer>
        </StoreProvider>
      </AuthProvider>
      {/* Hidden while the app is open; swiping down from the top shows it briefly. */}
      <StatusBar style="dark" hidden />
    </SafeAreaProvider>
  );
}
