import { uploadImage } from '@saanpaw/shared';
import { API_BASE_URL, apiRequest } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { shrinkPhoto } from '@/services/photo';
import { AnimalChooser, LoadingOverlay, summarizeAnimal, type DescribedAnimal } from '@/components/domain/PhotoTools';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { theme } from '@/constants/theme';
import {
  AnimalPhoto,
  Banner,
  Button,
  Card,
  Caption,
  Choice,
  EmptyState,
  Field,
  Row,
  Screen,
  SectionHeader,
} from '@/components/ui';
import { MatchCard, describeAnimal, timeAgo } from '@/components/domain';
import { useApp } from '@saanpaw/shared';
import { confirmAsync } from '@/services/confirm';
import type { AnimalReport, AnimalType } from '@saanpaw/shared';

/**
 * User Module - Image Recognition Matching.
 * Opened with a `reportId` it shows that report's saved matches; opened on its
 * own it runs a fresh search from a photo you pick.
 */
export function ImageRecognitionScreen({ route, navigation }: NativeStackScreenProps<any>) {
  const reportId = (route.params as { reportId?: string } | undefined)?.reportId;
  const { reportById, shelterById, matchesForReport, scanPhotoMatch, shelterAnimals, startConversation, currentUser } =
    useApp();

  const linkedReport = reportId ? reportById(reportId) : undefined;

  const [image, setImage] = useState<string | null>(linkedReport?.imageUrls[0] ?? null);
  const [animalType, setAnimalType] = useState<AnimalType>(linkedReport?.animalType ?? 'dog');
  const [color, setColor] = useState(linkedReport?.color ?? '');
  const [size, setSize] = useState<AnimalReport['size']>(linkedReport?.size ?? 'medium');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [results, setResults] = useState<Awaited<ReturnType<typeof scanPhotoMatch>> | null>(null);

  const storedMatches = linkedReport ? matchesForReport(linkedReport.id) : [];

  const { token } = useAuth();
  const [reading, setReading] = useState(false);
  const [readNote, setReadNote] = useState<string | null>(null);
  const [chooser, setChooser] = useState<DescribedAnimal[] | null>(null);
  /** The scanned photo as stored on the server, so matching doesn't upload it again. */
  const [remoteImage, setRemoteImage] = useState<string | null>(null);

  const applyAnimal = (a: DescribedAnimal) => {
    setChooser(null);
    setAnimalType(a.animalType);
    if (a.color) setColor(a.color);
    if (a.size) setSize(a.size);
    setReadNote(`The AI saw: ${summarizeAnimal(a)}. Check the details below before matching.`);
  };

  /** Scanning a photo reads the pet's details from it (type, colour, size), still editable. */
  const readDetails = async (uri: string) => {
    if (!token) return;
    setReading(true);
    setReadNote(null);
    try {
      const remote = await uploadImage({ baseUrl: API_BASE_URL, token, role: 'user' }, uri);
      setRemoteImage(remote);
      const res = await apiRequest<{ available: boolean; animals: DescribedAnimal[] }>(
        '/ai/describe',
        { method: 'POST', body: JSON.stringify({ imageUrl: remote }) },
        token,
      );
      if (!res.available) setReadNote('The AI is busy, so set the details below yourself.');
      else if (!res.animals.length) setReadNote('No animal was clear in this photo. Set the details yourself or try another photo.');
      else if (res.animals.length === 1) applyAnimal(res.animals[0]);
      else setChooser(res.animals);
    } catch (e) {
      setReadNote(e instanceof Error ? e.message : 'Could not read this photo.');
    } finally {
      setReading(false);
    }
  };

  const pick = async (source: 'library' | 'camera' = 'library') => {
    const perm = source === 'library' ? await ImagePicker.requestMediaLibraryPermissionsAsync() : await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const res =
      source === 'library'
        ? await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ['images'], allowsEditing: true })
        : await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: true });
    if (!res.canceled && res.assets[0]) {
      const uri = await shrinkPhoto(res.assets[0].uri, res.assets[0].width);
      setImage(uri);
      setResults(null);
      void readDetails(uri);
    }
  };

  const scan = async () => {
    setScanning(true);
    setScanError(null);
    setResults(null);
    try {
      const ranked = await scanPhotoMatch({
        animalType,
        color,
        size,
        // Where the pet was last seen, or (for a photo not tied to a report) where you are registered.
        location: linkedReport?.location ?? currentUser.location,
        photoUrl: remoteImage ?? image ?? undefined,
        lostReportId: linkedReport?.kind === 'lost' && linkedReport.reporterId === currentUser.id ? linkedReport.id : undefined,
      });
      setResults(ranked);
    } catch (e) {
      setScanError(e instanceof Error ? e.message : 'Could not run the match. Try again.');
    } finally {
      setScanning(false);
    }
  };

  const describe = (id: string, source: 'found_report' | 'shelter_animal' | 'lost_report') => {
    if (source === 'found_report' || source === 'lost_report') {
      const r = reportById(id);
      const lost = source === 'lost_report';
      return {
        title: r ? describeAnimal(r) : lost ? 'Lost pet report' : 'Found report',
        subtitle: r ? `${r.barangay} · ${lost ? 'lost' : 'found'} ${timeAgo(r.reportedAt)} · ${r.reporterName}` : '',
        image: r?.imageUrls[0],
        // A finder's scan can turn up someone's missing pet: that's the owner to contact.
        label: lost ? 'Missing pet - possible owner' : 'Found report',
        shelterId: undefined as string | undefined,
      };
    }
    const a = shelterAnimals.find((x) => x.id === id);
    const shelter = a ? shelterById(a.shelterId) : undefined;
    return {
      title: a?.name ?? 'Shelter animal',
      subtitle: shelter ? `${shelter.name} · intake ${a ? timeAgo(a.intakeDate) : ''}` : '',
      image: a?.imageUrls[0],
      label: 'Shelter animal',
      shelterId: shelter?.id,
    };
  };

  const renderMatch = (
    m: { candidateId: string; candidateSource: 'found_report' | 'shelter_animal' | 'lost_report'; score: number; reasons: string[] },
    key: string,
  ) => {
    const d = describe(m.candidateId, m.candidateSource);
    return (
      <MatchCard
        key={key}
        sourceLabel={d.label}
        title={d.title}
        subtitle={d.subtitle}
        imageUri={d.image}
        score={m.score}
        reasons={m.reasons}
        actions={
          <Row gap={1}>
            {d.shelterId ? (
              <Button
                label="Message shelter"
                variant="secondary"
                icon="chatbubble-ellipses-outline"
                full={false}
                style={{ flex: 1 }}
                onPress={() => {
                  const body = `Hello po, I think this animal might be my pet (${d.title}). Reference match confidence ${Math.round(m.score * 100)}%.`;
                  // This sends a message for you, so say what goes out before it does.
                  void confirmAsync({
                    title: 'Message this shelter?',
                    message: `This message will be sent:\n\n"${body}"`,
                    confirmLabel: 'Send',
                    cancelLabel: 'Cancel',
                  }).then((ok) => {
                    if (!ok) return;
                    startConversation(d.shelterId!, `Possible match: ${d.title}`, body);
                    navigation.navigate('ShelterView', { tab: 'messages' });
                  });
                }}
              />
            ) : (
              <Button
                label="View report"
                variant="secondary"
                icon="eye-outline"
                full={false}
                style={{ flex: 1 }}
                onPress={() => navigation.navigate('ReportDetail', { reportId: m.candidateId })}
              />
            )}
          </Row>
        }
      />
    );
  };

  return (
    <Screen>
      <Banner
        tone="success"
        icon="sparkles"
        title="Image recognition matching"
        message={
          linkedReport
            ? 'Your photo is compared against every open found report and every animal currently in shelter care within San Jose Del Monte.'
            : 'Found a stray? Your photo is compared against every missing-pet report, every open found report and every animal in shelter care in San Jose Del Monte. The same photo is always found first.'
        }
      />

      {linkedReport ? (
        <Card>
          <Caption>Matching against your report</Caption>
          <Row gap={1.5} align="flex-start">
            <AnimalPhoto uri={linkedReport.imageUrls[0]} size={64} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={styles.linkedTitle}>{linkedReport.name ?? linkedReport.animalType}</Text>
              <Caption>
                {[linkedReport.breed, linkedReport.color].filter(Boolean).join(' · ')}
              </Caption>
              <Caption>
                {linkedReport.barangay} · reported {timeAgo(linkedReport.reportedAt)}
              </Caption>
            </View>
          </Row>
        </Card>
      ) : null}

      {linkedReport ? (
        <>
          <SectionHeader title={`Possible matches (${storedMatches.length})`} />
          {storedMatches.length ? (
            storedMatches.map((m) => renderMatch(m, m.id))
          ) : (
            <Card>
              <EmptyState
                icon="sparkles-outline"
                title="No possible matches yet"
                message="Found reports and shelter animals with the same details show up here on their own. You can also scan a photo below."
              />
            </Card>
          )}
        </>
      ) : null}

      <SectionHeader title={linkedReport ? 'Scan a photo' : 'Photo to match'} />
      <Card>
        <Row gap={1.5} align="flex-start">
          {image ? (
            <AnimalPhoto uri={image} size={100} />
          ) : (
            <Pressable style={styles.dropZone} onPress={() => void pick()}>
              <Ionicons name="cloud-upload-outline" size={24} color={theme.colors.primary} />
              <Text style={styles.dropText}>Upload</Text>
            </Pressable>
          )}
          <View style={{ flex: 1, gap: 8 }}>
            <Caption>
              Use the clearest full-body photo you have. Colour and markings carry the most weight in
              the score.
            </Caption>
            <Button
              label={image ? 'Choose a different photo' : 'Choose a photo'}
              variant="secondary"
              icon="image-outline"
              onPress={() => void pick('library')}
            />
            <Button label="Scan with camera" variant="ghost" icon="scan-outline" onPress={() => void pick('camera')} />
          </View>
        </Row>
      </Card>

      {readNote ? <Banner tone="info" icon="sparkles" title="Details from the photo" message={readNote} /> : null}
      <AnimalChooser open={Boolean(chooser)} animals={chooser ?? []} photoUri={image ?? undefined} onChoose={applyAnimal} onClose={() => setChooser(null)} />
      <LoadingOverlay visible={reading} message="Scanning the photo for the pet's details…" />

      <SectionHeader title="Refine the search" />
      <Card>
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
        <Field
          label="Fur Color"
          value={color}
          onChangeText={setColor}
          placeholder="e.g. brown with white chest"
          icon="color-palette-outline"
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
      </Card>

      <Button
        label={scanning ? 'Analyzing photo...' : 'Run image match'}
        icon="scan-outline"
        loading={scanning}
        disabled={!image}
        onPress={scan}
      />
      {!image ? <Caption style={{ textAlign: 'center' }}>Upload a photo to enable matching.</Caption> : null}
      {scanError ? <Caption style={{ textAlign: 'center', color: theme.colors.danger }}>{scanError}</Caption> : null}

      {results ? (
        <>
          <SectionHeader title={`Results (${results.length})`} />
          {results.length ? (
            results.map((m) => renderMatch(m, `${m.candidateSource}-${m.candidateId}`))
          ) : (
            <Card>
              <EmptyState
                icon="search-outline"
                title="No candidates above the threshold"
                message="Nothing currently open matches this animal. You will get a smart alert as soon as a matching report is posted."
              />
            </Card>
          )}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  dropZone: {
    width: 100,
    height: 100,
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.primaryFaint,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  dropText: { fontSize: 12, fontWeight: '600', color: theme.colors.primary },
  linkedTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
});
