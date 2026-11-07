import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
  Pager,
  Row,
  Screen,
  SectionHeader,
  Sheet,
  usePagination,
} from '@/components/ui';
import { CASE_ICONS, CaseStatusPill, ShelterAnimalCard, describeAnimal, timeAgo } from '@/components/domain';
import { RecoveryTracker } from '@/components/domain/RecoveryTracker';
import { caseStatusMeta, isCaseClosed, nextAnimalStatuses, nextCaseStatuses, reportPlace, useApp } from '@saanpaw/shared';
import type { AnimalCase, AnimalCaseStatus, AnimalReport } from '@saanpaw/shared';
import { confirmAsync } from '@/services/confirm';

const statusOptions = (from: AnimalCaseStatus) =>
  nextCaseStatuses(from).map((value) => ({ label: caseStatusMeta[value].label, value }));
const animalStatusOptions = (from: AnimalCaseStatus) =>
  nextAnimalStatuses(from).map((value) => ({ label: caseStatusMeta[value].label, value }));

/** What each outcome does, shown before it is confirmed. */
const OUTCOME_EFFECT: Partial<Record<AnimalCaseStatus, string>> = {
  recovered:
    'The animal moves to Shelter Animals as in your care, and the report leaves Animal Reports. Set Reunited or Adopted there later.',
  reunited: 'The report leaves Animal Reports and the animal is listed under Reunited in Shelter Animals.',
  adopted: 'The report leaves Animal Reports and the animal is listed under Adopted in Shelter Animals.',
  inconclusive: 'The report leaves Animal Reports and stops showing in report lists.',
};

/**
 * Shelter Admin Module - Case status: under recovery, then one outcome (reunited, adopted or
 * inconclusive). A case only moves forward: once it has an outcome it is closed and can't be
 * changed back, so a status can never loop. Covers both public reports and the shelter's own animals.
 */
