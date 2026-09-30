import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Text, View } from 'react-native';
import { theme } from '@/constants/theme';
import { RADIUS_OPTIONS, SJDM_BARANGAYS, SJDM_BARANGAY_NAMES, formatDistance, useApp } from '@saanpaw/shared';
import {
  AnimalPhoto,
  Badge,
  Banner,
  Button,
  Card,
  Caption,
  Choice,
  Field,
  KeyValue,
  PhoneField,
  Row,
  Screen,
  SectionHeader,
  Select,
} from '@/components/ui';
import { MapCanvas } from '@/components/map/MapCanvas';
import { confirmAsync } from '@/services/confirm';
import { shrinkPhoto } from '@/services/photo';
import { useAuth } from '@/context/AuthContext';

/**
 * Shelter Admin Module - Shelter details and contact info.
 * The operating radius set here decides which reports reach this shelter.
 */
export function ShelterProfileScreen() {
  const { currentShelter, updateShelterProfile, shelterAreaReports, changeShelterPassword } = useApp();
  const { signOut } = useAuth();

  const [photo, setPhoto] = useState(currentShelter.photoUrl);
  const [name, setName] = useState(currentShelter.name);
  const [houseUnitNo, setHouseUnitNo] = useState(currentShelter.houseUnitNo ?? '');
  const [street, setStreet] = useState(currentShelter.street ?? '');
  const [subdivision, setSubdivision] = useState(currentShelter.subdivision ?? '');
  const [contact, setContact] = useState(currentShelter.contactNumber);
  const [email, setEmail] = useState(currentShelter.email);
  const [capacity, setCapacity] = useState(String(currentShelter.capacity));
  const [occupancy, setOccupancy] = useState(String(currentShelter.currentOccupancy));
  const [barangay, setBarangay] = useState(currentShelter.barangay);
  const [radius, setRadius] = useState(currentShelter.operatingRadiusMeters);
  const [saved, setSaved] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const center = SJDM_BARANGAYS.find((b) => b.name === barangay)?.center ?? currentShelter.location;
  const coverage = shelterAreaReports().length;

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ['images'] });
    if (!res.canceled && res.assets[0]) setPhoto(await shrinkPhoto(res.assets[0].uri, res.assets[0].width));
  };

  const save = () => {
    updateShelterProfile({
      name: name.trim(),
      photoUrl: photo,
      houseUnitNo: houseUnitNo.trim(),
      street: street.trim(),
      subdivision: subdivision.trim(),
      contactNumber: contact.trim(),
      email: email.trim(),
      capacity: Number(capacity) || currentShelter.capacity,
      currentOccupancy: Number(occupancy) || 0,
      barangay,
      location: center,
      operatingRadiusMeters: radius,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const savePassword = async () => {
    setPasswordError(null);
    if (!currentPassword) {
      setPasswordError('Enter your current password.');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('Use at least 8 characters for the new password.');
      return;
    }
    setChangingPassword(true);
    try {
      await changeShelterPassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setPasswordSaved(true);
      setTimeout(() => setPasswordSaved(false), 2500);
    } catch (e) {
      setPasswordError(e instanceof Error ? e.message : 'Could not change your password.');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSignOut = async () => {
    const confirmed = await confirmAsync({
      title: 'Sign out',
      message: 'Are you sure you want to sign out?',
      confirmLabel: 'Sign out',
      destructive: true,
    });
    if (confirmed) signOut();
  };

  return (
    <Screen>
      {saved ? (
        <Banner tone="success" icon="checkmark-circle" title="Profile saved" message="Your changes are live across the app." />
      ) : null}

      <Card>
        <SectionHeader title="Verification" />
        <KeyValue label="Permit number" value={currentShelter.permitNumber} />
        <KeyValue label="Registered" value={new Date(currentShelter.registeredAt).toLocaleDateString()} />
        <Row gap={0.75}>
          <Caption>Status</Caption>
          <Badge label="Approved by Developer" icon="shield-checkmark" />
        </Row>
        <Caption>
          The permit number was verified with the San Jose Del Monte local government. Contact the
          Developer to change it.
        </Caption>
      </Card>

      <SectionHeader title="Shelter information" />
      <Card>
        <Row gap={1.5} align="flex-start">
          <AnimalPhoto uri={photo} size={72} />
          <View style={{ flex: 1 }}>
            <Button label="Change photo" variant="secondary" icon="camera-outline" onPress={pickPhoto} />
            <Caption>Shown to pet owners browsing shelters.</Caption>
          </View>
        </Row>
        <Field label="Shelter name" value={name} onChangeText={setName} icon="home-outline" />
        <Field label="House/Unit No. (optional)" value={houseUnitNo} onChangeText={setHouseUnitNo} icon="location-outline" />
        <Field label="Street" value={street} onChangeText={setStreet} icon="location-outline" />
        <Field label="Subdivision/Village (optional)" value={subdivision} onChangeText={setSubdivision} icon="location-outline" />
        <Select label="Barangay" value={barangay} options={SJDM_BARANGAY_NAMES} onChange={setBarangay} />
        <PhoneField label="Contact number" value={contact} onChangeText={setContact} />
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          icon="mail-outline"
          hint="Only Gmail addresses are accepted."
        />
        <Row gap={1} align="flex-start">
          <View style={{ flex: 1 }}>
            <Field label="Capacity" value={capacity} onChangeText={setCapacity} keyboardType="numeric" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Current occupancy" value={occupancy} onChangeText={setOccupancy} keyboardType="numeric" />
          </View>
        </Row>
      </Card>

      <SectionHeader title="Operating radius" />
      <Card>
        <Choice
          options={RADIUS_OPTIONS.map((r) => ({ label: r.label, value: r.meters }))}
          value={radius}
          onChange={setRadius}
          hint="You receive a smart alert for every lost and found report inside this circle."
        />
        <MapCanvas
          height={240}
          initialCenter={center}
          initialZoom={radius >= 10000 ? 11 : radius >= 5000 ? 12 : 13}
          radiusMeters={radius}
          radiusCenter={center}
          markers={[{ id: 'shelter', coordinate: center, kind: 'shelter', label: name }]}
        />
        <Text style={{ fontSize: 13, color: theme.colors.textSoft }}>
          At {formatDistance(currentShelter.operatingRadiusMeters)} you currently cover{' '}
          <Text style={{ fontWeight: '700', color: theme.colors.primary }}>{coverage}</Text> open
          {coverage === 1 ? ' report' : ' reports'}.
        </Text>
      </Card>

      <Button label="Save profile" icon="save-outline" onPress={save} />

      <SectionHeader title="Change password" />
      <Card>
        {passwordSaved ? (
          <Banner tone="success" icon="checkmark-circle" title="Password changed" message="Use your new password next time you sign in." />
        ) : null}
        <Caption>Changes the password the Developer issued you when your shelter was approved.</Caption>
        <Field
          label="Current password"
          value={currentPassword}
          onChangeText={setCurrentPassword}
          placeholder="Your current password"
          secureTextEntry
          icon="lock-closed-outline"
        />
        <Field
          label="New password"
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder="At least 8 characters"
          secureTextEntry
          icon="key-outline"
        />
        {passwordError ? <Caption style={{ color: theme.colors.danger }}>{passwordError}</Caption> : null}
        <Button label="Change password" variant="secondary" icon="key-outline" loading={changingPassword} onPress={savePassword} />
      </Card>

      <Button label="Sign out" variant="secondary" icon="log-out-outline" onPress={handleSignOut} />
    </Screen>
  );
}
