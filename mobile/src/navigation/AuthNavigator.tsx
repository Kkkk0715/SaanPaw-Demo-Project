import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ForgotPasswordScreen } from '@/screens/auth/ForgotPasswordScreen';
import { RolePickerScreen } from '@/screens/auth/RolePickerScreen';
import { ShelterLoginScreen } from '@/screens/shelter/LoginScreen';
import { ShelterRegisterScreen } from '@/screens/shelter/RegisterScreen';
import { UserLoginScreen } from '@/screens/user/LoginScreen';
import { UserRegisterScreen } from '@/screens/user/RegisterScreen';
import { headerStyle } from './navTheme';

const Stack = createNativeStackNavigator();

export function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={headerStyle}>
      <Stack.Screen name="RolePicker" component={RolePickerScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ShelterLogin" component={ShelterLoginScreen} options={{ title: 'Shelter Admin Login' }} />
      <Stack.Screen name="ShelterRegister" component={ShelterRegisterScreen} options={{ title: 'Register Shelter' }} />
      <Stack.Screen name="UserLogin" component={UserLoginScreen} options={{ title: 'Sign in' }} />
      <Stack.Screen name="UserRegister" component={UserRegisterScreen} options={{ title: 'Create Account' }} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ title: 'Reset password' }} />
    </Stack.Navigator>
  );
}
