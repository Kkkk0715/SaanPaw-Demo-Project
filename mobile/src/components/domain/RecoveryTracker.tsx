import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { distanceMeters, formatDistance, reportPlace, type AnimalReport, type Shelter } from '@saanpaw/shared';
import { theme } from '@/constants/theme';
import { MapCanvas } from '@/components/map/MapCanvas';

/** Rough travel time at city driving speed, so "how far" also reads as "how long". */
const minutesAway = (meters: number) => Math.max(1, Math.round((meters * 1.35) / 1000 / 25 * 60));

/**
 * Where a report came from, seen from the shelter recovering it: both pins on the map, a dashed
 * line between them, and the straight-line distance with a rough drive time.
 */
export function RecoveryTracker({
  shelter,
  report,
  height = 240,
}: {
  shelter: Pick<Shelter, 'name' | 'location'>;
  report: Pick<AnimalReport, 'kind' | 'location' | 'address' | 'landmark' | 'barangay'>;
  height?: number;
}) {
  const meters = distanceMeters(shelter.location, report.location);
  return (
    <View style={{ gap: theme.spacing(1) }}>
      <View style={styles.summary}>
        <View style={styles.stat}>
          <Ionicons name="navigate" size={16} color={theme.colors.info} />
          <Text style={styles.statValue}>{formatDistance(meters)}</Text>
          <Text style={styles.statLabel}>from your shelter</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.stat}>
          <Ionicons name="car-outline" size={16} color={theme.colors.info} />
          <Text style={styles.statValue}>~{minutesAway(meters)} min</Text>
          <Text style={styles.statLabel}>by car</Text>
        </View>
      </View>
      <View style={styles.place}>
        <Ionicons name="location" size={15} color={report.kind === 'lost' ? theme.colors.danger : theme.colors.found} />
        <Text style={styles.placeText}>{reportPlace(report)}</Text>
      </View>
      <MapCanvas
        height={height}
        initialCenter={report.location}
        initialZoom={14}
        markers={[
          { id: 'shelter', coordinate: shelter.location, kind: 'shelter', label: shelter.name },
          { id: 'report', coordinate: report.location, kind: report.kind, label: 'Report location' },
        ]}
        selectedMarkerId="report"
        route={{ from: shelter.location, to: report.location }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.infoSoft,
    borderRadius: theme.radius.md,
    padding: theme.spacing(1.25),
  },
  stat: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  statValue: { ...theme.type.h3, color: theme.colors.text },
  statLabel: { ...theme.type.caption, color: theme.colors.textSoft },
  divider: { width: 1, alignSelf: 'stretch', backgroundColor: theme.colors.border, marginHorizontal: 10 },
  place: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  placeText: { ...theme.type.bodyMedium, color: theme.colors.text, flex: 1 },
});
