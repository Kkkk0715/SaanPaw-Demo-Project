/**
 * The city's barangays with their map centres, and the name matcher - a copy of
 * shared/src/sjdm.ts for the server, which can't import the shared package (rootDir is src/).
 * Keep the two in step: same names, same centres, same matching rules.
 *
 * Used to set a report's barangay from where its pin actually is, instead of trusting the
 * barangay sent with it (older app builds sent the reporter's own barangay).
 */

/** [name, latitude, longitude] */
export const BARANGAYS: [string, number, number][] = [
  ['Muzon', 14.8019, 121.0347],
  ['Tungkong Mangga', 14.7891, 121.0747],
  ['Kaypian', 14.8216, 121.0626],
  ['Gaya-Gaya', 14.795, 121.0523],
  ['Poblacion', 14.815, 121.0418],
  ['Poblacion 1', 14.8088, 121.0456],
  ['San Manuel', 14.7817, 121.0685],
  ['Sto. Cristo', 14.8253, 121.0789],
  ['San Rafael V', 14.8499, 121.045],
  ['Graceville', 14.7874, 121.061],
  ['Minuyan Proper', 14.8428, 121.0786],
  ['Sapang Palay Proper', 14.8407, 121.0449],
  ['Citrus', 14.8492, 121.0647],
  ['Dulong Bayan', 14.8268, 121.0447],
  ['Paradise III', 14.8236, 121.1146],
  ['Assumption', 14.8638, 121.0634],
  ['Bagong Buhay', 14.8552, 121.0588],
  ['Bagong Buhay II', 14.859, 121.0589],
  ['Bagong Buhay III', 14.8556, 121.0628],
  ['Ciudad Real', 14.7705, 121.0928],
  ['Fatima', 14.8467, 121.0459],
  ['Fatima II', 14.8438, 121.0438],
  ['Fatima III', 14.8454, 121.046],
  ['Fatima IV', 14.8433, 121.0449],
  ['Fatima V', 14.8464, 121.0503],
  ['Francisco Homes-Guijo', 14.814, 121.06],
  ['Francisco Homes-Mulawin', 14.806, 121.0629],
  ['Francisco Homes-Yakal', 14.8103, 121.0549],
  ['Gumaoc Central', 14.7999, 121.065],
  ['Gumaoc East', 14.7985, 121.0675],
  ['Gumaoc West', 14.7996, 121.0604],
  ['Kaybanban', 14.8231, 121.0929],
  ['Lawang Pari', 14.8568, 121.0717],
  ['Maharlika', 14.7954, 121.0714],
  ['Minuyan', 14.8523, 121.077],
  ['Minuyan II', 14.8421, 121.0753],
  ['Minuyan III', 14.8449, 121.0731],
  ['Minuyan IV', 14.8464, 121.0755],
  ['Minuyan V', 14.8512, 121.0746],
  ['St. Martin de Porres', 14.8598, 121.0701],
  ['San Isidro', 14.8206, 121.1454],
  ['San Martin', 14.8618, 121.0577],
  ['San Martin II', 14.8635, 121.0542],
  ['San Martin III', 14.8606, 121.0546],
  ['San Martin IV', 14.8621, 121.0515],
  ['San Pedro', 14.8491, 121.0552],
  ['San Rafael', 14.8484, 121.0454],
  ['San Rafael I', 14.8541, 121.0474],
  ['San Rafael III', 14.8519, 121.046],
  ['San Rafael IV', 14.8538, 121.0437],
  ['San Roque', 14.8192, 121.1071],
  ['Sta. Cruz', 14.854, 121.0535],
  ['Sta. Cruz II', 14.8538, 121.0512],
  ['Sta. Cruz III', 14.8551, 121.0506],
  ['Sta. Cruz IV', 14.8587, 121.0519],
  ['Sta. Cruz V', 14.8573, 121.0494],
  ['Sto. Niño', 14.8581, 121.0646],
  ['Sto. Niño II', 14.8621, 121.07],
  ['Francisco Homes-Narra', 14.8085, 121.059],
  ['Muzon Proper', 14.8019, 121.0347],
  ['Muzon East', 14.81, 121.04],
  ['Muzon West', 14.803, 121.026],
  ['Muzon South', 14.792, 121.037],
];

/** "Muzon" before its 2023 split: still a valid stored name, but never the answer for a new pin. */
const LEGACY = new Set(['Muzon']);

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

const BY_KEY = new Map(BARANGAYS.map(([name]) => [barangayKey(name), name]));
BY_KEY.set(barangayKey('Lawang Pare'), 'Lawang Pari');
BY_KEY.set(barangayKey('Sapang Palay'), 'Sapang Palay Proper');

/** The city barangay a place name refers to, or null. Exact matches only, after tidying spelling. */
export function matchBarangayName(name: string | undefined | null): string | null {
  if (!name) return null;
  const key = barangayKey(name);
  return BY_KEY.get(key) ?? BY_KEY.get(key.replace(/ i$/, '')) ?? null;
}

/** The first of OpenStreetMap's place names for a pin that is a real city barangay. */
export function barangayFromPlaces(places: (string | undefined)[] | undefined): string | null {
  for (const place of places ?? []) {
    const match = matchBarangayName(place);
    if (match) return match;
  }
  return null;
}

/** The barangay whose centre is nearest the point - the fallback when the map names none. */
export function nearestBarangay(lat: number, lng: number): string {
  const rad = Math.PI / 180;
  let best = BARANGAYS[1][0];
  let bestDistance = Infinity;
  for (const [name, la, lo] of BARANGAYS) {
    if (LEGACY.has(name)) continue;
    // Equirectangular is plenty at city scale.
    const x = (lo - lng) * Math.cos(((la + lat) / 2) * rad);
    const y = la - lat;
    const d = x * x + y * y;
    if (d < bestDistance) {
      bestDistance = d;
      best = name;
    }
  }
  return best;
}
