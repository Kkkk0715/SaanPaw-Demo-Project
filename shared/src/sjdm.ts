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

/**
 * Every barangay in the city (62 since Muzon was divided into four in 2023, plus "Muzon" itself so
 * older reports and accounts still match), spelled the way the list above spells them. Only the corridors above have a map centre; the report form offers all
 * of these, because a pin can land in any of them.
 */
export const SJDM_ALL_BARANGAY_NAMES: string[] = [
  'Assumption',
  'Bagong Buhay I',
  'Bagong Buhay II',
  'Bagong Buhay III',
  'Citrus',
  'Ciudad Real',
  'Dulong Bayan',
  'Fatima I',
  'Fatima II',
  'Fatima III',
  'Fatima IV',
  'Fatima V',
  'Francisco Homes-Guijo',
  'Francisco Homes-Mulawin',
  'Francisco Homes-Narra',
  'Francisco Homes-Yakal',
  'Gaya-Gaya',
  'Graceville',
  'Gumaoc Central',
  'Gumaoc East',
  'Gumaoc West',
  'Kaybanban',
  'Kaypian',
  'Lawang Pare',
  'Maharlika',
  'Minuyan I',
  'Minuyan II',
  'Minuyan III',
  'Minuyan IV',
  'Minuyan V',
  'Minuyan Proper',
  'Muzon',
  'Muzon East',
  'Muzon Proper',
  'Muzon South',
  'Muzon West',
  'Paradise III',
  'Poblacion',
  'Poblacion 1',
  'San Isidro',
  'San Manuel',
  'San Martin de Porres',
  'San Martin I',
  'San Martin II',
  'San Martin III',
  'San Martin IV',
  'San Pedro',
  'San Rafael I',
  'San Rafael II',
  'San Rafael III',
  'San Rafael IV',
  'San Rafael V',
  'San Roque',
  'Sapang Palay Proper',
  'Sta. Cruz I',
  'Sta. Cruz II',
  'Sta. Cruz III',
  'Sta. Cruz IV',
  'Sta. Cruz V',
  'Sto. Cristo',
  'Sto. Niño I',
  'Sto. Niño II',
  'Tungkong Mangga',
];

const ROMAN: Record<string, string> = { '1': 'i', '2': 'ii', '3': 'iii', '4': 'iv', '5': 'v' };

/** "Brgy. Sto. Niño 1", "santo nino i" and "Sto. Niño I" all reduce to the same key. */
function barangayKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(barangay|brgy)\.?\s*/g, '')
    .replace(/\bsto\.?\s/g, 'santo ')
    .replace(/\bsta\.?\s/g, 'santa ')
    .replace(/\bst\.?\s/g, 'san ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b([1-5])\b/g, (d) => ROMAN[d])
    .trim()
    .replace(/^poblacion i$/, 'poblacion 1');
}

const BARANGAY_BY_KEY = new Map(SJDM_ALL_BARANGAY_NAMES.map((name) => [barangayKey(name), name]));

/**
 * The city barangay a place name refers to, spelled as in SJDM_ALL_BARANGAY_NAMES, or null.
 * Exact matches only (after tidying spelling), so a subdivision such as "Francisco Homes" is never
 * mistaken for the barangay "Francisco Homes-Narra".
 */
export function matchBarangayName(name: string | undefined | null): string | null {
  if (!name) return null;
  return BARANGAY_BY_KEY.get(barangayKey(name)) ?? null;
}

/** The first of OSM's place names for a pin that is a real city barangay. */
export function barangayFromPlaces(places: (string | undefined)[] | undefined): string | null {
  for (const place of places ?? []) {
    const match = matchBarangayName(place);
    if (match) return match;
  }
  return null;
}

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
