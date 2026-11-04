import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, reportKindStyle } from '@/constants/theme';
import { distanceMeters, formatDistance, reportPlace, useApp } from '@saanpaw/shared';
import { Badge, Caption, Card, Choice, Row, SectionHeader } from '@/components/ui';
import { MapCanvas, type MapMarker } from '@/components/map/MapCanvas';
import { ReportCard, describeAnimal } from '@/components/domain';

type Filter = 'all' | 'lost' | 'found' | 'shelters';

/**
 * User Module - Map View.
 * Reports plotted across the city. The translucent circle is the alert radius.
 */
export function MapViewScreen() {
  const { reports, shelters, currentUser } = useApp();
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [radiusOnly, setRadiusOnly] = useState<'radius' | 'city'>('city');

  const visibleReports = useMemo(
    () =>
      reports
        .filter((r) => r.status !== 'closed')
        .filter((r) => (filter === 'lost' || filter === 'found' ? r.kind === filter : filter !== 'shelters'))
        .map((r) => ({ ...r, distance: distanceMeters(currentUser.location, r.location) }))
        .filter((r) => (radiusOnly === 'radius' ? r.distance <= currentUser.alertRadiusMeters : true))
        .sort((a, b) => a.distance - b.distance),
    [reports, filter, radiusOnly, currentUser],
  );

  const approvedShelters = shelters.filter((s) => s.approvalStatus === 'approved');

  const markers = useMemo<MapMarker[]>(() => {
    const reportPins: MapMarker[] =
      filter === 'shelters'
        ? []
        : visibleReports.map((r) => ({
            id: r.id,
            coordinate: r.location,
            kind: r.kind,
            label: `${describeAnimal(r)} - ${reportPlace(r)}`,
          }));

    const shelterPins: MapMarker[] =
      filter === 'all' || filter === 'shelters'
        ? approvedShelters.map((s) => ({
            id: s.id,
            coordinate: s.location,
            kind: 'shelter' as const,
            label: s.name,
          }))
        : [];

    return [
      ...reportPins,
      ...shelterPins,
      { id: 'me', coordinate: currentUser.location, kind: 'me', label: 'You' },
    ];
  }, [visibleReports, approvedShelters, filter, currentUser.location]);

  const selectedReport = visibleReports.find((r) => r.id === selected);
  const selectedShelter = approvedShelters.find((s) => s.id === selected);

  return (
    <View style={styles.root}>
      <View style={styles.controls}>
        <Choice
          options={[
            { label: 'All', value: 'all' },
            { label: 'Lost', value: 'lost' },
            { label: 'Found', value: 'found' },
            { label: 'Shelters', value: 'shelters' },
          ]}
          value={filter}
          onChange={(v) => {
            setFilter(v as Filter);
            setSelected(null);
          }}
        />
        <Choice
          options={[
            { label: 'Whole city', value: 'city' },
            { label: `My radius (${formatDistance(currentUser.alertRadiusMeters)})`, value: 'radius' },
          ]}
          value={radiusOnly}
          onChange={(v) => setRadiusOnly(v as 'radius' | 'city')}
        />
      </View>

      <MapCanvas
        height={330}
        initialCenter={currentUser.location}
        initialZoom={12}
        markers={markers}
        selectedMarkerId={selected}
        onMarkerPress={setSelected}
        radiusMeters={radiusOnly === 'radius' ? currentUser.alertRadiusMeters : undefined}
        radiusCenter={currentUser.location}
      />

      <View style={styles.legend}>
        <Row gap={0.5}>
          <View style={[styles.dot, { backgroundColor: reportKindStyle.lost.color }]} />
          <Text style={styles.legendText}>Lost</Text>
        </Row>
        <Row gap={0.5}>
          <View style={[styles.dot, { backgroundColor: reportKindStyle.found.color }]} />
          <Text style={styles.legendText}>Found</Text>
        </Row>
        <Row gap={0.5}>
          <View style={[styles.dot, { backgroundColor: theme.colors.primaryDarker }]} />
          <Text style={styles.legendText}>Shelter</Text>
        </Row>
        <Row gap={0.5}>
          <View style={[styles.dot, { backgroundColor: theme.colors.info }]} />
          <Text style={styles.legendText}>You</Text>
        </Row>
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {selectedShelter ? (
          <Card>
            <Row gap={0.75}>
              <Ionicons name="home" size={15} color={theme.colors.primary} />
              <Text style={styles.selTitle}>{selectedShelter.name}</Text>
            </Row>
            <Caption>{selectedShelter.address}</Caption>
            <Row gap={0.75}>
              <Badge label={`${selectedShelter.currentOccupancy}/${selectedShelter.capacity} animals`} />
              <Badge
                label={`${formatDistance(distanceMeters(currentUser.location, selectedShelter.location))} away`}
                color={theme.colors.info}
                soft={theme.colors.infoSoft}
              />
            </Row>
          </Card>
        ) : null}

        {selectedReport ? (
          <>
            <SectionHeader title="Selected pin" />
            <ReportCard report={selectedReport} distance={selectedReport.distance} />
          </>
        ) : null}

        <SectionHeader
          title={
            filter === 'shelters'
              ? `Shelters (${approvedShelters.length})`
              : `Reports on this map (${visibleReports.length})`
          }
        />
        {filter === 'shelters'
          ? approvedShelters.map((s) => (
              <Card key={s.id} onPress={() => setSelected(s.id)}>
                <Text style={styles.selTitle}>{s.name}</Text>
                <Caption>
                  {s.barangay} · {formatDistance(distanceMeters(currentUser.location, s.location))} away ·
                  operating radius {formatDistance(s.operatingRadiusMeters)}
                </Caption>
              </Card>
            ))
          : visibleReports
              .slice(0, 12)
              .map((r) => (
                <ReportCard
                  key={r.id}
                  report={r}
                  distance={r.distance}
                  onPress={() => setSelected(r.id)}
                />
              ))}

        {!visibleReports.length && filter !== 'shelters' ? (
          <Card>
            <Caption>
              No reports match this filter. Switch to "Whole city" or clear the filter to see more.
            </Caption>
          </Card>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  controls: { padding: theme.spacing(1.5), gap: theme.spacing(1), backgroundColor: theme.colors.surface },
  legend: {
    flexDirection: 'row',
    gap: theme.spacing(2),
    paddingHorizontal: theme.spacing(2),
    paddingVertical: theme.spacing(1),
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  dot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { fontSize: 11.5, color: theme.colors.muted, fontWeight: '600' },
  list: { padding: theme.spacing(2), gap: theme.spacing(1.5), paddingBottom: theme.spacing(4) },
  selTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
});
