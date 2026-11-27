import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { theme, reportKindStyle } from '@/constants/theme';
import {
  SJDM_ALL_BARANGAY_NAMES,
  SJDM_BARANGAYS,
  formatDistance,
  isWithinSJDM,
  nearestBarangay,
  uploadImage,
  useApp,
} from '@saanpaw/shared';
import type { AnimalReport, AnimalType, LatLng, ReportKind } from '@saanpaw/shared';
import { describeFix, locationService } from '@/services/locationService';
import { API_BASE_URL, apiRequest } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { AnimalChooser, LoadingOverlay, PhotoEditor, summarizeAnimal, type DescribedAnimal } from '@/components/domain/PhotoTools';
import { shrinkPhoto } from '@/services/photo';
import {
  loadGuestContact,
  rememberGuestReport,
  saveGuestContact,
  uploadGuestPhoto,
} from '@/services/guestReports';
import {
  AnimalPhoto,
  Banner,
  Button,
  Card,
  Caption,
  Choice,
  ErrorText,
  Field,
  PhoneField,
  Row,
  Screen,
  SectionHeader,
  Select,
} from '@/components/ui';
import { MapCanvas } from '@/components/map/MapCanvas';

/** The place label for a pin outside the city (only allowed while the geo-fence is off). */
const OUTSIDE_SJDM = 'Outside San Jose Del Monte';
import { AnimalTypeAndBreed, MatchCard, describeAnimal } from '@/components/domain';

/**
 * One form for both "Report Lost Pet" and "Report Found Animal".
 * Same fields either way; only the pet-name field, the wording, and what
 * happens after submitting differ. Lost reports get matched straight away.
 */
