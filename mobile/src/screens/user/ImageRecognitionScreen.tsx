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
import type { AnimalReport, AnimalType } from '@saanpaw/shared';

/**
 * User Module - Image Recognition Matching.
 * Opened with a `reportId` it shows that report's saved matches; opened on its
 * own it runs a fresh search from a photo you pick.
 */
export function ImageRecognitionScreen({ route, navigation }: NativeStackScreenProps<any>) {
  const reportId = (route.params as { reportId?: string } | undefined)?.reportId;
  const { reportById, shelterById, matchesForReport, scanPhotoMatch, shelterAnimals, startConversation } =
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

  const pick = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ['images'] });
    if (!res.canceled && res.assets[0]) {
      setImage(res.assets[0].uri);
      setResults(null);
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
        location: linkedReport?.location ?? { latitude: 14.8136, longitude: 121.0453 },
        photoUrl: image ?? undefined,
      });
      setResults(ranked);
    } catch (e) {
      setScanError(e instanceof Error ? e.message : 'Could not run the match. Try again.');
    } finally {
      setScanning(false);
    }
  };

  const describe = (id: string, source: 'found_report' | 'shelter_animal') => {
    if (source === 'found_report') {
      const r = reportById(id);
      return {
        title: r ? describeAnimal(r) : 'Found report',
        subtitle: r ? `${r.barangay} · found ${timeAgo(r.reportedAt)} · ${r.reporterName}` : '',
        image: r?.imageUrls[0],
        label: 'Found report',
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

  return (
    <Screen>
      <Banner
        tone="success"
        icon="sparkles"
        title="Image recognition matching"
        message="Your photo is compared against every open found report and every animal currently in shelter care within San Jose Del Monte."
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

      <SectionHeader title="Photo to match" />
      <Card>
        <Row gap={1.5} align="flex-start">
          {image ? (
            <AnimalPhoto uri={image} size={100} />
          ) : (
            <Pressable style={styles.dropZone} onPress={pick}>
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
              onPress={pick}
            />
          </View>
        </Row>
      </Card>

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
          label="Coat colour"
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
            results.map((m) => {
              const d = describe(m.candidateId, m.candidateSource);
              return (
                <MatchCard
                  key={`${m.candidateSource}-${m.candidateId}`}
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
                            startConversation(
                              d.shelterId!,
                              `Possible match: ${d.title}`,
                              `Hello po, I think this animal might be my pet. Reference match confidence ${Math.round(m.score * 100)}%.`,
                            );
                            navigation.navigate('ShelterView');
                          }}
                        />
                      ) : (
                        <Button
                          label="View report"
                          variant="secondary"
                          icon="eye-outline"
                          full={false}
                          style={{ flex: 1 }}
                          onPress={() => navigation.navigate('Search')}
                        />
                      )}
                    </Row>
                  }
                />
              );
            })
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
      ) : storedMatches.length ? (
        <>
          <SectionHeader title={`Saved matches (${storedMatches.length})`} />
          {storedMatches.map((m) => {
            const d = describe(m.candidateId, m.candidateSource);
            return (
              <MatchCard
                key={m.id}
                sourceLabel={d.label}
                title={d.title}
                subtitle={d.subtitle}
                imageUri={d.image}
                score={m.score}
                reasons={m.reasons}
              />
            );
          })}
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
