import { useEffect } from 'react';
import { Alert, Text, View } from 'react-native';
import { LoadingLogo } from '@/components/ui/LoadingLogo';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useApp } from '@saanpaw/shared';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui';
import { theme } from '@/constants/theme';
import { AuthNavigator } from './AuthNavigator';
import { ShelterNavigator } from './ShelterNavigator';
import { UserNavigator } from './UserNavigator';

const Stack = createNativeStackNavigator();

export function RootNavigator() {
  const { role, loading, signOut } = useAuth();
  const { sync } = useApp();

  // A failed request after the first load: tell the user once, the store has already rolled back.
  useEffect(() => {
    if (role && sync.status === 'ready' && sync.error) {
      Alert.alert('SaanPaw', sync.error);
      sync.clearError();
    }
  }, [role, sync]);

  if (loading || (role && sync.status === 'loading')) {
    return (
      <LoadingLogo message={role ? 'Loading your reports and alerts…' : undefined} />
    );
  }

  if (role && sync.status === 'error') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
        <Text style={{ ...theme.type.h3, color: theme.colors.text, textAlign: 'center' }}>Could not load your data</Text>
        <Text style={{ ...theme.type.caption, color: theme.colors.textSoft, textAlign: 'center' }}>{sync.error}</Text>
        <Button label="Try again" onPress={() => sync.refresh()} />
        <Button label="Sign out" variant="ghost" onPress={() => signOut()} />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {role === null && <Stack.Screen name="Auth" component={AuthNavigator} />}
      {role === 'shelter_admin' && <Stack.Screen name="Shelter" component={ShelterNavigator} />}
      {role === 'user' && <Stack.Screen name="User" component={UserNavigator} />}
    </Stack.Navigator>
  );
}
