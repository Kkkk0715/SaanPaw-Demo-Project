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
  useBottomInset,
  FormScrollView,
} from '@/components/ui';
import { MapCanvas } from '@/components/map/MapCanvas';
import { ProofUploader, type ProofFile } from '@/components/domain/ProofUploader';
import { apiRequest } from '@/services/api';
import { EmailVerifier } from '@/components/domain/EmailVerifier';

/** Any provider - Gmail, Yahoo, Outlook, an organisation's own domain. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Shelter Admin Module - Register.
 * Submitting creates a pending application, not a session. The Developer
 * verifies the permit and the proof documents, and issues credentials afterwards.
 */
export function ShelterRegisterScreen({ navigation }: NativeStackScreenProps<any>) {
  const bottomInset = useBottomInset();
  const [name, setName] = useState('');
  const [permit, setPermit] = useState('');
  const [email, setEmail] = useState('');
  const [contact, setContact] = useState('');
  const [houseUnitNo, setHouseUnitNo] = useState('');
  const [street, setStreet] = useState('');
  const [subdivision, setSubdivision] = useState('');
  const [capacity, setCapacity] = useState('');
  const [barangay, setBarangay] = useState<string | null>(null);
  const [radius, setRadius] = useState(5000);
  const [proofs, setProofs] = useState<ProofFile[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [emailToken, setEmailToken] = useState<string | null>(null);

  const center =
    SJDM_BARANGAYS.find((b) => b.name === barangay)?.center ?? SJDM_BARANGAYS[4].center;

  const submit = async () => {
    setSubmitError(null);
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Enter the shelter name.';
    if (!permit.trim()) next.permit = 'The city permit number is required for verification.';
    if (!EMAIL_PATTERN.test(email.trim())) next.email = 'Enter a valid email address.';
    else if (!emailToken) next.emailCode = 'Verify the email: send the code and enter it here.';
    if (contact.length !== 13) next.contact = 'Enter a complete contact number.';
    if (!street.trim()) next.street = 'Enter the street.';
    if (!Number(capacity)) next.capacity = 'Enter the animal capacity.';
    if (!barangay) next.barangay = 'Select the barangay.';
    if (proofs.some((p) => p.status === 'uploading')) next.proofs = 'Wait for your documents to finish uploading.';
    else if (!proofs.some((p) => p.status === 'done')) next.proofs = 'Attach at least one proof document (permit, registration, ID or photos).';
    else if (proofs.some((p) => p.status === 'failed')) next.proofs = 'Remove or re-attach the documents that failed to upload.';
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
          email: email.trim(),
          houseUnitNo: houseUnitNo.trim() || undefined,
          street,
          subdivision: subdivision.trim() || undefined,
          location: center,
          operatingRadiusMeters: radius,
          permitNumber: permit,
          capacity: Number(capacity),
          proofDocumentIds: proofs.filter((p) => p.status === 'done' && p.id).map((p) => p.id),
          emailVerificationToken: emailToken,
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
      <ScrollView style={{ backgroundColor: theme.colors.background }} contentContainerStyle={{ paddingBottom: bottomInset }}>
        <AuthHeader title="Application submitted" subtitle="Your shelter is now awaiting Developer verification." />
        <View style={{ padding: theme.spacing(2.5), gap: theme.spacing(2), width: '100%', maxWidth: COLUMN, alignSelf: 'center' }}>
          <Banner
            tone="success"
            icon="checkmark-circle"
            title={`${name} submitted for review`}
            message={`Your permit and ${proofs.length} proof ${proofs.length === 1 ? 'document' : 'documents'} will be verified with the local government. Once approved, your login credentials are emailed to ${email}.`}
          />
          <Banner
            tone="info"
            icon="time-outline"
            title="What happens next"
            message="1. The Developer checks your documents and verifies your permit with the city. 2. Your account is approved or rejected. 3. Approved shelters receive smart alerts for every report inside the operating radius you selected."
          />
          <Button label="Back to shelter login" onPress={() => navigation.navigate('ShelterLogin')} />
        </View>
      </ScrollView>
    );
  }

  return (
    <FormScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={{ paddingBottom: theme.spacing(4) + bottomInset }}
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
        <Field
          label="Official email"
          value={email}
          onChangeText={setEmail}
          placeholder="shelter@example.com"
          keyboardType="email-address"
          icon="mail-outline"
          hint="Any email provider works. Login credentials are emailed here once approved."
          error={errors.email}
        />
        <EmailVerifier
          email={email}
          purpose="register_shelter"
          token={emailToken}
          onVerified={setEmailToken}
          error={errors.emailCode}
        />
        <PhoneField label="Contact number" value={contact} onChangeText={setContact} error={errors.contact} />
        <Field label="House/Unit No. (optional)" value={houseUnitNo} onChangeText={setHouseUnitNo} placeholder="e.g. Blk 5 Lot 12" icon="location-outline" />
        <Field label="Street" value={street} onChangeText={setStreet} placeholder="e.g. Sampaguita St." icon="location-outline" error={errors.street} />
        <Field label="Subdivision/Village (optional)" value={subdivision} onChangeText={setSubdivision} placeholder="e.g. Greenfields Subdivision" icon="location-outline" />
        <Field label="Animal capacity" value={capacity} onChangeText={setCapacity} placeholder="e.g. 30" only="digits" maxLength={5} icon="albums-outline" error={errors.capacity} />

        <Select label="Barangay" value={barangay} options={SJDM_BARANGAY_NAMES} onChange={setBarangay} placeholder="Select the barangay" error={errors.barangay} />

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

        <ProofUploader files={proofs} onChange={setProofs} error={errors.proofs} />

        <Button label="Submit for verification" onPress={submit} loading={busy} variant="accent" icon="send-outline" />
        <Button label="Back to login" variant="ghost" onPress={() => navigation.goBack()} />
      </View>
    </FormScrollView>
  );
}
