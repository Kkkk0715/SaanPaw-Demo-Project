import { useState } from 'react';
import { Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { theme } from '@/constants/theme';
import {
  Banner,
  Button,
  Card,
  Caption,
  EmptyState,
  Row,
  Screen,
  SectionHeader,
  Segmented,
  Pager,
  usePagination,
} from '@/components/ui';
import { ShelterAnimalCard, timeAgo } from '@/components/domain';
import { useApp } from '@saanpaw/shared';

/**
 * Shelter Admin Module - Post recovered animals publicly.
 * Publishing shows the animal to users and includes it in image matching
 * against open lost pet reports.
 */
export function RecoveredAnimalsScreen({ navigation }: NativeStackScreenProps<any>) {
  const { shelterAnimals, currentShelter, toggleAnimalPublic } = useApp();
  const [tab, setTab] = useState<'unposted' | 'posted'>('unposted');

  // Adopted and inconclusive animals are never shown to the public, so they are not offered for posting.
  const recovered = shelterAnimals.filter(
    (a) =>
      a.shelterId === currentShelter.id &&
      (a.intakeType === 'recovered' || a.intakeType === 'rescued') &&
      a.caseStatus !== 'adopted' &&
      a.caseStatus !== 'inconclusive',
  );
  const unposted = recovered.filter((a) => !a.postedPublicly);
  const posted = recovered.filter((a) => a.postedPublicly);
  const shown = tab === 'posted' ? posted : unposted;
  const page = usePagination(shown, undefined, tab);

  return (
    <Screen>
      <Banner
        tone="warning"
        icon="megaphone"
        title="Post the animals you recovered"
        message="Published animals appear to the public under Shelter View, and are automatically compared against every open lost pet report in the city."
      />

      <Segmented
        options={[
          { label: `Not posted (${unposted.length})`, value: 'unposted' },
          { label: `Posted (${posted.length})`, value: 'posted', color: theme.colors.accent },
        ]}
        value={tab}
        onChange={(v) => setTab(v as typeof tab)}
      />

      <SectionHeader title={tab === 'posted' ? 'Publicly visible' : 'Awaiting posting'} />

      {shown.length ? (
        page.items.map((a) => (
          <ShelterAnimalCard
            key={a.id}
            animal={a}
            actions={
              <Button
                label={a.postedPublicly ? 'Unpublish' : 'Post'}
                variant={a.postedPublicly ? 'ghost' : 'accent'}
                icon={a.postedPublicly ? 'eye-off-outline' : 'megaphone-outline'}
                full={false}
                onPress={() => toggleAnimalPublic(a.id)}
              />
            }
          />
        ))
      ) : (
        <Card>
          <EmptyState
            icon="megaphone-outline"
            title={tab === 'posted' ? 'Nothing posted yet' : 'Everything is posted'}
            message={
              tab === 'posted'
                ? 'Post a recovered animal so owners searching the app can find it.'
                : 'Every animal you recovered is already publicly visible. Add new intakes from Shelter Animals.'
            }
            action="Shelter animals"
            onAction={() => navigation.navigate('ShelterAnimals')}
          />
        </Card>
      )}
      <Pager {...page} />

      {posted.length ? (
        <Card>
          <Row gap={1} align="flex-start">
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ fontSize: 13.5, fontWeight: '700', color: theme.colors.text }}>
                Posting activity
              </Text>
              {posted.slice(0, 3).map((a) => (
                <Caption key={a.id}>
                  {a.name} · posted from {a.intakeType} intake {timeAgo(a.intakeDate)}
                </Caption>
              ))}
            </View>
          </Row>
        </Card>
      ) : null}
    </Screen>
  );
}
