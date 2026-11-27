import { StyleSheet, Text, View } from 'react-native';
import { distanceMeters, formatDistance, type AnimalReport, type DashboardStats, type LatLng } from '@saanpaw/shared';
import { theme } from '@/constants/theme';
import { Card } from '@/components/ui';

type Counts = NonNullable<DashboardStats['areaReports']>;

/**
 * "Reports in your area": every report filed inside the radius (a user's alert radius around
 * home, or a shelter's operating radius), with how many are still open and how many pets got home.
 * Uses the server's count; while that hasn't loaded (or offline demo), counts the reports on the phone.
 */
export function AreaTotals({
  counts,
  reports,
  center,
  radiusMeters,
  title,
}: {
  counts?: Counts;
  reports: AnimalReport[];
  center: LatLng;
  radiusMeters: number;
  title: string;
}) {
  const c: Counts =
    counts ??
    (() => {
      const inside = reports.filter((r) => distanceMeters(center, r.location) <= radiusMeters);
      const lost = inside.filter((r) => r.kind === 'lost');
      return {
        total: inside.length,
        lost: lost.length,
        found: inside.length - lost.length,
        open: inside.filter((r) => r.status === 'active' || r.status === 'matched').length,
        recovered: lost.filter((r) => r.status === 'recovered').length,
        radiusMeters,
      };
    })();

  const cells = [
    { label: 'Lost', value: c.lost, color: theme.colors.danger },
    { label: 'Found', value: c.found, color: theme.colors.found },
    { label: 'Still open', value: c.open, color: theme.colors.info },
    { label: 'Recovered', value: c.recovered, color: theme.colors.primary },
  ];

  return (
    <Card>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.meta}>All reports within {formatDistance(c.radiusMeters || radiusMeters)}, since SaanPaw started</Text>
        </View>
        <Text style={styles.total} accessibilityLabel={`${c.total} reports in total`}>
          {c.total.toLocaleString()}
        </Text>
      </View>
      <View style={styles.row}>
        {cells.map((cell) => (
          <View key={cell.label} style={styles.cell}>
            <Text style={[styles.value, { color: cell.color }]}>{cell.value.toLocaleString()}</Text>
            <Text style={styles.label}>{cell.label}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1) },
  title: { ...theme.type.h3, color: theme.colors.text },
  meta: { ...theme.type.caption, color: theme.colors.muted },
  total: { ...theme.type.stat, fontSize: 30, color: theme.colors.text },
  row: { flexDirection: 'row', marginTop: theme.spacing(1.25), gap: theme.spacing(0.75) },
  cell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: theme.spacing(0.75),
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceAlt,
  },
  value: { ...theme.type.stat, fontSize: 18 },
  label: { ...theme.type.caption, fontSize: 11, color: theme.colors.muted },
});
