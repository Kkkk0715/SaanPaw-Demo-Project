import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { theme } from '@/constants/theme';
import {
  Badge,
  Banner,
  Button,
  Caption,
  Choice,
  EmptyState,
  Pager,
  Row,
  Screen,
  SectionHeader,
  Sheet,
  usePagination,
} from '@/components/ui';
import { confirmAsync, confirmDelete } from '@/services/confirm';
import { ReportCard, timeAgo } from '@/components/domain';
import { caseStatusMeta, reportStatusMeta, useApp } from '@saanpaw/shared';
import type { AnimalReport, ReportStatus } from '@saanpaw/shared';

/** A found-animal report is not "missing" - its wording follows the report kind. */
const statusLabel = (kind: AnimalReport['kind'], status: ReportStatus) =>
  kind === 'found'
    ? { active: 'Still unclaimed', matched: 'Possible owner', recovered: 'Returned to owner', closed: 'Closed' }[status]
    : { active: 'Still missing', matched: 'Possible match', recovered: 'Recovered', closed: 'Closed' }[status];

const STATUS_ICON = {
  active: 'search',
  matched: 'sparkles',
  recovered: 'heart',
  closed: 'close-circle',
} as const;

/**
 * User Module - Update the status of your own reports.
 * The shelter case timeline is shown underneath so the owner can follow a
 * recovery without leaving the screen.
 */
export function LostPetStatusScreen({ navigation }: NativeStackScreenProps<any>) {
  const { myReports, setReportStatus, deleteReport, caseForReport, matchesForReport } = useApp();
  const [editing, setEditing] = useState<AnimalReport | null>(null);
  const [draftStatus, setDraftStatus] = useState<ReportStatus>('active');
  const page = usePagination(myReports);

  const remove = async () => {
    const target = editing;
    if (!target) return;
    const ok = await confirmDelete(
      target.name ? `Your report for ${target.name}` : 'This report',
      'Any shelter case, match suggestions and messages about it are removed too. This cannot be undone.',
    );
    if (!ok) return;
    deleteReport(target.id);
    setEditing(null);
  };

  const openEditor = (report: AnimalReport) => {
    setEditing(report);
    setDraftStatus(report.status);
  };

  const apply = async () => {
    const target = editing;
    if (!target) return;
    if (draftStatus === target.status) {
      setEditing(null);
      return;
    }
    const label = statusLabel(target.kind, draftStatus);
    const effect: Record<ReportStatus, string> = {
      active: 'It shows as open again on the map and in nearby alerts.',
      matched: 'It stays open while you check the possible match.',
      recovered: 'It leaves the map and nearby alerts, and any shelter handling it is told.',
      closed: 'It leaves the map and nearby alerts, and any shelter handling it is told.',
    };
    const ok = await confirmAsync({
      title: `Mark this report as "${label}"?`,
      message: effect[draftStatus],
      confirmLabel: 'Yes',
      cancelLabel: 'No',
    });
    if (!ok) return;
    setReportStatus(target.id, draftStatus);
    setEditing(null);
  };

  if (!myReports.length) {
    return (
      <Screen>
        <EmptyState
          icon="clipboard-outline"
          title="You have not reported anything yet"
          message="Reports you submit - both lost pets and strays you found - are listed here so you can update their status."
          action="Report a lost pet"
          onAction={() => navigation.navigate('ReportLostPet')}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Banner
        tone="info"
        icon="information-circle"
        title="Keep your reports up to date"
        message="Marking a pet as recovered removes it from nearby alerts and tells any shelter handling it, keeping the map accurate for everyone."
      />

      <SectionHeader title={`My reports (${myReports.length})`} />

      {page.items.map((report) => {
        const linkedCase = caseForReport(report.id);
        const matchCount = matchesForReport(report.id).length;

        return (
          <ReportCard
            key={report.id}
            report={report}
            onPress={() => navigation.navigate('ReportDetail', { reportId: report.id })}
            footer={
              <View style={{ gap: theme.spacing(1) }}>
                {matchCount ? (
                  <Pressable onPress={() => navigation.navigate('ImageRecognition', { reportId: report.id })}>
                    <Row gap={0.5}>
                      <Ionicons name="sparkles" size={13} color={theme.colors.accent} />
                      <Text style={styles.matchLine}>
                        {matchCount} possible {matchCount === 1 ? 'match' : 'matches'} found · View
                      </Text>
                    </Row>
                  </Pressable>
                ) : null}

                {linkedCase ? (
                  <View style={styles.timeline}>
                    <Row gap={0.75}>
                      <Ionicons name="git-commit-outline" size={14} color={theme.colors.info} />
                      <Text style={styles.timelineHeading}>Shelter case</Text>
                      <Badge
                        label={caseStatusMeta[linkedCase.status].label}
                        color={caseStatusMeta[linkedCase.status].color}
                        soft={caseStatusMeta[linkedCase.status].soft}
                      />
                    </Row>
                    {linkedCase.timeline.map((t, i) => (
                      <View key={i} style={styles.timelineRow}>
                        <View style={styles.timelineDot} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.timelineNote}>{t.note}</Text>
                          <Caption>
                            {t.by} · {timeAgo(t.at)}
                          </Caption>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : null}

                <Row gap={1}>
                  <Button
                    label="Update status"
                    variant="secondary"
                    icon="create-outline"
                    full={false}
                    style={{ flex: 1 }}
                    onPress={() => openEditor(report)}
                  />
                  {matchCount ? (
                    <Button
                      label="View matches"
                      variant="primary"
                      icon="sparkles"
                      full={false}
                      style={{ flex: 1 }}
                      onPress={() => navigation.navigate('ImageRecognition', { reportId: report.id })}
                    />
                  ) : null}
                </Row>
              </View>
            }
          />
        );
      })}
      <Pager {...page} />

      <Sheet open={Boolean(editing)} onClose={() => setEditing(null)} title="Update report status">
        <Caption>
          {editing?.name ?? 'This report'} · reported {editing ? timeAgo(editing.reportedAt) : ''}
        </Caption>
        {/* A found-animal report is not "missing" - its wording follows the report kind. */}
        <Choice
          options={(['active', 'matched', 'recovered', 'closed'] as ReportStatus[]).map((value) => ({
            label: statusLabel(editing?.kind ?? 'lost', value),
            value,
            icon: STATUS_ICON[value],
            color: reportStatusMeta[value].color,
            soft: reportStatusMeta[value].soft,
          }))}
          value={draftStatus}
          onChange={(v) => setDraftStatus(v as ReportStatus)}
          hint={
            editing?.kind === 'found'
              ? 'Returned to owner notifies the shelters that responded and clears the report from nearby alerts.'
              : 'Recovered notifies the shelters that responded and clears the report from nearby alerts.'
          }
        />
        <Button
          label="Save status"
          onPress={() => void apply()}
          icon="checkmark"
          color={reportStatusMeta[draftStatus].color}
        />
        <Button
          label="Delete this report"
          variant="danger"
          icon="trash-outline"
          onPress={() => void remove()}
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  matchLine: { fontSize: 12.5, fontWeight: '700', color: theme.colors.accent },
  timeline: {
    backgroundColor: theme.colors.infoSoft,
    borderRadius: theme.radius.sm,
    padding: theme.spacing(1.25),
    gap: 8,
  },
  timelineHeading: { flex: 1, fontSize: 12.5, fontWeight: '700', color: theme.colors.info },
  timelineRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  timelineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.colors.info,
    marginTop: 5,
  },
  timelineNote: { fontSize: 12.5, lineHeight: 18, color: theme.colors.textSoft },
});