export function AnimalStatusScreen({ navigation }: NativeStackScreenProps<any>) {
  const { cases, currentShelter, reportById, setCaseStatus, shelterAnimals, setShelterAnimalStatus } = useApp();

  const [editing, setEditing] = useState<AnimalCase | null>(null);
  const [status, setStatus] = useState<AnimalCaseStatus>('reunited');
  const [note, setNote] = useState('');
  const [tracking, setTracking] = useState<AnimalReport | null>(null);

  const myCases = cases
    .filter((c) => c.shelterId === currentShelter.id)
    .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
  const myAnimals = shelterAnimals.filter((a) => a.shelterId === currentShelter.id);
  const animalsInRecovery = myAnimals.filter((a) => !isCaseClosed(a.caseStatus));

  const casePage = usePagination(myCases);
  const animalPage = usePagination(myAnimals);

  const open = (c: AnimalCase) => {
    const next = nextCaseStatuses(c.status);
    if (!next.length) return;
    setEditing(c);
    setStatus(next[0]);
    setNote('');
  };

  const save = async () => {
    if (!editing) return;
    const label = caseStatusMeta[status].label;
    const ok = await confirmAsync({
      title: `Set this case to "${label}"?`,
      message: `${OUTCOME_EFFECT[status] ?? ''} The reporter is notified, and the case can't be changed back afterwards.`.trim(),
      confirmLabel: 'Yes',
      cancelLabel: 'No',
    });
    if (!ok) return;
    setCaseStatus(editing.id, status, note.trim() || `Status set to ${label.toLowerCase()}.`);
    setEditing(null);
  };

  const setAnimalStatus = async (animalId: string, name: string, next: AnimalCaseStatus) => {
    const label = caseStatusMeta[next].label;
    const ok = await confirmAsync({
      title: `Mark ${name} as "${label}"?`,
      message: "This is final - the status can't be changed back afterwards.",
      confirmLabel: 'Yes',
      cancelLabel: 'No',
    });
    if (ok) setShelterAnimalStatus(animalId, next);
  };

  return (
    <Screen>
      <Banner
        tone="info"
        icon="pulse"
        title="Case status management"
        message="A case moves from Under recovery to one outcome, and the reporter is notified. 'Recovered' means the animal is now in your care: it moves to Shelter Animals, where you set Reunited or Adopted later. Every outcome takes the report off Animal Reports."
      />

      <SectionHeader title={`Recovery cases (${myCases.length})`} />
      <Caption>Cases opened in response to public lost and found reports.</Caption>

      {myCases.length ? (
        casePage.items.map((c) => {
          const report = reportById(c.reportId);
          const meta = caseStatusMeta[c.status];
          const closed = isCaseClosed(c.status);
          return (
            <Card key={c.id}>
              <Row gap={1.5} align="flex-start">
                <AnimalPhoto uri={report?.imageUrls[0]} size={68} tint={meta.soft} iconColor={meta.color} />
                <View style={{ flex: 1, gap: 5 }}>
                  <Text style={styles.caseTitle}>{report ? describeAnimal(report) : 'Unknown animal'}</Text>
                  <Caption>
                    {report ? reportPlace(report) : 'Unknown location'} · reported by {report?.reporterName ?? 'a user'}
                  </Caption>
                  <CaseStatusPill status={c.status} />
                  <Caption>Updated {timeAgo(c.updatedAt)}</Caption>
                </View>
              </Row>

              <View style={styles.timeline}>
                {c.timeline.map((t, i) => (
                  <Row key={i} gap={0.75} align="flex-start">
                    <Ionicons name={CASE_ICONS[t.status]} size={13} color={caseStatusMeta[t.status].color} style={{ marginTop: 2 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.timelineNote}>{t.note}</Text>
                      <Caption>{timeAgo(t.at)}</Caption>
                    </View>
                  </Row>
                ))}
              </View>

              {closed ? (
                <Row gap={0.75}>
                  <Ionicons name="lock-closed-outline" size={14} color={theme.colors.muted} />
                  <Caption>Case closed as {meta.label.toLowerCase()} - its status can no longer change.</Caption>
                </Row>
              ) : (
                <Row gap={1} style={{ flexWrap: 'wrap' }}>
                  {report ? (
                    <Button label="Track on map" icon="navigate-outline" variant="secondary" full={false} onPress={() => setTracking(report)} />
                  ) : null}
                  <Button label="Update case status" icon="create-outline" full={false} onPress={() => open(c)} />
                </Row>
              )}
            </Card>
          );
        })
      ) : (
        <Card>
          <EmptyState
            icon="pulse-outline"
            title="No open cases"
            message="Respond to a report from Animal Reports to open a recovery case here."
            action="Animal reports"
            onAction={() => navigation.navigate('AnimalReports')}
          />
        </Card>
      )}
      <Pager {...casePage} />

      <SectionHeader title={`Animals in care (${myAnimals.length})`} />
      <Caption>Set the outcome for animals recorded directly in your shelter database.</Caption>

      {animalPage.items.map((a) => (
        <ShelterAnimalCard key={a.id} animal={a} right={null} />
      ))}
      <Pager {...animalPage} />

      {animalsInRecovery.length ? (
        <Card>
          <Caption>Set an outcome - animals still under recovery</Caption>
          {animalsInRecovery.map((a) => (
            <View key={a.id} style={styles.quickRow}>
              <Text style={styles.quickName} numberOfLines={1}>
                {a.name}
              </Text>
              <Choice
                options={animalStatusOptions(a.caseStatus)}
                value={null}
                onChange={(v) => {
                  if (a.id.startsWith('pending-')) return; // still saving
                  void setAnimalStatus(a.id, a.name, v as AnimalCaseStatus);
                }}
              />
            </View>
          ))}
        </Card>
      ) : null}

      <Sheet open={Boolean(editing)} onClose={() => setEditing(null)} title="Update case status">
        {editing ? (
          <Choice label="Outcome" options={statusOptions(editing.status)} value={status} onChange={(v) => setStatus(v as AnimalCaseStatus)} />
        ) : null}
        <Field
          label="Note for the reporter"
          value={note}
          onChangeText={setNote}
          placeholder="e.g. Owner verified via image match. Released to the family."
          multiline
        />
        <Button label="Save and notify reporter" icon="send-outline" onPress={() => void save()} />
      </Sheet>

      <Sheet open={Boolean(tracking)} onClose={() => setTracking(null)} title="Where the report came from">
        {tracking ? <RecoveryTracker shelter={currentShelter} report={tracking} /> : null}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  caseTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  timeline: {
    gap: 7,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.sm,
    padding: theme.spacing(1.25),
  },
  timelineNote: { fontSize: 12.5, lineHeight: 18, color: theme.colors.textSoft },
  quickRow: { gap: 6, paddingVertical: theme.spacing(0.75) },
  quickName: { fontSize: 13.5, fontWeight: '700', color: theme.colors.text },
});
