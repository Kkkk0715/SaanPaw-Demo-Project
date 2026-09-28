import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { theme, reportKindStyle } from '@/constants/theme';
import {
  SJDM_BARANGAY_NAMES,
  SJDM_BARANGAYS,
  formatDistance,
  isWithinSJDM,
  nearestBarangay,
  useApp,
} from '@saanpaw/shared';
import type { AnimalReport, AnimalType, LatLng, ReportKind } from '@saanpaw/shared';
import { locationService } from '@/services/locationService';
import { shrinkPhoto } from '@/services/photo';
import {
  AnimalPhoto,
  Banner,
  Button,
  Card,
  Caption,
  Choice,
  Field,
  Row,
  Screen,
  SectionHeader,
  Select,
} from '@/components/ui';
import { MapCanvas } from '@/components/map/MapCanvas';
import { MatchCard, describeAnimal } from '@/components/domain';

/**
 * One form for both "Report Lost Pet" and "Report Found Animal".
 * Same fields either way; only the pet-name field, the wording, and what
 * happens after submitting differ. Lost reports get matched straight away.
 */
export function ReportForm({
  kind,
  navigation,
}: {
  kind: ReportKind;
  navigation: { navigate: (screen: string, params?: object) => void; goBack: () => void };
}) {
  const { createReport, currentUser, reportById, shelterById, matchesForReport } = useApp();
  const style = reportKindStyle[kind];

  const [images, setImages] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [animalType, setAnimalType] = useState<AnimalType>('dog');
  const [breed, setBreed] = useState('');
  const [color, setColor] = useState('');
  const [sex, setSex] = useState<AnimalReport['sex']>('unknown');
  const [size, setSize] = useState<AnimalReport['size']>('medium');
  const [marks, setMarks] = useState('');
  const [description, setDescription] = useState('');
  const [barangay, setBarangay] = useState<string | null>(currentUser.barangay);
  const [pin, setPin] = useState<LatLng>(currentUser.location);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<AnimalReport | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /** Where auto-tagging got to. */
  const [geo, setGeo] = useState<
    { state: 'idle' | 'locating' | 'tagged' | 'denied' | 'outside' | 'unavailable'; message?: string }
  >({ state: 'idle' });

  const outOfArea = !isWithinSJDM(pin.latitude, pin.longitude);

  /**
   * Auto-tags the report with the device's location when the form opens.
   * Still overridable by tapping the map, since people often report from home
   * rather than from where the animal actually went missing.
   */
  const tagCurrentLocation = async (auto = false) => {
    setGeo({ state: 'locating' });
    try {
      const position = await locationService.getCurrent();
      if (!position) {
        setGeo({
          state: 'denied',
          message: auto
            ? 'Location permission is off, so the pin starts at your registered barangay. Tap the map to place it exactly.'
            : 'Location permission was denied. Enable it in your device settings, or tap the map to place the pin.',
        });
        return;
      }
      if (!isWithinSJDM(position.latitude, position.longitude)) {
        setGeo({
          state: 'outside',
          message:
            'Your device is outside San Jose Del Monte, so the pin was left in the city. Tap the map to mark where the animal was seen.',
        });
        return;
      }
      setPin(position);
      setBarangay(nearestBarangay(position).name);
      setGeo({ state: 'tagged' });
    } catch {
      setGeo({
        state: 'unavailable',
        message: 'Could not read your location. Tap the map to place the pin instead.',
      });
    }
  };

  useEffect(() => {
    void tagCurrentLocation(true);
    // Once, on open.
  }, []);

  const pickImage = async (source: 'camera' | 'library') => {
    const perm =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setErrors((e) => ({ ...e, images: 'Permission denied. Allow photo access to attach an image.' }));
      return;
    }
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ['images'] });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const uri = await shrinkPhoto(asset.uri, asset.width);
      setImages((prev) => [...prev, uri].slice(0, 5));
      setErrors((e) => ({ ...e, images: '' }));
    }
  };

  const submit = async () => {
    if (submitting) return;
    const next: Record<string, string> = {};
    if (!images.length) next.images = 'Attach at least one photo - matching is image-based.';
    if (kind === 'lost' && !name.trim()) next.name = "Enter your pet's name.";
    if (!color.trim()) next.color = 'Describe the coat colour - this drives the match score.';
    if (!barangay) next.barangay = 'Select the barangay.';
    if (outOfArea) next.location = 'The pin is outside San Jose Del Monte.';
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    setSubmitting(true);
    try {
      const report = await createReport({
        kind,
        name: kind === 'lost' ? name.trim() : undefined,
        animalType,
        breed: breed.trim() || undefined,
        color: color.trim(),
        sex,
        size,
        distinctMarks: marks.trim() || undefined,
        description: description.trim() || undefined,
        imageUrls: images,
        barangay: barangay!,
        location: pin,
      });
      setSubmitted(report);
    } catch (e) {
      setErrors({ submit: e instanceof Error ? e.message : 'Something went wrong. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  // ---- after submitting: confirmation plus any matches found

  if (submitted) {
    const matches = matchesForReport(submitted.id);
    return (
      <Screen>
        <Banner
          tone="success"
          icon="checkmark-circle"
          title="Report submitted"
          message={
            kind === 'lost'
              ? `${submitted.name} is now visible to every shelter whose operating radius covers ${submitted.barangay}, and to nearby users.`
              : `Thank you. Shelters covering ${submitted.barangay} have been alerted, and owners searching for a matching pet will see this report.`
          }
        />

        <Card>
          <Row gap={1.5} align="flex-start">
            <AnimalPhoto uri={submitted.imageUrls[0]} size={80} tint={style.soft} iconColor={style.color} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.successTitle}>
                {describeAnimal(submitted)}
              </Text>
              <Caption>Reference {submitted.id.toUpperCase()}</Caption>
              <Caption>
                {submitted.barangay} · reported just now
              </Caption>
            </View>
          </Row>
        </Card>

        {kind === 'lost' ? (
          <>
            <SectionHeader title={`Possible matches (${matches.length})`} />
            {matches.length ? (
              matches.map((m) => {
                const candidate = reportById(m.candidateId);
                const shelter = candidate ? undefined : shelterById('s1');
                return (
                  <MatchCard
                    key={m.id}
                    sourceLabel={m.candidateSource === 'found_report' ? 'Found report' : 'Shelter animal'}
                    title={
                      candidate
                        ? describeAnimal(candidate)
                        : 'Animal in shelter care'
                    }
                    subtitle={
                      candidate
                        ? `${candidate.barangay} · reported by ${candidate.reporterName}`
                        : shelter?.name ?? 'Shelter record'
                    }
                    imageUri={candidate?.imageUrls[0]}
                    score={m.score}
                    reasons={m.reasons}
                  />
                );
              })
            ) : (
              <Card>
                <Text style={styles.noMatch}>
                  No candidate matched yet. You will get a smart alert the moment a matching found
                  report or shelter intake is posted inside your area.
                </Text>
              </Card>
            )}
          </>
        ) : null}

        <Button label="Back to dashboard" onPress={() => navigation.navigate('HomeTabs')} />
        <Button
          label="Submit another report"
          variant="secondary"
          onPress={() => {
            setSubmitted(null);
            setImages([]);
            setName('');
            setBreed('');
            setColor('');
            setMarks('');
            setDescription('');
          }}
        />
      </Screen>
    );
  }

  // ---- form

  return (
    <Screen>
      <Banner
        tone={kind === 'lost' ? 'danger' : 'warning'}
        icon={kind === 'lost' ? 'alert-circle' : 'paw'}
        title={kind === 'lost' ? 'Report a lost pet' : 'Report a found animal'}
        message={
          kind === 'lost'
            ? 'Shelters covering your location are alerted immediately, and the system matches your photo against every open found report.'
            : 'Describe the stray or animal you found. Owners searching for a missing pet will be matched against this report automatically.'
        }
      />

      <SectionHeader title="Photos" />
      <Card>
        <Caption>
          Attach up to 5 clear photos. The image recognition matcher uses coat colour, markings, and
          build - a full-body shot in good light works best.
        </Caption>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {images.map((uri, i) => (
            <View key={uri + i}>
              <AnimalPhoto uri={uri} size={88} />
              <Pressable style={styles.removePhoto} onPress={() => setImages((p) => p.filter((_, idx) => idx !== i))}>
                <Ionicons name="close" size={13} color="#fff" />
              </Pressable>
            </View>
          ))}
          {images.length < 5 ? (
            <>
              <Pressable style={styles.addPhoto} onPress={() => pickImage('library')}>
                <Ionicons name="images-outline" size={21} color={theme.colors.primary} />
                <Text style={styles.addPhotoText}>Gallery</Text>
              </Pressable>
              <Pressable style={styles.addPhoto} onPress={() => pickImage('camera')}>
                <Ionicons name="camera-outline" size={21} color={theme.colors.primary} />
                <Text style={styles.addPhotoText}>Camera</Text>
              </Pressable>
            </>
          ) : null}
        </ScrollView>
        {errors.images ? <Text style={styles.error}>{errors.images}</Text> : null}
      </Card>

      <SectionHeader title="Animal details" />
      <Card>
        {kind === 'lost' ? (
          <Field label="Pet name" value={name} onChangeText={setName} placeholder="e.g. Bruno" icon="pricetag-outline" error={errors.name} />
        ) : null}

        <Choice
          label="Animal type"
          options={[
            { label: 'Dog', value: 'dog', icon: 'paw' },
            { label: 'Cat', value: 'cat', icon: 'logo-octocat' },
            { label: 'Other', value: 'other', icon: 'help-circle' },
          ]}
          value={animalType}
          onChange={setAnimalType}
        />

        <Field label="Breed (if known)" value={breed} onChangeText={setBreed} placeholder="e.g. Aspin, Shih Tzu, Puspin" icon="ribbon-outline" />
        <Field
          label="Coat colour"
          value={color}
          onChangeText={setColor}
          placeholder="e.g. brown with white chest"
          icon="color-palette-outline"
          error={errors.color}
        />

        <Choice
          label="Sex"
          options={[
            { label: 'Male', value: 'male' },
            { label: 'Female', value: 'female' },
            { label: 'Unknown', value: 'unknown' },
          ]}
          value={sex ?? 'unknown'}
          onChange={(v) => setSex(v as AnimalReport['sex'])}
        />

        <Choice
          label="Size"
          options={[
            { label: 'Small', value: 'small' },
            { label: 'Medium', value: 'medium' },
            { label: 'Large', value: 'large' },
          ]}
          value={size ?? 'medium'}
          onChange={(v) => setSize(v as AnimalReport['size'])}
        />

        <Field
          label="Distinct markings"
          value={marks}
          onChangeText={setMarks}
          placeholder="e.g. torn left ear, red collar with a bell"
          icon="sparkles-outline"
          hint="Unique marks raise the match confidence more than anything else."
        />

        <Field
          label={kind === 'lost' ? 'Where and when was it last seen?' : 'Circumstances'}
          value={description}
          onChangeText={setDescription}
          placeholder={
            kind === 'lost'
              ? 'e.g. Nawala kaninang umaga sa may palengke. Friendly, sumasama sa tao.'
              : 'e.g. Nakita sa may highway, mukhang takot at gutom.'
          }
          multiline
        />
      </Card>

      <SectionHeader title="Location" />
      <Card>
        {geo.state === 'tagged' ? (
          <Banner
            tone="success"
            icon="location"
            title="Location tagged automatically"
            message={`Your device placed the pin in ${barangay}. Tap the map if the animal was seen somewhere else.`}
          />
        ) : null}
        {geo.message ? (
          <Banner
            tone="warning"
            icon="location-outline"
            title="Automatic location unavailable"
            message={geo.message}
          />
        ) : null}

        <Button
          label={geo.state === 'locating' ? 'Getting your location...' : 'Use my current location'}
          variant="secondary"
          icon="locate"
          loading={geo.state === 'locating'}
          onPress={() => tagCurrentLocation(false)}
        />

        <Select
          label="Barangay"
          value={barangay}
          options={SJDM_BARANGAY_NAMES}
          onChange={(b) => {
            setBarangay(b);
            const found = SJDM_BARANGAYS.find((x) => x.name === b);
            if (found) setPin(found.center);
          }}
          hint={errors.barangay}
        />
        <Caption>Tap the map to move the pin to the exact spot.</Caption>
        <MapCanvas
          height={250}
          initialCenter={pin}
          initialZoom={14}
          markers={[{ id: 'pin', coordinate: pin, kind, label: barangay ?? 'Selected location' }]}
          selectedMarkerId="pin"
          onPickLocation={(point) => {
            setPin(point);
            // Keep the barangay in step with the pin.
            if (isWithinSJDM(point.latitude, point.longitude)) {
              setBarangay(nearestBarangay(point).name);
            }
          }}
        />
        <Row gap={0.5}>
          <Ionicons name="navigate-outline" size={13} color={theme.colors.muted} />
          <Caption>
            {pin.latitude.toFixed(5)}, {pin.longitude.toFixed(5)} ·{' '}
            {formatDistance(
              Math.round(
                Math.hypot(
                  (pin.latitude - currentUser.location.latitude) * 111_320,
                  (pin.longitude - currentUser.location.longitude) * 107_000,
                ),
              ),
            )}{' '}
            from your registered area
          </Caption>
        </Row>
        {outOfArea ? (
          <Banner
            tone="danger"
            icon="warning"
            title="Outside the service area"
            message="SaanPaw only accepts reports inside San Jose Del Monte, Bulacan. Move the pin back inside the city."
          />
        ) : null}
      </Card>

      <Button
        label={kind === 'lost' ? 'Submit lost pet report' : 'Submit found animal report'}
        variant={kind === 'lost' ? 'danger' : 'accent'}
        icon="send"
        loading={submitting}
        onPress={submit}
      />
      {errors.submit ? <Banner tone="danger" icon="warning" title="Could not submit" message={errors.submit} /> : null}
      <Button label="Cancel" variant="ghost" onPress={() => navigation.goBack()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  addPhoto: {
    width: 88,
    height: 88,
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: theme.colors.primaryFaint,
  },
  addPhotoText: { fontSize: 11, fontWeight: '600', color: theme.colors.primary },
  removePhoto: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 21,
    height: 21,
    borderRadius: 11,
    backgroundColor: theme.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.colors.surface,
  },
  error: { fontSize: 12, color: theme.colors.danger, fontWeight: '600' },
  successTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  noMatch: { fontSize: 13, lineHeight: 19, color: theme.colors.muted },
});
