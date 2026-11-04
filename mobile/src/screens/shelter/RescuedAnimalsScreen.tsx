import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { theme } from '@/constants/theme';
import {
  Banner,
  Button,
  Card,
  Caption,
  EmptyState,
  Pager,
  Screen,
  SectionHeader,
  Segmented,
  Sheet,
  usePagination,
} from '@/components/ui';
import { CaseStatusPill, ReportCard, ShelterAnimalCard, timeAgo } from '@/components/domain';
import { RecoveryTracker } from '@/components/domain/RecoveryTracker';
import { distanceMeters, useApp } from '@saanpaw/shared';
import type { AnimalCase, AnimalReport, ShelterAnimal } from '@saanpaw/shared';

type Group = 'all' | 'pets' | 'strays';
type Status = 'recovering' | 'all';

type Entry =
  | { kind: 'animal'; id: string; group: 'pets' | 'strays'; at: string; animal: ShelterAnimal }
  | { kind: 'case'; id: string; group: 'pets' | 'strays'; at: string; case: AnimalCase; report: AnimalReport };

/**
 * Shelter Admin Module - Rescued pets & strays, in one place.
 *
 * A pet is an animal someone owns: a lost-pet report this shelter took on, or an owner surrender.
 * A stray has no known owner: a found-animal report taken on, or an animal the shelter rescued or
 * recovered in the field. "Recovering" (the default) shows only what is still in progress.
 */
export function RescuedAnimalsScreen({ navigation }: NativeStackScreenProps<any>) {
  const { cases, shelterAnimals, currentShelter, reportById } = useApp();
  const [group, setGroup] = useState<Group>('all');
  const [status, setStatus] = useState<Status>('recovering');
  const [tracking, setTracking] = useState<AnimalReport | null>(null);

  const entries = useMemo<Entry[]>(() => {
    const fromAnimals: Entry[] = shelterAnimals
      .filter((a) => a.shelterId === currentShelter.id)
      .map((a) => ({
        kind: 'animal',
        id: a.id,
        group: a.intakeType === 'surrendered' ? 'pets' : 'strays',
        at: a.intakeDate,
        animal: a,
      }));
    const fromCases: Entry[] = cases
      .filter((c) => c.shelterId === currentShelter.id)
      .flatMap((c) => {
        const report = reportById(c.reportId);
        if (!report) return [];
        return [{ kind: 'case' as const, id: c.id, group: report.kind === 'lost' ? ('pets' as const) : ('strays' as const), at: c.updatedAt, case: c, report }];
      });
    return [...fromAnimals, ...fromCases].sort((a, b) => +new Date(b.at) - +new Date(a.at));
  }, [shelterAnimals, cases, currentShelter.id, reportById]);

  const isRecovering = (e: Entry) => (e.kind === 'animal' ? e.animal.caseStatus : e.case.status) === 'under_rescue';
  const inStatus = entries.filter((e) => (status === 'recovering' ? isRecovering(e) : true));
  const shown = inStatus.filter((e) => (group === 'all' ? true : e.group === group));
  const page = usePagination(shown, undefined, `${group}-${status}`);
  const count = (g: Group) => inStatus.filter((e) => (g === 'all' ? true : e.group === g)).length;

  return (
    <Screen>
      <Banner
        tone="info"
        icon="paw"
        title="Rescued pets & strays"
        message="Every animal your shelter is recovering: pets (from lost reports or owner surrenders) and strays (from found reports or rescues in the field)."
      />

      <Segmented
        options={[
          { label: `All (${count('all')})`, value: 'all' },
          { label: `Pets (${count('pets')})`, value: 'pets', color: theme.colors.danger },
          { label: `Strays (${count('strays')})`, value: 'strays', color: theme.colors.found },
        ]}
        value={group}
        onChange={(v) => setGroup(v as Group)}
      />
      <Segmented
        options={[
          { label: 'Still recovering', value: 'recovering', color: theme.colors.info },
          { label: 'Include closed', value: 'all' },
        ]}
        value={status}
        onChange={(v) => setStatus(v as Status)}
      />

      <SectionHeader title={`${shown.length} ${shown.length === 1 ? 'animal' : 'animals'}`} />

      {shown.length ? (
        page.items.map((e) =>
          e.kind === 'animal' ? (
            <ShelterAnimalCard key={e.id} animal={e.animal} />
          ) : (
            <ReportCard
              key={e.id}
              report={e.report}
              distance={distanceMeters(currentShelter.location, e.report.location)}
              footer={
                <View style={{ gap: theme.spacing(1) }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <CaseStatusPill status={e.case.status} />
                    <Caption>Case updated {timeAgo(e.case.updatedAt)}</Caption>
                  </View>
                  <Button label="Track on map" icon="navigate-outline" variant="secondary" onPress={() => setTracking(e.report)} />
                </View>
              }
            />
          ),
        )
      ) : (
        <Card>
          <EmptyState
            icon="paw-outline"
            title={status === 'recovering' ? 'Nothing being recovered' : 'No animals yet'}
            message="Respond to a report from Animal Reports, or add an animal to your shelter database, and it shows up here."
            action="Animal reports"
            onAction={() => navigation.navigate('AnimalReports')}
          />
        </Card>
      )}
      <Pager {...page} />

      <Text style={{ ...theme.type.caption, color: theme.colors.muted, textAlign: 'center' }}>
        Change a status from Case Status.
      </Text>

      <Sheet open={Boolean(tracking)} onClose={() => setTracking(null)} title="Where the report came from">
        {tracking ? <RecoveryTracker shelter={currentShelter} report={tracking} /> : null}
      </Sheet>
    </Screen>
  );
}
