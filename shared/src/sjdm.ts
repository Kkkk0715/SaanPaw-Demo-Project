import type { LatLng } from './types';

/**
 * San Jose Del Monte geography.
 * Limitation 1 confines the system to this city, so these barangays are also
 * the only options on every report form.
 */

export interface Barangay {
  name: string;
  center: LatLng;
}

/**
 * The populated corridors of the city.
 *
 * Each center is where OpenStreetMap places that barangay (its place node, cross-checked against
 * the barangay hall's own mapped position - the two agree within ~200 m). That matters because
 * the map tiles label barangays from those same OSM nodes: a center that is off by even a couple
 * of kilometres draws the alert-radius circle on top of a neighbouring barangay's label. The
 * earlier hand-typed values were exactly that far out - Tungkong Mangga sat ~2.8 km west of its
 * real position, inside Gaya-Gaya. Sapang Palay Proper has no place node; its value is the
 * centre of its OSM boundary relation.
 */
export const SJDM_BARANGAYS: Barangay[] = [
  { name: 'Muzon', center: { latitude: 14.8019, longitude: 121.0347 } },
  { name: 'Tungkong Mangga', center: { latitude: 14.7891, longitude: 121.0747 } },
  { name: 'Kaypian', center: { latitude: 14.8216, longitude: 121.0626 } },
  { name: 'Gaya-Gaya', center: { latitude: 14.795, longitude: 121.0523 } },
  { name: 'Poblacion', center: { latitude: 14.815, longitude: 121.0418 } },
  { name: 'Poblacion 1', center: { latitude: 14.8088, longitude: 121.0456 } },
  { name: 'San Manuel', center: { latitude: 14.7817, longitude: 121.0685 } },
  { name: 'Sto. Cristo', center: { latitude: 14.8253, longitude: 121.0789 } },
  { name: 'San Rafael V', center: { latitude: 14.8499, longitude: 121.045 } },
  { name: 'Graceville', center: { latitude: 14.7874, longitude: 121.061 } },
  { name: 'Minuyan Proper', center: { latitude: 14.8428, longitude: 121.0786 } },
  { name: 'Sapang Palay Proper', center: { latitude: 14.8407, longitude: 121.0449 } },
  { name: 'Citrus', center: { latitude: 14.8492, longitude: 121.0647 } },
  { name: 'Dulong Bayan', center: { latitude: 14.8268, longitude: 121.0447 } },
  { name: 'Paradise III', center: { latitude: 14.8236, longitude: 121.1146 } },
];

export const SJDM_BARANGAY_NAMES = SJDM_BARANGAYS.map((b) => b.name);

/** Radius options on the user and shelter registration forms. */
export const RADIUS_OPTIONS = [
  { label: '1 km', meters: 1000 },
  { label: '3 km', meters: 3000 },
  { label: '5 km', meters: 5000 },
  { label: '10 km', meters: 10000 },
];

/** Distance in metres. Used for every radius and smart-alert check. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export function formatDistance(meters: number): string {
  return meters < 1000 ? `${meters} m` : `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Nearest barangay to a point. A raw GPS fix means nothing to someone reading
 * the report, so auto-tagged locations get turned back into a barangay name.
 */
export function nearestBarangay(point: LatLng): Barangay {
  return SJDM_BARANGAYS.reduce((closest, candidate) =>
    distanceMeters(point, candidate.center) < distanceMeters(point, closest.center)
      ? candidate
      : closest,
  );
}