export function ReportForm({
  kind,
  navigation,
  guest = false,
}: {
  kind: ReportKind;
  navigation: { navigate: (screen: string, params?: object) => void; goBack: () => void };
  /**
   * Guest mode: no account. The reporter types their name and mobile number instead, the report
   * goes to the public guest endpoints, and the phone keeps the key to manage it later.
   */
  guest?: boolean;
}) {
  const { createReport, currentUser, reportById, shelterById, shelterAnimals, matchesForReport, lookupAddress, systemConfig } =
    useApp();
  // Follows the San Jose Del Monte geo-fence switch in System Management. On by default, so an
  // app that could not load the setting still keeps reports inside the city.
  const geoFenceOn = systemConfig?.geoFence ?? true;
  /** The pin's place: its nearest barangay inside the city; outside it, the server names the town. */
  const placeFor = (p: LatLng) => (isWithinSJDM(p.latitude, p.longitude) ? nearestBarangay(p).name : OUTSIDE_SJDM);
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
  // The barangay of where the pin starts, not simply the reporter's own barangay - the label
  // should always describe the pin.
  const [barangay, setBarangay] = useState<string | null>(() => nearestBarangay(currentUser.location).name);
  const [pin, setPin] = useState<LatLng>(currentUser.location);
  /** Bumped when the device location is tagged, so the map flies there by itself. */
  const [mapFocus, setMapFocus] = useState<{ center: LatLng; key: number } | null>(null);
  /** Street-level address of the pin: filled in from the map, then editable. */
  const [address, setAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const [addressLookup, setAddressLookup] = useState<'idle' | 'looking' | 'found' | 'none'>('idle');
  const lookupSeq = useRef(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<(AnimalReport & { notices?: string[] }) | null>(null);
  // Remounts AnimalTypeAndBreed on 'Submit another report' so its own internal picker state clears too.
  const [formKey, setFormKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  // Guest mode: who to contact about this report (remembered on the phone for next time).
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  useEffect(() => {
    if (!guest) return;
    void loadGuestContact().then((c) => {
      if (!c) return;
      setGuestName((v) => v || c.name);
      setGuestPhone((v) => v || c.phone);
    });
  }, [guest]);

  // ---- AI photo autofill
  const { token } = useAuth();
  /** Photos already sent to the server (local uri -> stored address), so submitting doesn't send them twice. */
  const [uploaded, setUploaded] = useState<Record<string, string>>({});
  const [aiTags, setAiTags] = useState<string[]>([]);
  const [autofill, setAutofill] = useState<{ busy: boolean; filled?: string; note?: string }>({ busy: false });
  const [chooser, setChooser] = useState<{ animals: DescribedAnimal[]; photo: string } | null>(null);
  const [editing, setEditing] = useState<number | null>(null);

  /** Where auto-tagging got to. */
  const [geo, setGeo] = useState<
    { state: 'idle' | 'locating' | 'tagged' | 'denied' | 'outside' | 'unavailable'; message?: string; note?: string }
  >({ state: 'idle' });

  const pinOutside = !isWithinSJDM(pin.latitude, pin.longitude);
  /** Only blocks submitting while the geo-fence is on. */
  const outOfArea = geoFenceOn && pinOutside;

  /**
   * Auto-tags the report with the device's location when the form opens.
   * Still overridable by tapping the map, since people often report from home
   * rather than from where the animal actually went missing.
   */
  const tagCurrentLocation = async (auto = false) => {
    setGeo({ state: 'locating' });
    try {
      const fix = await locationService.getCurrent();
      if (!fix) {
        setGeo({
          state: 'denied',
          message: auto
            ? `Location permission is off, so the pin starts at ${guest ? 'a default spot in the city' : 'your registered barangay'}. Tap the map to place it exactly.`
            : 'Location permission was denied. Enable it in your device settings, or tap the map to place the pin.',
        });
        return;
      }
      const position = { latitude: fix.latitude, longitude: fix.longitude };
      if (geoFenceOn && !isWithinSJDM(position.latitude, position.longitude)) {
        setGeo({
          state: 'outside',
          message:
            'Your device is outside San Jose Del Monte, so the pin was left in the city. Tap the map to mark where the animal was seen.',
        });
        return;
      }
      setPin(position);
      setBarangay(placeFor(position));
      setMapFocus({ center: position, key: Date.now() });
      // Indoors the GPS is weak: say when an earlier accurate position was used instead.
      setGeo({ state: 'tagged', note: describeFix(fix) ?? undefined });
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

  // Whenever the pin moves, look up the street address for the new spot (after a short pause, so
  // tapping around the map doesn't fire a lookup per tap). The reporter can still edit it.
  useEffect(() => {
    if (geoFenceOn && !isWithinSJDM(pin.latitude, pin.longitude)) {
      setAddressLookup('none');
      return;
    }
    const seq = ++lookupSeq.current;
    setAddressLookup('looking');
    const timer = setTimeout(async () => {
      const result = await lookupAddress(pin);
      if (seq !== lookupSeq.current) return; // the pin moved again meanwhile
      // The barangay itself is not taken from this address: San Jose Del Monte has no barangay
      // boundaries in OpenStreetMap, so its address names a nearby place that can be the wrong
      // barangay ("Fatima I" for a pin in Fatima V). The nearest barangay centre - set the moment
      // the pin moves - matches the map's own labels, so that stays.
      if (result?.address) {
        setAddress(result.address);
        setAddressLookup('found');
      } else {
        setAddressLookup('none');
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [pin, lookupAddress]);

  /**
   * Sends the photo to the server now (it is checked for an animal there) and asks the AI to read
   * it: the details below are filled in for the person to check and change. A photo with several
   * animals asks which one the report is about.
   */
  const readPhoto = async (uri: string) => {
    if (!token && !guest) return;
    setAutofill({ busy: true });
    try {
      const remote =
        uploaded[uri] ??
        (guest || !token ? await uploadGuestPhoto(uri) : await uploadImage({ baseUrl: API_BASE_URL, token, role: 'user' as const }, uri));
      setUploaded((u) => ({ ...u, [uri]: remote }));
      const res = await apiRequest<{ available: boolean; animals: DescribedAnimal[] }>(
        guest ? '/public/guest/describe' : '/ai/describe',
        { method: 'POST', body: JSON.stringify({ imageUrl: remote }) },
        guest ? undefined : token ?? undefined,
      );
      if (!res.available) {
        setAutofill({ busy: false, note: 'The AI is busy right now, so please fill in the details yourself.' });
      } else if (!res.animals.length) {
        setAutofill({ busy: false, note: 'The AI could not see an animal clearly in this photo. Fill in the details yourself, or try a clearer photo.' });
      } else if (res.animals.length === 1) {
        applyAnimal(res.animals[0]);
      } else {
        setAutofill({ busy: false });
        setChooser({ animals: res.animals, photo: uri });
      }
    } catch (e) {
      // The server refused the photo (e.g. no animal in it): take it off so it isn't submitted.
      setImages((prev) => prev.filter((u) => u !== uri));
      setAutofill({ busy: false });
      setErrors((er) => ({ ...er, images: e instanceof Error ? e.message : 'That photo could not be used. Try another one.' }));
    }
  };

  /** Fills the form from what the AI saw; anything already typed is kept. */
  const applyAnimal = (a: DescribedAnimal) => {
    setChooser(null);
    setAnimalType(a.animalType);
    if (a.breed && !breed.trim()) setBreed(a.breed);
    if (a.color && !color.trim()) setColor(a.color);
    if (a.sex !== 'unknown') setSex(a.sex);
    if (a.size) setSize(a.size);
    if (a.distinctMarks && !marks.trim()) setMarks(a.distinctMarks);
    // The ready-made description: physical features only, never a name - edit it freely.
    if (a.description && !description.trim()) setDescription(a.description);
    setAiTags(a.tags);
    setFormKey((k) => k + 1); // the breed picker shows the new breed
    setErrors((er) => ({ ...er, color: '' }));
    setAutofill({ busy: false, filled: summarizeAnimal(a) });
  };

  const pickImage = async (source: 'camera' | 'library' | 'scan') => {
    const perm =
      source === 'library'
        ? await ImagePicker.requestMediaLibraryPermissionsAsync()
        : await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setErrors((e) => ({ ...e, images: 'Permission denied. Allow photo access to attach an image.' }));
      return;
    }
    // allowsEditing shows the phone's own crop frame, so the photo can be cropped as it is added.
    const result =
      source === 'library'
        ? await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ['images'], allowsEditing: true })
        : await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: true });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const uri = await shrinkPhoto(asset.uri, asset.width);
      const first = images.length === 0;
      setImages((prev) => [...prev, uri].slice(0, 5));
      setErrors((e) => ({ ...e, images: '' }));
      // The first photo fills in the details automatically.
      if (first) void readPhoto(uri);
    }
  };

  /** A photo was edited (rotated, cropped...): the new copy replaces it and is sent again later. */
  const replacePhoto = (index: number, uri: string) => {
    setImages((prev) => prev.map((u, i) => (i === index ? uri : u)));
  };

  const submit = async () => {
    if (submitting) return;
    const next: Record<string, string> = {};
    if (!images.length) next.images = 'Attach at least one photo - matching is image-based.';
    if (!color.trim()) next.color = 'Describe the fur color - this drives the match score.';
    if (!barangay) next.barangay = 'Select the barangay.';
    if (outOfArea) next.location = 'The pin is outside San Jose Del Monte.';
    if (guest) {
      if (guestName.trim().length < 2) next.guestName = 'Enter your name so people know who to ask for.';
      if (!/^\+639\d{9}$/.test(guestPhone)) next.guestPhone = 'Enter a complete 11-digit mobile number, e.g. 09171234567.';
    }
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    setSubmitting(true);
    try {
      if (guest) {
        // Photos the AI already read were sent then; the rest go now.
        const imageUrls: string[] = [];
        for (const u of images) imageUrls.push(uploaded[u] ?? (await uploadGuestPhoto(u)));
        const report = await apiRequest<AnimalReport & { notices?: string[]; guestKey: string }>(`/public/guest/reports/${kind}`, {
          method: 'POST',
          body: JSON.stringify({
            reporterName: guestName.trim(),
            reporterPhone: guestPhone,
            name: kind === 'lost' ? name.trim() : undefined,
            animalType,
            breed: breed.trim() || undefined,
            color: color.trim(),
            sex,
            size,
            distinctMarks: marks.trim() || undefined,
            description: description.trim() || undefined,
            imageUrls,
            aiTags: aiTags.length ? aiTags : undefined,
            barangay: barangay!,
            location: pin,
            address: address.trim() || undefined,
            landmark: landmark.trim() || undefined,
          }),
        });
        await saveGuestContact({ name: guestName.trim(), phone: guestPhone });
        await rememberGuestReport({
          kind,
          id: report.id,
          key: report.guestKey,
          title: describeAnimal(report),
          at: new Date().toISOString(),
        });
        setSubmitted({ ...report, imageUrls: images });
        return;
      }
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
        // Photos the AI already read were sent then; the rest go now.
        imageUrls: images.map((u) => uploaded[u] ?? u),
        aiTags: aiTags.length ? aiTags : undefined,
        barangay: barangay!,
        location: pin,
        address: address.trim() || undefined,
        landmark: landmark.trim() || undefined,
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
    const matches = guest ? [] : matchesForReport(submitted.id);
    return (
      <Screen>
        <Banner
          tone="success"
          icon="checkmark-circle"
          title="Report submitted"
          message={
            kind === 'lost'
              ? `Your report (${describeAnimal(submitted)}) is now visible to every shelter whose operating radius covers ${submitted.barangay}, and to nearby users.`
              : `Thank you. Shelters covering ${submitted.barangay} have been alerted, and owners searching for a matching pet will see this report.`
          }
        />

        {(submitted.notices ?? []).map((n) => (
          <Banner key={n} tone="warning" icon="copy-outline" title="Heads up" message={n} />
        ))}

        <Card>
          <Row gap={1.5} align="flex-start">
            <AnimalPhoto uri={submitted.imageUrls[0]} size={80} tint={style.soft} iconColor={style.color} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.successTitle}>
                {describeAnimal(submitted)}
              </Text>
              <Caption>Reference {submitted.id.toUpperCase()}</Caption>
              <Caption>
                {submitted.address || `Brgy. ${submitted.barangay}`} · reported just now
              </Caption>
            </View>
          </Row>
        </Card>

        {guest ? (
          <Banner
            tone="info"
            icon="call-outline"
            title="People will contact you by phone"
            message={`Shelters and SaanPaw users can see your number (0${guestPhone.slice(3)}) on this report. You can mark it as resolved or delete it from "My guest reports". Create a free account to also get alerts and see possible matches.`}
          />
        ) : null}

        {kind === 'lost' && !guest ? (
          <>
            <SectionHeader title={`Possible matches (${matches.length})`} />
            {matches.length ? (
              matches.map((m) => {
                const candidate = m.candidateSource === 'found_report' ? reportById(m.candidateId) : undefined;
                // A shelter-animal match names the shelter that actually has the animal.
                const animal =
                  m.candidateSource === 'shelter_animal' ? shelterAnimals.find((a) => a.id === m.candidateId) : undefined;
                const shelter = animal ? shelterById(animal.shelterId) : undefined;
                return (
                  <MatchCard
                    key={m.id}
                    sourceLabel={m.candidateSource === 'found_report' ? 'Found report' : 'Shelter animal'}
                    title={candidate ? describeAnimal(candidate) : animal ? animal.name : 'Animal in shelter care'}
                    subtitle={
                      candidate
                        ? `${candidate.barangay} · reported by ${candidate.reporterName}`
                        : shelter?.name ?? 'Shelter record'
                    }
                    imageUri={candidate?.imageUrls[0] ?? animal?.imageUrls[0]}
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

        <Button
          label="View report"
          icon="document-text-outline"
          onPress={() =>
            guest
              ? navigation.navigate('PublicReport', { kind: submitted.kind, id: submitted.id })
              : navigation.navigate('ReportDetail', { reportId: submitted.id })
          }
        />
        <Button
          label={guest ? 'Back to browsing' : 'Back to dashboard'}
          variant="secondary"
          onPress={() => navigation.navigate(guest ? 'GuestHome' : 'HomeTabs')}
        />
        {guest ? (
          <Button label="Create a free account" variant="ghost" icon="person-add-outline" onPress={() => navigation.navigate('UserRegister')} />
        ) : null}
        <Button
          label="Submit another report"
          variant="ghost"
          onPress={() => {
            // A clean form: every detail of the last animal is cleared (the pin stays where it was).
            setSubmitted(null);
            setFormKey((k) => k + 1);
            setImages([]);
            setName('');
            setAnimalType('dog');
            setBreed('');
            setColor('');
            setSex('unknown');
            setSize('medium');
            setMarks('');
            setDescription('');
            setLandmark('');
            setErrors({});
            setAiTags([]);
            setUploaded({});
            setAutofill({ busy: false });
          }}
        />
      </Screen>
    );
  }

  // ---- form

  return (
    <Screen>
      <Banner
        tone={kind === 'lost' ? 'danger' : 'success'}
        icon={kind === 'lost' ? 'alert-circle' : 'paw'}
        title={kind === 'lost' ? 'Report a lost pet' : 'Report a found animal'}
        message={
          kind === 'lost'
            ? 'Shelters covering your location are alerted immediately, and the system matches your photo against every open found report.'
            : 'Describe the stray or animal you found. Owners searching for a missing pet will be matched against this report automatically.'
        }
      />

      {guest ? (
        <>
          <SectionHeader title="Your contact details" />
          <Card>
            <Caption>
              No account needed. Your name and mobile number are shown on the report so the owner, finder or a
              shelter can call or text you. This phone remembers them for your next report.
            </Caption>
            <Field
              label="Your name"
              value={guestName}
              onChangeText={setGuestName}
              placeholder="e.g. Juan"
              icon="person-outline"
              maxLength={60}
              error={errors.guestName}
            />
            {/* The same 11-digit Philippine mobile field as registration: it can't take more digits. */}
            <PhoneField value={guestPhone} onChangeText={setGuestPhone} error={errors.guestPhone} />
          </Card>
        </>
      ) : null}

      <SectionHeader title="Photos" />
      <Card>
        <Caption>
          Attach up to 5 clear photos. The image recognition matcher uses fur color, markings, and
          build - a full-body shot in good light works best.
        </Caption>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {images.map((uri, i) => (
            <Pressable key={uri + i} onPress={() => setEditing(i)} accessibilityLabel={`Edit photo ${i + 1}`}>
              <AnimalPhoto uri={uri} size={88} />
              <View style={styles.editBadge}>
                <Ionicons name="create-outline" size={12} color="#fff" />
              </View>
              <Pressable style={styles.removePhoto} onPress={() => setImages((p) => p.filter((_, idx) => idx !== i))}>
                <Ionicons name="close" size={13} color="#fff" />
              </Pressable>
            </Pressable>
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
              <Pressable style={styles.addPhoto} onPress={() => pickImage('scan')}>
                <Ionicons name="scan-outline" size={21} color={theme.colors.primary} />
                <Text style={styles.addPhotoText}>Scan poster</Text>
              </Pressable>
            </>
          ) : null}
        </ScrollView>
        <Caption>Tap a photo to rotate, flip or crop it. "Scan poster" takes a picture of a printed missing-pet poster or photo and lets you crop it.</Caption>
        {autofill.filled ? (
          <Banner
            tone="success"
            icon="sparkles"
            title="Details filled in from the photo"
            message={`The AI saw: ${autofill.filled}. Check every field below and change anything that is wrong.`}
          />
        ) : null}
        {autofill.note ? <Banner tone="warning" icon="sparkles-outline" title="Fill in the details" message={autofill.note} /> : null}
        {images.length ? (
          <Button
            label={autofill.filled ? 'Read the first photo again' : 'Fill in details from photo'}
            icon="sparkles-outline"
            variant="secondary"
            onPress={() => void readPhoto(images[0])}
          />
        ) : null}
        <ErrorText error={errors.images} />
      </Card>

      <SectionHeader title="Animal details" />
      <Card>
        {kind === 'lost' ? (
          <Field
            label="Pet name (optional)"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Bruno"
            icon="pricetag-outline"
            maxLength={40}
            hint="Many pets share a name, so reports are described and matched by features (colour, markings, size), not by name."
            error={errors.name}
          />
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

        <AnimalTypeAndBreed key={formKey} animalType={animalType} breed={breed} onBreedChange={setBreed} />
        <Field
          label="Fur Color"
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
          hint="Unique marks raise the match confidence more than anything else."
        />

        <Field
          label={kind === 'lost' ? 'Description - features, and where and when it was last seen' : 'Description - features and circumstances'}
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
            tone={geo.note ? 'warning' : 'success'}
            icon="location"
            title={geo.note ? 'Location tagged from your last accurate position' : 'Location tagged automatically'}
            message={geo.note ?? `Your device placed the pin in ${barangay}. Tap the map if the animal was seen somewhere else.`}
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
          options={SJDM_ALL_BARANGAY_NAMES}
          onChange={(b) => {
            setBarangay(b);
            const found = SJDM_BARANGAYS.find((x) => x.name === b);
            if (found) {
              setPin(found.center);
              setMapFocus({ center: found.center, key: Date.now() });
            }
          }}
          error={errors.barangay}
        />
        <Caption>Tap the map to move the pin to the exact spot.</Caption>
        <MapCanvas
          height={250}
          initialCenter={pin}
          initialZoom={14}
          markers={[{ id: 'pin', coordinate: pin, kind, label: barangay ?? 'Selected location' }]}
          selectedMarkerId="pin"
          focus={mapFocus}
          onPickLocation={(point) => {
            setPin(point);
            // The label follows the pin: the barangay whose centre is nearest the spot - never a
            // city barangay for a spot outside the city (a pin in Marilao is not in Muzon West).
            setBarangay(placeFor(point));
          }}
        />
        <Field
          label="Specific address"
          value={address}
          onChangeText={setAddress}
          placeholder="House no., street, subdivision"
          icon="home-outline"
          hint={
            addressLookup === 'looking'
              ? 'Looking up the address of the pin…'
              : addressLookup === 'found'
                ? 'Filled in from the map pin. Correct it or add a house number if needed.'
                : 'Type the street, subdivision or house number where the animal was seen.'
          }
        />
        <Field
          label="Nearby landmark (optional)"
          value={landmark}
          onChangeText={setLandmark}
          placeholder="e.g. beside the chapel, across the 7-Eleven"
          icon="flag-outline"
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
        ) : pinOutside ? (
          <Banner
            tone="warning"
            icon="information-circle"
            title="Outside San Jose Del Monte"
            message="The city geo-fence is switched off, so this report is accepted. Its place is named from the map pin when you submit."
          />
        ) : null}
      </Card>

      <Button
        label={kind === 'lost' ? 'Submit lost pet report' : 'Submit found animal report'}
        variant={kind === 'lost' ? 'danger' : 'found'}
        icon="send"
        loading={submitting}
        onPress={submit}
      />
      {errors.submit ? <Banner tone="danger" icon="warning" title="Could not submit" message={errors.submit} /> : null}
      <Button label="Cancel" variant="ghost" onPress={() => navigation.goBack()} />
      <AnimalChooser
        open={Boolean(chooser)}
        animals={chooser?.animals ?? []}
        photoUri={chooser?.photo}
        onChoose={applyAnimal}
        onClose={() => setChooser(null)}
      />
      <PhotoEditor
        uri={editing !== null ? images[editing] ?? null : null}
        onDone={(uri) => editing !== null && replacePhoto(editing, uri)}
        onRemove={() => editing !== null && setImages((p) => p.filter((_, i) => i !== editing))}
        onClose={() => setEditing(null)}
      />
      <LoadingOverlay visible={autofill.busy} message="Reading the photo and filling in the details…" />
      <LoadingOverlay visible={submitting} message="Sending your report…" />
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
  editBadge: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10,
    padding: 3,
  },
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
