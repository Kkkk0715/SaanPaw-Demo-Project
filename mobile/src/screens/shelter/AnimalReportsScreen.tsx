import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { theme } from '@/constants/theme';
import { caseStatusMeta, formatDistance, reportPlace, useApp } from '@saanpaw/shared';
import type { AnimalReport } from '@saanpaw/shared';
import {
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
import { ReportCard, describeAnimal } from '@/components/domain';
import { RecoveryTracker } from '@/components/domain/RecoveryTracker';
import { ReportFilterPanel, useReportFilters } from '@/components/domain/ReportFilters';

/**
 * Shelter Admin Module - Reports inside the shelter radius.
 * Responding opens a recovery case, tracked on the Animal Status screen. Reports whose case ended
 * as adopted or inconclusive are closed, so they no longer appear here.
 */
export function AnimalReportsScreen({ navigation }: NativeStackScreenProps<any>) {
  const { shelterAreaReports, currentShelter, openCase, caseForReport } = useApp();

  const f = useReportFilters();
  const [onlyUnhandled, setOnlyUnhandled] = useState<'all' | 'unhandled'>('all');
  const [responding, setResponding] = useState<AnimalReport | null>(null);
  const [note, setNote] = useState('');
  const [tracking, setTracking] = useState<AnimalReport | null>(null);

  const all = shelterAreaReports();
  const reports = useMemo(
    () =>
      f.apply(all).filter((r) => (onlyUnhandled === 'unhandled' ? !r.caseId : true)),
    [all, f, onlyUnhandled],
  );
  const page = usePagination(reports, undefined, `${f.resetKey}-${onlyUnhandled}`);

  const respond = () => {
    if (!responding) return;
    openCase(responding.id, note.trim() || 'Recovery team dispatched.');
    setResponding(null);
    setNote('');
  };

  return (
    <Screen>
      <Banner
        tone="info"
        icon="radio"
        title={`Reports within ${formatDistance(currentShelter.operatingRadiusMeters)}`}
        message={`Every open lost and found report inside ${currentShelter.name}'s operating radius appears here automatically, nearest first.`}
      />

      {/* Search (with AI), lost/found, date range, barangay or street, animal. */}
      <ReportFilterPanel f={f} />

      <Choice
        options={[
          { label: 'Everything', value: 'all' },
          { label: 'Not yet responded', value: 'unhandled' },
        ]}
        value={onlyUnhandled}
        onChange={(v) => setOnlyUnhandled(v as 'all' | 'unhandled')}
      />

      <SectionHeader title={`${reports.length} ${reports.length === 1 ? 'report' : 'reports'}`} />

      {reports.length ? (
        page.items.map((r) => {
          const linked = caseForReport(r.id);
          return (
            <ReportCard
              key={r.id}
              report={r}
              distance={r.distance}
              onPress={() => navigation.navigate('ReportDetail', { reportId: r.id })}
              footer={
                <View style={{ gap: theme.spacing(1) }}>
                  <Caption>
                    Reported by {r.reporterName}
                    {r.reporterPhone ? ` · ${r.reporterPhone}` : ''}
                  </Caption>
                  {linked ? (
                    <Row gap={1} style={{ flexWrap: 'wrap' }}>
                      <Button
                        label="Track on map"
                        variant="secondary"
                        color={theme.colors.info}
                        icon="navigate-outline"
                        full={false}
                        onPress={() => setTracking(r)}
                      />
                      <Button
                        label="View case status"
                        variant="secondary"
                        icon="pulse-outline"
                        full={false}
                        onPress={() => navigation.navigate('AnimalStatus')}
                      />
                    </Row>
                  ) : r.caseId ? (
                    // Another shelter already opened a case on this report.
                    <Row gap={0.75}>
                      <Ionicons name="people-outline" size={15} color={theme.colors.muted} />
                      <Caption>Another shelter is already handling this report.</Caption>
                    </Row>
                  ) : (
                    <Button
                      label="Respond and open a case"
                      icon="medkit-outline"
                      color={caseStatusMeta.under_rescue.color}
                      onPress={() => setResponding(r)}
                    />
                  )}
                </View>
              }
            />
          );
        })
      ) : (
        <Card>
          <EmptyState
            icon="documents-outline"
            title="No reports match"
            message={
              f.active
                ? 'No report matches this search. Clear the filters to see every report in your area.'
                : `Nothing open inside your ${formatDistance(currentShelter.operatingRadiusMeters)} radius. Widen the operating radius in your shelter profile to cover more of the city.`
            }
            action={f.active ? 'Clear filters' : 'Shelter profile'}
            onAction={() => (f.active ? f.clear() : navigation.navigate('ShelterProfile'))}
          />
        </Card>
      )}
      <Pager {...page} />

      <Sheet open={Boolean(responding)} onClose={() => setResponding(null)} title="Respond to report">
        <Caption>
          {responding
            ? `${describeAnimal(responding)} · ${reportPlace(responding)}`
            : ''}
        </Caption>
        <Text style={{ fontSize: 13, lineHeight: 19, color: theme.colors.textSoft }}>
          Opening a case sets the animal to "Under recovery" and notifies the reporter that your
          shelter has responded. You can then track the report's location from your shelter on the map.
        </Text>
        <Field
          label="Response note"
          value={note}
          onChangeText={setNote}
          placeholder="e.g. Recovery team dispatched to the location."
          multiline
        />
        <Button label="Open recovery case" icon="medkit" color={caseStatusMeta.under_rescue.color} onPress={respond} />
      </Sheet>

      <Sheet open={Boolean(tracking)} onClose={() => setTracking(null)} title="Where the report came from">
        {tracking ? <RecoveryTracker shelter={currentShelter} report={tracking} /> : null}
      </Sheet>
    </Screen>
  );
}
