import { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { theme } from '@/constants/theme';
import {
  MIN_USER_AGE,
  RADIUS_OPTIONS,
  SJDM_BARANGAYS,
  SJDM_BARANGAY_NAMES,
  ageFromBirthDate,
  passwordMeetsRules,
} from '@saanpaw/shared';
import {
  AuthHeader,
  Banner,
  Button,
  COLUMN,
  Choice,
  Field,
  FormScrollView,
  PasswordRules,
  PhoneField,
  Select,
  useBottomInset,
} from '@/components/ui';
import { MapCanvas } from '@/components/map/MapCanvas';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/services/api';
import { EmailVerifier } from '@/components/domain/EmailVerifier';
import { BirthdayField } from '@/components/domain/BirthdayField';
import { PROVIDER_LABEL, type Provider, type SocialResult } from '@/services/facebook';
import { SocialButtons } from '@/components/domain/SocialButtons';

/** Any provider - Gmail, Yahoo, Outlook, a school or work address. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * User Module - Registration.
 * The radius picked here is the circle the smart alert system uses to decide
 * which reports reach this user.
 */
export function UserRegisterScreen({ navigation, route }: NativeStackScreenProps<any>) {
  const { signIn, signInWithTicket } = useAuth();
  const bottomInset = useBottomInset();

  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [barangay, setBarangay] = useState<string | null>(null);
  const [radius, setRadius] = useState(3000);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [emailToken, setEmailToken] = useState<string | null>(null);
  /** Signed up with Google or Facebook: that account is connected to the new one. */
  const [social, setSocial] = useState<{ provider: Provider; token: string; name?: string; email?: string; emailVerified: boolean } | null>(null);
  const [socialNote, setSocialNote] = useState<string | null>(null);

  /** Fills in what the provider shared (only fields still blank) and remembers the connection. */
  const applySocial = (r: SocialResult) => {
    if (!r.token) return;
    setSocial({ provider: r.provider, token: r.token, name: r.name, email: r.email, emailVerified: Boolean(r.emailVerified) });
    const parts = (r.name ?? '').trim().split(/\s+/).filter(Boolean);
    const first = r.firstName ?? (parts.length >= 2 ? parts.slice(0, -1).join(' ') : parts[0]);
    const last = r.lastName ?? (parts.length >= 2 ? parts[parts.length - 1] : undefined);
    if (first) setFirstName((v) => v || first);
    if (last) setLastName((v) => v || last);
    if (r.email) setEmail((v) => v || r.email!);
    setSocialNote(
      r.status === 'not_registered'
        ? `No SaanPaw account uses this ${PROVIDER_LABEL[r.provider]} account yet, so finish signing up below.`
        : null,
    );
  };

  // Came from "Continue with Google / Facebook" on the sign-in screen.
  useEffect(() => {
    const fromLogin = (route.params as { social?: SocialResult } | undefined)?.social;
    if (fromLogin) applySocial(fromLogin);
  }, [route.params]);

  const onSocial = async (r: SocialResult) => {
    // Already has an account: just sign in.
    if (r.status === 'signed_in' && r.ticket) {
      try {
        await signInWithTicket(r.ticket);
      } catch (e) {
        setSubmitError(e instanceof Error ? e.message : 'Sign in failed.');
      }
      return;
    }
    applySocial(r);
  };

  /** Google already confirmed this exact address, so no emailed code is needed. */
  const emailConfirmedBySocial = Boolean(
    social?.emailVerified && social.email && social.email.toLowerCase() === email.trim().toLowerCase(),
  );

  const center =
    SJDM_BARANGAYS.find((b) => b.name === barangay)?.center ?? SJDM_BARANGAYS[4].center;

  const submit = async () => {
    setSubmitError(null);
    const next: Record<string, string> = {};
    if (!firstName.trim()) next.firstName = 'Enter your first name.';
    if (!lastName.trim()) next.lastName = 'Enter your last name.';
    const age = birthDate ? ageFromBirthDate(birthDate) : null;
    if (!birthDate) next.birthDate = 'Choose the month, day and year you were born.';
    else if (age === null) next.birthDate = 'Enter a valid birthday.';
    else if (age < MIN_USER_AGE) next.birthDate = `You must be at least ${MIN_USER_AGE} years old to register.`;
    if (!EMAIL_PATTERN.test(email.trim())) next.email = 'Enter a valid email address.';
    else if (!emailToken && !emailConfirmedBySocial) next.emailCode = 'Verify your email: send the code and enter it here.';
    if (phone.length !== 13) next.phone = 'Enter a complete mobile number.';
    if (!passwordMeetsRules(password)) next.password = 'Your password does not meet all the requirements below yet.';
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
          email: email.trim(),
          phone,
          password,
          birthDate,
          barangay,
          alertRadiusMeters: radius,
          location: center,
          emailVerificationToken: emailToken,
          socialToken: social?.token,
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
    <FormScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={{ paddingBottom: theme.spacing(4) + bottomInset }}
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
        {social ? (
          <Banner
            tone="success"
            icon={social.provider === 'google' ? 'logo-google' : 'logo-facebook'}
            title={`Signing up with ${PROVIDER_LABEL[social.provider]}${social.name ? `: ${social.name}` : ''}`}
            message={
              socialNote ??
              `Your details were filled in from ${PROVIDER_LABEL[social.provider]} - check them, then add the rest. Next time just tap "Continue with ${PROVIDER_LABEL[social.provider]}" to sign in.`
            }
          />
        ) : (
          <SocialButtons intent="register" onResult={onSocial} dividerLabel="or fill in the form" />
        )}
        <Field
          label="First name"
          value={firstName}
          onChangeText={setFirstName}
          placeholder="Juan"
          icon="person-outline"
          only="letters"
          error={errors.firstName}
        />
        <Field
          label="Middle name (optional)"
          value={middleName}
          onChangeText={setMiddleName}
          placeholder="Santos"
          icon="person-outline"
          only="letters"
        />
        <Field
          label="Last name"
          value={lastName}
          onChangeText={setLastName}
          placeholder="Dela Cruz"
          icon="person-outline"
          only="letters"
          error={errors.lastName}
        />
        <BirthdayField onChange={setBirthDate} error={errors.birthDate} />
        <Field
          label="Email address"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          icon="mail-outline"
          hint="Any email provider works - Gmail, Yahoo, Outlook and others. We send a code to check it is yours."
          error={errors.email}
        />
        {emailConfirmedBySocial ? (
          <Banner tone="success" icon="checkmark-circle" title="Email confirmed by Google" message="No code needed for this address." />
        ) : (
          <EmailVerifier
            email={email}
            purpose="register_user"
            token={emailToken}
            onVerified={setEmailToken}
            onCodeSent={() => setErrors(({ email: _email, emailCode: _code, ...rest }) => rest)}
            error={errors.emailCode}
          />
        )}
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
          placeholder="Create a password"
          secureTextEntry
          icon="lock-closed-outline"
          error={errors.password}
        />
        <PasswordRules password={password} />

        <Select
          label="Barangay"
          value={barangay}
          options={SJDM_BARANGAY_NAMES}
          onChange={setBarangay}
          placeholder="Select your barangay"
          error={errors.barangay}
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
    </FormScrollView>
  );
}
