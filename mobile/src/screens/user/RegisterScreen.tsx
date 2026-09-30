import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { theme } from '@/constants/theme';
import { RADIUS_OPTIONS, SJDM_BARANGAYS, SJDM_BARANGAY_NAMES } from '@saanpaw/shared';
import {
  AuthHeader,
  Banner,
  Button,
  COLUMN,
  Choice,
  Field,
  PhoneField,
  Select,
} from '@/components/ui';
import { MapCanvas } from '@/components/map/MapCanvas';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/services/api';

const GMAIL_PATTERN = /^[^\s@]+@gmail\.com$/i;

/**
 * User Module - Registration.
 * The radius picked here is the circle the smart alert system uses to decide
 * which reports reach this user.
 */
export function UserRegisterScreen({ navigation }: NativeStackScreenProps<any>) {
  const { signIn } = useAuth();

  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [barangay, setBarangay] = useState<string | null>(null);
  const [radius, setRadius] = useState(3000);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const center =
    SJDM_BARANGAYS.find((b) => b.name === barangay)?.center ?? SJDM_BARANGAYS[4].center;

  const submit = async () => {
    setSubmitError(null);
    const next: Record<string, string> = {};
    if (!firstName.trim()) next.firstName = 'Enter your first name.';
    if (!lastName.trim()) next.lastName = 'Enter your last name.';
    if (!GMAIL_PATTERN.test(email)) next.email = 'Enter a Gmail address (must end in @gmail.com).';
    if (phone.length !== 13) next.phone = 'Enter a complete mobile number.';
    if (password.length < 8) next.password = 'Use at least 8 characters.';
    if (!barangay) next.barangay = 'Select your barangay.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      await apiRequest('/user/register', {
        method: 'POST',
        body: JSON.stringify({
          firstName,
          middleName: middleName.trim() || undefined,
          lastName,
          email,
          phone,
          password,
          barangay,
          alertRadiusMeters: radius,
          location: center,
        }),
      });
      await signIn('user', email, password);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Could not create your account.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={{ paddingBottom: theme.spacing(4) }}
      keyboardShouldPersistTaps="handled"
    >
      <AuthHeader
        title="Create your account"
        subtitle="Join the SaanPaw community in San Jose Del Monte, Bulacan."
      />

      <View style={{ padding: theme.spacing(2.5), gap: theme.spacing(2), width: '100%', maxWidth: COLUMN, alignSelf: 'center' }}>
        {submitError ? (
          <Banner tone="danger" icon="alert-circle" title="Could not create account" message={submitError} />
        ) : null}
        <Field
          label="First name"
          value={firstName}
          onChangeText={setFirstName}
          placeholder="Juan"
          icon="person-outline"
          error={errors.firstName}
        />
        <Field
          label="Middle name (optional)"
          value={middleName}
          onChangeText={setMiddleName}
          placeholder="Santos"
          icon="person-outline"
        />
        <Field
          label="Last name"
          value={lastName}
          onChangeText={setLastName}
          placeholder="Dela Cruz"
          icon="person-outline"
          error={errors.lastName}
        />
        <Field
          label="Email address"
          value={email}
          onChangeText={setEmail}
          placeholder="you@gmail.com"
          keyboardType="email-address"
          icon="mail-outline"
          hint="Only Gmail addresses are accepted."
          error={errors.email}
        />
        <PhoneField
          value={phone}
          onChangeText={setPhone}
          hint="Shelters use this to reach you when your pet is recovered."
          error={errors.phone}
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="At least 8 characters"
          secureTextEntry
          icon="lock-closed-outline"
          error={errors.password}
        />

        <Select
          label="Barangay"
          value={barangay}
          options={SJDM_BARANGAY_NAMES}
          onChange={setBarangay}
          placeholder="Select your barangay"
          hint={errors.barangay}
        />

        <Choice
          label="Alert radius"
          options={RADIUS_OPTIONS.map((r) => ({ label: r.label, value: r.meters }))}
          value={radius}
          onChange={setRadius}
          hint="You will be notified about lost and found animals reported inside this circle."
        />

        <MapCanvas
          height={210}
          initialCenter={center}
          initialZoom={radius >= 10000 ? 11 : radius >= 5000 ? 12 : 13}
          radiusMeters={radius}
          radiusCenter={center}
          markers={[{ id: 'me', coordinate: center, kind: 'me', label: 'Your area' }]}
        />

        <Banner
          tone="info"
          icon="shield-checkmark-outline"
          title="Service area limited to San Jose Del Monte"
          message="Reports outside the city boundary are rejected, and identification is image-based only - no collars, tags, or microchips."
        />

        <Button label="Create account" onPress={submit} loading={busy} icon="person-add-outline" />
        <Button label="I already have an account" variant="ghost" onPress={() => navigation.goBack()} />
      </View>
    </ScrollView>
  );
}
