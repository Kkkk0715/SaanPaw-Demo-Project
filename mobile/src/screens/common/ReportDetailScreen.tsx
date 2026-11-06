import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  caseStatusMeta,
  distanceMeters,
  formatDistance,
  reportPlace,
  reportStatusMeta,
  timeAgo,
  useApp,
} from '@saanpaw/shared';
import { theme, reportKindStyle } from '@/constants/theme';
import { AnimalPhoto, Badge, Button, Caption, Card, EmptyState, Row, Screen, SectionHeader } from '@/components/ui';
import { MapCanvas } from '@/components/map/MapCanvas';
import { describeAnimal } from '@/components/domain';
import { useAuth } from '@/context/AuthContext';

/**
 * Everything about one report on a single page - what tapping a notification opens, instead of
 * the Map tab. Photos, the animal's details, where and when it was seen, how far that is, who
 * reported it and how to reach them, whether a shelter has taken it on, and the next step.
 */
export function ReportDetailScreen({ route, navigation }: NativeStackScreenProps<any>) {
  const reportId = (route.params as { reportId?: string } | undefined)?.reportId;
  const { role } = useAuth();
  const { reportById, currentUser, currentShelter, caseForReport, shelterById } = useApp();
  const report = reportId ? reportById(reportId) : undefined;

  if (!report) {
    return (
      <Screen>
        <Card>
          <EmptyState
            icon="document-text-outline"
            title="This report is no longer available"
            message="It may have been closed, resolved or removed since the notification was sent."
            action="Back"
            onAction={() => navigation.goBack()}
          />
        </Card>
      </Screen>
    );
  }

  const isShelter = role === 'shelter_admin';
  const kind = reportKindStyle[report.kind];
  const status = reportStatusMeta[report.status];
  const own = !isShelter && report.reporterId === currentUser.id;
  const from = isShelter ? currentShelter.location : currentUser.location;
  const meters = distanceMeters(from, report.location);
  const animalCase = caseForReport(report.id);
  const caseShelter = animalCase ? shelterById(animalCase.shelterId) : undefined;

  const details = [
    ['Animal', report.animalType],
    ['Breed', report.breed],
    ['Fur color', report.color],
    ['Size', report.size],
    ['Sex', report.sex !== 'unknown' ? report.sex : undefined],
    ['Distinct marks', report.distinctMarks],
  ].filter((row): row is [string, string] => Boolean(row[1]));

  return (
    <Screen>
      <AnimalPhoto uri={report.imageUrls[0]} size="full" tint={kind.soft} iconColor={kind.color} />
      {report.imageUrls.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {report.imageUrls.slice(1).map((uri) => (
            <AnimalPhoto key={uri} uri={uri} size={64} tint={kind.soft} iconColor={kind.color} />
          ))}
        </ScrollView>
      ) : null}

      <Card>
        <Row gap={0.75}>
          <Badge label={kind.label} color={kind.color} soft={kind.soft} icon="paw" />
          <Badge label={status.label} color={status.color} soft={status.soft} />
          {own ? <Badge label="Your report" /> : null}
        </Row>
        <Text style={styles.title}>{describeAnimal(report)}</Text>
        {report.description ? <Text style={styles.body}>{report.description}</Text> : null}
        <View style={styles.kv}>
          {details.map(([label, value]) => (
            <View key={label} style={styles.kvRow}>
              <Text style={styles.kvLabel}>{label}</Text>
              <Text style={styles.kvValue}>{value}</Text>
            </View>
          ))}
        </View>
      </Card>

      <SectionHeader title={report.kind === 'lost' ? 'Last seen' : 'Where it was found'} />
      <Card>
        <Row gap={0.5} align="flex-start">
          <Ionicons name="location" size={15} color={kind.color} style={{ marginTop: 2 }} />
          <Text style={[styles.body, { flex: 1 }]}>{reportPlace(report)}</Text>
        </Row>
        <Caption>
          {formatDistance(meters)} from {isShelter ? 'your shelter' : 'your registered location'} · reported{' '}
          {timeAgo(report.reportedAt)}
        </Caption>
        <MapCanvas
          height={200}
          initialCenter={report.location}
          initialZoom={15}
          markers={[
            { id: report.id, coordinate: report.location, kind: report.kind, label: describeAnimal(report) },
            isShelter
              ? { id: 'shelter', coordinate: currentShelter.location, kind: 'shelter', label: currentShelter.name }
              : { id: 'me', coordinate: currentUser.location, kind: 'me', label: 'You' },
          ]}
          selectedMarkerId={report.id}
        />
        {!isShelter ? (
          <Button
            label="Show on the map"
            icon="map-outline"
            variant="secondary"
            onPress={() => navigation.navigate('HomeTabs', { screen: 'Map', params: { focusReportId: report.id } })}
          />
        ) : null}
      </Card>

      {animalCase ? (
        <>
          <SectionHeader title="Shelter case" />
          <Card>
            <Row gap={0.75}>
              <Badge
                label={caseStatusMeta[animalCase.status].label}
                color={caseStatusMeta[animalCase.status].color}
                soft={caseStatusMeta[animalCase.status].soft}
              />
            </Row>
            <Caption>
              {caseShelter?.name ?? 'A shelter'} took this report on {timeAgo(animalCase.openedAt)}; last updated{' '}
              {timeAgo(animalCase.updatedAt)}.
            </Caption>
          </Card>
        </>
      ) : null}

      {!own ? (
        <>
          <SectionHeader title="Reported by" />
          <Card>
            <Text style={styles.body}>{report.reporterName}</Text>
            {report.reporterPhone ? (
              <Button
                label={`Call ${report.reporterPhone}`}
                icon="call-outline"
                variant="secondary"
                onPress={() => void Linking.openURL(`tel:${report.reporterPhone}`)}
              />
            ) : (
              <Caption>No contact number on this report.</Caption>
            )}
          </Card>
        </>
      ) : null}

      {own ? (
        <>
          {report.kind === 'lost' ? (
            <Button
              label="See possible matches"
              icon="images-outline"
              onPress={() => navigation.navigate('ImageRecognition', { reportId: report.id })}
            />
          ) : null}
          <Button label="Manage my reports" variant="secondary" icon="clipboard-outline" onPress={() => navigation.navigate('LostPetStatus')} />
        </>
      ) : null}

      {isShelter ? (
        <Button
          label={animalCase ? 'Open in Animal Reports' : 'Respond to this report'}
          icon="documents-outline"
          onPress={() => navigation.navigate('AnimalReports')}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...theme.type.h2, color: theme.colors.text },
  body: { ...theme.type.body, color: theme.colors.text },
  kv: { gap: 6 },
  kvRow: { flexDirection: 'row', gap: theme.spacing(1) },
  kvLabel: { ...theme.type.caption, color: theme.colors.textSoft, width: 110 },
  kvValue: { ...theme.type.bodyMedium, color: theme.colors.text, flex: 1, textTransform: 'capitalize' },
});
