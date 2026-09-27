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
  Select,
} from '@/components/ui';
import { MapCanvas } from '@/components/map/MapCanvas';
import { apiRequest } from '@/services/api';

/**
 * Shelter Admin Module - Register.
 * Submitting creates a pending application, not a session. The Developer
 * verifies the permit and issues credentials afterwards.
 */
export function ShelterRegisterScreen({ navigation }: NativeStackScreenProps<any>) {
  const [name, setName] = useState('');
  const [permit, setPermit] = useState('');
  const [email, setEmail] = useState('');
  const [contact, setContact] = useState('');
  const [address, setAddress] = useState('');
  const [capacity, setCapacity] = useState('');
  const [barangay, setBarangay] = useState<string | null>(null);
  const [radius, setRadius] = useState(5000);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const center =
    SJDM_BARANGAYS.find((b) => b.name === barangay)?.center ?? SJDM_BARANGAYS[4].center;

  const submit = async () => {
    setSubmitError(null);
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Enter the shelter name.';
    if (!permit.trim()) next.permit = 'The city permit number is required for verification.';
    if (!/^\S+@\S+\.\S+$/.test(email)) next.email = 'Enter a valid email address.';
    if (contact.replace(/\D/g, '').length < 7) next.contact = 'Enter a contact number.';
    if (!address.trim()) next.address = 'Enter the shelter address.';
    if (!Number(capacity)) next.capacity = 'Enter the animal capacity.';
    if (!barangay) next.barangay = 'Select the barangay.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      await apiRequest('/shelter/register', {
        method: 'POST',
        body: JSON.stringify({
          name,
          barangay,
          contactNumber: contact,
          email,
          address,
          location: center,
          operatingRadiusMeters: radius,
          permitNumber: permit,
          capacity: Number(capacity),
        }),
      });
      setSubmitted(true);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Could not submit your application.');
    } finally {
      setBusy(false);
    }
  };

  if (submitted) {
    return (
      <ScrollView style={{ backgroundColor: theme.colors.background }}>
        <AuthHeader title="Application submitted" subtitle="Your shelter is now awaiting Developer verification." />
        <View style={{ padding: theme.spacing(2.5), gap: theme.spacing(2), width: '100%', maxWidth: COLUMN, alignSelf: 'center' }}>
          <Banner
            tone="success"
            icon="checkmark-circle"
            title={`${name} submitted for review`}
            message={`Permit ${permit} will be verified with the local government. Once approved, your login credentials are issued by the Developer and sent to ${email}.`}
          />
          <Banner
            tone="info"
            icon="time-outline"
            title="What happens next"
            message="1. The Developer verifies your permit with the city. 2. Your account is approved or rejected. 3. Approved shelters receive smart alerts for every report inside the operating radius you selected."
          />
          <Button label="Back to shelter login" onPress={() => navigation.navigate('ShelterLogin')} />
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={{ paddingBottom: theme.spacing(4) }}
      keyboardShouldPersistTaps="handled"
    >
      <AuthHeader
        title="Register your shelter"
        subtitle="Submit your details for Developer verification with the SJDM local government."
      />

      <View style={{ padding: theme.spacing(2.5), gap: theme.spacing(2), width: '100%', maxWidth: COLUMN, alignSelf: 'center' }}>
        {submitError ? (
          <Banner tone="danger" icon="alert-circle" title="Could not submit application" message={submitError} />
        ) : null}
        <Field label="Shelter name" value={name} onChangeText={setName} placeholder="e.g. Muzon Stray Haven" icon="home-outline" error={errors.name} />
        <Field
          label="City permit / accreditation number"
          value={permit}
          onChangeText={setPermit}
          placeholder="SJDM-VET-2025-000"
          icon="document-text-outline"
          hint="The Developer verifies this with the local government before granting access."
          error={errors.permit}
        />
        <Field label="Official email" value={email} onChangeText={setEmail} placeholder="shelter@example.ph" keyboardType="email-address" icon="mail-outline" error={errors.email} />
        <Field label="Contact number" value={contact} onChangeText={setContact} placeholder="(044) 000 0000" keyboardType="phone-pad" icon="call-outline" error={errors.contact} />
        <Field label="Address" value={address} onChangeText={setAddress} placeholder="Street, subdivision, landmark" icon="location-outline" multiline error={errors.address} />
        <Field label="Animal capacity" value={capacity} onChangeText={setCapacity} placeholder="e.g. 30" keyboardType="numeric" icon="albums-outline" error={errors.capacity} />

        <Select label="Barangay" value={barangay} options={SJDM_BARANGAY_NAMES} onChange={setBarangay} placeholder="Select the barangay" hint={errors.barangay} />

        <Choice
          label="Operating radius"
          options={RADIUS_OPTIONS.map((r) => ({ label: r.label, value: r.meters }))}
          value={radius}
          onChange={setRadius}
          hint="You will receive smart alerts for every lost and found report inside this circle."
        />

        <MapCanvas
          height={210}
          initialCenter={center}
          initialZoom={radius >= 10000 ? 11 : radius >= 5000 ? 12 : 13}
          radiusMeters={radius}
          radiusCenter={center}
          markers={[{ id: 'shelter', coordinate: center, kind: 'shelter', label: name || 'Your shelter' }]}
        />

        <Button label="Submit for verification" onPress={submit} loading={busy} variant="accent" icon="send-outline" />
        <Button label="Back to login" variant="ghost" onPress={() => navigation.goBack()} />
      </View>
    </ScrollView>
  );
}
