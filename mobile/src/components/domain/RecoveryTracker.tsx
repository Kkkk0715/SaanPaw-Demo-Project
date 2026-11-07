import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  distanceMeters,
  formatDistance,
  reportPlace,
  useApp,
  type AnimalReport,
  type LatLng,
  type RoadRoute,
  type Shelter,
} from '@saanpaw/shared';
import { theme } from '@/constants/theme';
import { MapCanvas } from '@/components/map/MapCanvas';
import { locationService } from '@/services/locationService';

/** Rough travel time at city driving speed, so "how far" also reads as "how long". */
const minutesAway = (meters: number) => Math.max(1, Math.round((meters * 1.35) / 1000 / 25 * 60));

/** Moving less than this doesn't ask the router again - keeps lookups to a handful per trip. */
const REROUTE_AFTER_METERS = 150;

/**
 * Where a report came from, seen from whoever is doing the recovery: the route starts at the
 * phone's live location (the shelter staff member out in the field), not the shelter's address,
 * and follows them as they move. With location off or not yet known it starts at the shelter.
 * Drawn along the roads with the distance and drive time by road; until the route arrives, or if
 * none could be found, a dashed straight line and a rough estimate instead.
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
  const { lookupRoute } = useApp();
  const [here, setHere] = useState<LatLng | null>(null);
  const [road, setRoad] = useState<RoadRoute | null>(null);
  /** Where the current route starts. Only moves after a real move, so small ones don't re-route. */
  const [routedFrom, setRoutedFrom] = useState<LatLng | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  // Follow the phone while the tracker is open: last known position at once, then live fixes.
  useEffect(() => {
    let cancelled = false;
    void locationService.getRecent().then((p) => {
      if (!cancelled && p) setHere((prev) => prev ?? p);
    }).catch(() => {});
    void locationService
      .watch((p) => {
        if (!cancelled) setHere(p);
      })
      .then((stop) => {
        if (cancelled) stop();
        else stopRef.current = stop;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      stopRef.current?.();
      stopRef.current = null;
    };
  }, []);

  const start = here ?? shelter.location;
  const fromYou = Boolean(here);

  // Move the route's start only when the person has moved far enough (or the phone's position
  // replaced the shelter's), so walking around a block doesn't ask the router every few seconds.
  const { latitude: startLat, longitude: startLng } = start;
  useEffect(() => {
    setRoutedFrom((prev) =>
      prev && distanceMeters(prev, { latitude: startLat, longitude: startLng }) <= REROUTE_AFTER_METERS
        ? prev
        : { latitude: startLat, longitude: startLng },
    );
  }, [startLat, startLng]);

  const fromLat = routedFrom?.latitude;
  const fromLng = routedFrom?.longitude;
  const { latitude: toLat, longitude: toLng } = report.location;
  useEffect(() => {
    if (fromLat == null || fromLng == null) return;
    let cancelled = false;
    void lookupRoute({ latitude: fromLat, longitude: fromLng }, { latitude: toLat, longitude: toLng }).then((r) => {
      // No route from the new start: show the straight line from there, not an old route from elsewhere.
      if (!cancelled) setRoad(r);
    });
    return () => {
      cancelled = true;
    };
  }, [lookupRoute, fromLat, fromLng, toLat, toLng]);

  const meters = road ? road.distanceMeters : distanceMeters(start, report.location);
  const minutes = road ? Math.max(1, Math.round(road.durationSeconds / 60)) : minutesAway(meters);
  const fromLabel = fromYou ? 'from you' : 'from your shelter';

  return (
    <View style={{ gap: theme.spacing(1) }}>
      <View style={styles.summary}>
        <View style={styles.stat}>
          <Ionicons name="navigate" size={16} color={theme.colors.info} />
          <Text style={styles.statValue}>{formatDistance(meters)}</Text>
          <Text style={styles.statLabel}>{road ? `by road ${fromLabel}` : fromLabel}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.stat}>
          <Ionicons name="car-outline" size={16} color={theme.colors.info} />
          <Text style={styles.statValue}>{road ? '' : '~'}{minutes} min</Text>
          <Text style={styles.statLabel}>by car</Text>
        </View>
      </View>
      {!fromYou ? (
        <Text style={styles.hint}>
          Turn on location to route from where you are now. Until then the route starts at the shelter.
        </Text>
      ) : null}
      <View style={styles.place}>
        <Ionicons name="location" size={15} color={report.kind === 'lost' ? theme.colors.danger : theme.colors.found} />
        <Text style={styles.placeText}>{reportPlace(report)}</Text>
      </View>
      <MapCanvas
        height={height}
        initialCenter={report.location}
        initialZoom={14}
        markers={[
          fromYou
            ? { id: 'me', coordinate: start, kind: 'me', label: 'You are here' }
            : { id: 'shelter', coordinate: shelter.location, kind: 'shelter', label: shelter.name },
          { id: 'report', coordinate: report.location, kind: report.kind, label: 'Report location' },
        ]}
        selectedMarkerId="report"
        route={{
          from: routedFrom ?? start,
          to: report.location,
          path: road?.path ?? null,
        }}
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
  hint: { ...theme.type.caption, color: theme.colors.textSoft },
  divider: { width: 1, alignSelf: 'stretch', backgroundColor: theme.colors.border, marginHorizontal: 10 },
  place: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  placeText: { ...theme.type.bodyMedium, color: theme.colors.text, flex: 1 },
});
