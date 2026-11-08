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
 * Every barangay in the city with its map centre. The first fifteen (the populated corridors the
 * app started with) keep their OpenStreetMap positions; the rest follow below.
 *
 * Each of those first centers is where OpenStreetMap places that barangay (its place node, cross-checked against
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

  // The rest of the city's barangays, from the PSA-based coordinates PhilAtlas publishes for each
  // (philatlas.com, one page per barangay), so a barangay picked in a dropdown also puts the pin,
  // alert radius and shelter coverage in the right part of the city.
  { name: 'Assumption', center: { latitude: 14.8638, longitude: 121.0634 } },
  { name: 'Bagong Buhay', center: { latitude: 14.8552, longitude: 121.0588 } },
  { name: 'Bagong Buhay II', center: { latitude: 14.859, longitude: 121.0589 } },
  { name: 'Bagong Buhay III', center: { latitude: 14.8556, longitude: 121.0628 } },
  { name: 'Ciudad Real', center: { latitude: 14.7705, longitude: 121.0928 } },
  { name: 'Fatima', center: { latitude: 14.8467, longitude: 121.0459 } },
  { name: 'Fatima II', center: { latitude: 14.8438, longitude: 121.0438 } },
  { name: 'Fatima III', center: { latitude: 14.8454, longitude: 121.046 } },
  { name: 'Fatima IV', center: { latitude: 14.8433, longitude: 121.0449 } },
  { name: 'Fatima V', center: { latitude: 14.8464, longitude: 121.0503 } },
  { name: 'Francisco Homes-Guijo', center: { latitude: 14.814, longitude: 121.06 } },
  { name: 'Francisco Homes-Mulawin', center: { latitude: 14.806, longitude: 121.0629 } },
  { name: 'Francisco Homes-Yakal', center: { latitude: 14.8103, longitude: 121.0549 } },
  { name: 'Gumaoc Central', center: { latitude: 14.7999, longitude: 121.065 } },
  { name: 'Gumaoc East', center: { latitude: 14.7985, longitude: 121.0675 } },
  { name: 'Gumaoc West', center: { latitude: 14.7996, longitude: 121.0604 } },
  { name: 'Kaybanban', center: { latitude: 14.8231, longitude: 121.0929 } },
  { name: 'Lawang Pari', center: { latitude: 14.8568, longitude: 121.0717 } },
  { name: 'Maharlika', center: { latitude: 14.7954, longitude: 121.0714 } },
  { name: 'Minuyan', center: { latitude: 14.8523, longitude: 121.077 } },
  { name: 'Minuyan II', center: { latitude: 14.8421, longitude: 121.0753 } },
  { name: 'Minuyan III', center: { latitude: 14.8449, longitude: 121.0731 } },
  { name: 'Minuyan IV', center: { latitude: 14.8464, longitude: 121.0755 } },
  { name: 'Minuyan V', center: { latitude: 14.8512, longitude: 121.0746 } },
  { name: 'St. Martin de Porres', center: { latitude: 14.8598, longitude: 121.0701 } },
  { name: 'San Isidro', center: { latitude: 14.8206, longitude: 121.1454 } },
  { name: 'San Martin', center: { latitude: 14.8618, longitude: 121.0577 } },
  { name: 'San Martin II', center: { latitude: 14.8635, longitude: 121.0542 } },
  { name: 'San Martin III', center: { latitude: 14.8606, longitude: 121.0546 } },
  { name: 'San Martin IV', center: { latitude: 14.8621, longitude: 121.0515 } },
  { name: 'San Pedro', center: { latitude: 14.8491, longitude: 121.0552 } },
  { name: 'San Rafael', center: { latitude: 14.8484, longitude: 121.0454 } },
  { name: 'San Rafael I', center: { latitude: 14.8541, longitude: 121.0474 } },
  { name: 'San Rafael III', center: { latitude: 14.8519, longitude: 121.046 } },
  { name: 'San Rafael IV', center: { latitude: 14.8538, longitude: 121.0437 } },
  { name: 'San Roque', center: { latitude: 14.8192, longitude: 121.1071 } },
  { name: 'Sta. Cruz', center: { latitude: 14.854, longitude: 121.0535 } },
  { name: 'Sta. Cruz II', center: { latitude: 14.8538, longitude: 121.0512 } },
  { name: 'Sta. Cruz III', center: { latitude: 14.8551, longitude: 121.0506 } },
  { name: 'Sta. Cruz IV', center: { latitude: 14.8587, longitude: 121.0519 } },
  { name: 'Sta. Cruz V', center: { latitude: 14.8573, longitude: 121.0494 } },
  { name: 'Sto. Niño', center: { latitude: 14.8581, longitude: 121.0646 } },
  { name: 'Sto. Niño II', center: { latitude: 14.8621, longitude: 121.07 } },
  // Approximate: Francisco Homes-Narra's page could not be read, so it sits among its three
  // Francisco Homes neighbours; the four barangays Muzon was split into in 2023 (RA 11896) are
  // placed around the old Muzon centre following the law's boundary description (Proper central,
  // East to the north-east, West to the west, South to the south). Refine when OSM maps them.
  { name: 'Francisco Homes-Narra', center: { latitude: 14.8085, longitude: 121.059 } },
  { name: 'Muzon Proper', center: { latitude: 14.8019, longitude: 121.0347 } },
  { name: 'Muzon East', center: { latitude: 14.81, longitude: 121.04 } },
  { name: 'Muzon West', center: { latitude: 14.803, longitude: 121.026 } },
  { name: 'Muzon South', center: { latitude: 14.792, longitude: 121.037 } },
];

/** Every barangay name, A-Z, for dropdowns. */
export const SJDM_BARANGAY_NAMES = SJDM_BARANGAYS.map((b) => b.name).sort((x, y) => x.localeCompare(y));

/**
 * Same list - kept as its own name for the screens that already use it. 59 barangays as of the
 * 2020 census plus the four Muzon was divided into in 2023; "Muzon" itself stays so older reports
 * and accounts still match.
 */
export const SJDM_ALL_BARANGAY_NAMES: string[] = SJDM_BARANGAY_NAMES;

/** A barangay's map centre by name, or undefined for a name not on the list. */
export const barangayCenter = (name: string | undefined) => SJDM_BARANGAYS.find((b) => b.name === name)?.center;

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
    .replace(/\bsaint\s/g, 'san ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b([1-5])\b/g, (d) => ROMAN[d])
    .trim()
    .replace(/^poblacion i$/, 'poblacion 1');
}

const BARANGAY_BY_KEY = new Map(SJDM_ALL_BARANGAY_NAMES.map((name) => [barangayKey(name), name]));
// Other spellings in use for the same barangays.
BARANGAY_BY_KEY.set(barangayKey('Lawang Pare'), 'Lawang Pari');
BARANGAY_BY_KEY.set(barangayKey('Sapang Palay'), 'Sapang Palay Proper');

/**
 * The city barangay a place name refers to, spelled as in SJDM_ALL_BARANGAY_NAMES, or null.
 * Exact matches only (after tidying spelling), so a subdivision such as "Francisco Homes" is never
 * mistaken for the barangay "Francisco Homes-Narra".
 */
export function matchBarangayName(name: string | undefined | null): string | null {
  if (!name) return null;
  const key = barangayKey(name);
  // "Fatima I", "Minuyan I", "Santo Niño 1": the first of a numbered set is officially unnumbered.
  return BARANGAY_BY_KEY.get(key) ?? BARANGAY_BY_KEY.get(key.replace(/ i$/, '')) ?? null;
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
