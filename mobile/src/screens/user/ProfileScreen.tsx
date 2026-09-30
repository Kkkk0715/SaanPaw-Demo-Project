import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { RADIUS_OPTIONS, SJDM_BARANGAYS, SJDM_BARANGAY_NAMES, formatDistance, useApp } from '@saanpaw/shared';
import { theme } from '@/constants/theme';
import {
  AnimalPhoto,
  Button,
  Card,
  Caption,
  Choice,
  Field,
  ListRow,
  PhoneField,
  Row,
  Screen,
  SectionHeader,
  Select,
  Sheet,
} from '@/components/ui';
import { confirmAsync } from '@/services/confirm';
import { shrinkPhoto } from '@/services/photo';
import { useAuth } from '@/context/AuthContext';

/** User Module - Account details, alert radius, and sign out. */
export function UserProfileScreen({ navigation }: BottomTabScreenProps<any>) {
  const { currentUser, updateUserProfile, myReports, notificationsFor } = useApp();
  const { signOut } = useAuth();

  const [editing, setEditing] = useState(false);
  const [photo, setPhoto] = useState(currentUser.photoUrl);
  const [firstName, setFirstName] = useState(currentUser.firstName);
  const [middleName, setMiddleName] = useState(currentUser.middleName ?? '');
  const [lastName, setLastName] = useState(currentUser.lastName);
  const [phone, setPhone] = useState(currentUser.phone);
  const [barangay, setBarangay] = useState(currentUser.barangay);
  const [error, setError] = useState<string | null>(null);

  const openEditor = () => {
    setPhoto(currentUser.photoUrl);
    setFirstName(currentUser.firstName);
    setMiddleName(currentUser.middleName ?? '');
    setLastName(currentUser.lastName);
    setPhone(currentUser.phone);
    setBarangay(currentUser.barangay);
    setError(null);
    setEditing(true);
  };

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ['images'] });
    if (!res.canceled && res.assets[0]) setPhoto(await shrinkPhoto(res.assets[0].uri, res.assets[0].width));
  };

  const save = () => {
    if (!firstName.trim() || !lastName.trim()) {
      setError('Enter your first and last name.');
      return;
    }
    if (phone.length !== 13) {
      setError('Enter a complete mobile number.');
      return;
    }
    const center = SJDM_BARANGAYS.find((b) => b.name === barangay)?.center;
    updateUserProfile({
      photoUrl: photo,
      firstName: firstName.trim(),
      middleName: middleName.trim(),
      lastName: lastName.trim(),
      phone,
      barangay,
      location: center,
    });
    setEditing(false);
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

  const activeReports = myReports.filter((r) => r.status !== 'closed').length;
  const unread = notificationsFor('user').filter((n) => !n.isRead).length;

  return (
    <Screen padded={false}>
      <View style={styles.hero}>
        <Pressable style={styles.editBtn} onPress={openEditor} hitSlop={8}>
          <Ionicons name="create-outline" size={18} color={theme.colors.onPrimary} />
        </Pressable>

        <AnimalPhoto uri={currentUser.photoUrl} size={74} radius={37} tint="rgba(255,255,255,0.18)" iconColor="#fff" />
        <Text style={styles.name}>{currentUser.fullName}</Text>
        <Text style={styles.email}>{currentUser.email}</Text>

        <View style={styles.heroStats}>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{myReports.length}</Text>
            <Text style={styles.heroStatLabel}>Reports</Text>
          </View>
          <View style={styles.heroDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{activeReports}</Text>
            <Text style={styles.heroStatLabel}>Active</Text>
          </View>
          <View style={styles.heroDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{unread}</Text>
            <Text style={styles.heroStatLabel}>Unread</Text>
          </View>
        </View>
      </View>

      <View style={styles.body}>
        <SectionHeader title="Your details" action="Edit" onAction={openEditor} />
        <Card>
          <Row gap={1.25}>
            <Ionicons name="location" size={17} color={theme.colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Barangay</Text>
              <Caption>{currentUser.barangay}, San Jose Del Monte</Caption>
            </View>
          </Row>
          <Row gap={1.25}>
            <Ionicons name="call" size={17} color={theme.colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Mobile number</Text>
              <Caption>{currentUser.phone}</Caption>
            </View>
          </Row>
          <Row gap={1.25}>
            <Ionicons name="calendar" size={17} color={theme.colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Member since</Text>
              <Caption>{new Date(currentUser.joinedAt).toLocaleDateString()}</Caption>
            </View>
          </Row>
        </Card>

        <SectionHeader title="Alert radius" />
        <Card>
          <Caption>
            You are told about lost and found animals reported within this distance of{' '}
            {currentUser.barangay}.
          </Caption>
          <Choice
            options={RADIUS_OPTIONS.map((r) => ({ label: r.label, value: r.meters }))}
            value={currentUser.alertRadiusMeters}
            onChange={(m) => updateUserProfile({ alertRadiusMeters: m })}
          />
          <Caption>
            Currently {formatDistance(currentUser.alertRadiusMeters)}. Changes apply straight away.
          </Caption>
        </Card>

        <SectionHeader title="Shortcuts" />
        <ListRow
          icon="clipboard"
          title="My reports"
          subtitle={`${myReports.length} submitted`}
          onPress={() => navigation.navigate('LostPetStatus')}
        />
        <ListRow
          icon="home"
          title="Shelters"
          subtitle="Browse shelters and message them"
          iconColor={theme.colors.info}
          iconSoft={theme.colors.infoSoft}
          onPress={() => navigation.navigate('ShelterView')}
        />

        <View style={{ height: theme.spacing(1) }} />
        <Button label="Sign out" variant="danger" icon="log-out-outline" onPress={handleSignOut} />

        <Caption style={{ textAlign: 'center', marginTop: theme.spacing(1) }}>
          SaanPaw · San Jose Del Monte, Bulacan
        </Caption>
      </View>

      <Sheet open={editing} onClose={() => setEditing(false)} title="Edit profile">
        <View style={{ gap: theme.spacing(1.5) }}>
          <Row gap={1.5} align="flex-start">
            <AnimalPhoto uri={photo} size={72} />
            <View style={{ flex: 1 }}>
              <Button label="Change photo" variant="secondary" icon="camera-outline" onPress={pickPhoto} />
            </View>
          </Row>
          <Field label="First name" value={firstName} onChangeText={setFirstName} icon="person-outline" />
          <Field label="Middle name (optional)" value={middleName} onChangeText={setMiddleName} icon="person-outline" />
          <Field label="Last name" value={lastName} onChangeText={setLastName} icon="person-outline" />
          <PhoneField value={phone} onChangeText={setPhone} />
          <Select label="Barangay" value={barangay} options={SJDM_BARANGAY_NAMES} onChange={setBarangay} />
          {error ? <Caption style={{ color: theme.colors.danger }}>{error}</Caption> : null}
          <Button label="Save changes" icon="save-outline" onPress={save} />
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: theme.colors.primaryDark,
    alignItems: 'center',
    paddingTop: theme.spacing(3),
    paddingBottom: theme.spacing(2.5),
    paddingHorizontal: theme.spacing(2),
    borderBottomLeftRadius: theme.radius.xl,
    borderBottomRightRadius: theme.radius.xl,
  },
  editBtn: {
    position: 'absolute',
    top: theme.spacing(2),
    right: theme.spacing(2),
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { ...theme.type.h1, color: theme.colors.onPrimary, marginTop: theme.spacing(1.25) },
  email: { ...theme.type.caption, color: 'rgba(255,255,255,0.75)', marginTop: 2 },

  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing(2),
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing(1.25),
    alignSelf: 'stretch',
  },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatValue: { ...theme.type.h2, color: theme.colors.onPrimary },
  heroStatLabel: { ...theme.type.tiny, color: 'rgba(255,255,255,0.7)' },
  heroDivider: { width: 1, height: 26, backgroundColor: 'rgba(255,255,255,0.2)' },

  body: { padding: theme.spacing(2), gap: theme.spacing(1.5) },
  rowLabel: { ...theme.type.label, color: theme.colors.text },
});
