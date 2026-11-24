import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ForgotPasswordScreen } from '@/screens/auth/ForgotPasswordScreen';
import { LegalScreen } from '@/screens/common/LegalScreen';
import { RolePickerScreen } from '@/screens/auth/RolePickerScreen';
import { ShelterLoginScreen } from '@/screens/shelter/LoginScreen';
import { ShelterRegisterScreen } from '@/screens/shelter/RegisterScreen';
import { UserLoginScreen } from '@/screens/user/LoginScreen';
import { UserRegisterScreen } from '@/screens/user/RegisterScreen';
import {
  GuestHomeScreen,
  GuestNeedAccountScreen,
  GuestReportFoundScreen,
  GuestReportLostScreen,
} from '@/screens/guest/GuestHomeScreen';
import { PublicReportScreen } from '@/screens/common/PublicReportScreen';
import { headerStyle } from './navTheme';
import { useReportLinks } from './useReportLinks';

const Stack = createNativeStackNavigator();

export function AuthNavigator() {
  useReportLinks('Auth');
  return (
    <Stack.Navigator screenOptions={headerStyle}>
      <Stack.Screen name="RolePicker" component={RolePickerScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ShelterLogin" component={ShelterLoginScreen} options={{ title: 'Shelter Admin Login' }} />
      <Stack.Screen name="ShelterRegister" component={ShelterRegisterScreen} options={{ title: 'Register Shelter' }} />
      <Stack.Screen name="UserLogin" component={UserLoginScreen} options={{ title: 'Sign in' }} />
      <Stack.Screen name="UserRegister" component={UserRegisterScreen} options={{ title: 'Create Account' }} />
      <Stack.Screen name="GuestHome" component={GuestHomeScreen} options={{ title: 'Browse as guest' }} />
      <Stack.Screen name="GuestReportLost" component={GuestReportLostScreen} options={{ title: 'Report a lost pet' }} />
      <Stack.Screen name="GuestReportFound" component={GuestReportFoundScreen} options={{ title: 'Report a found animal' }} />
      <Stack.Screen name="GuestNeedAccount" component={GuestNeedAccountScreen} options={{ title: 'Account needed' }} />
      <Stack.Screen name="PublicReport" component={PublicReportScreen} options={{ title: 'Report' }} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ title: 'Reset password' }} />
      <Stack.Screen
        name="Legal"
        component={LegalScreen}
        options={({ route }) => ({
          title: (route.params as { doc?: string } | undefined)?.doc === 'privacy' ? 'Privacy Policy' : 'Terms of Use',
        })}
      />
    </Stack.Navigator>
  );
}
