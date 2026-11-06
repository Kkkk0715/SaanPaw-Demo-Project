import { logger } from '../utils/logger';

/**
 * Street-level address for a map pin, from OpenStreetMap's free Nominatim service.
 *
 * Called from the server rather than the apps so its usage policy is honoured in one place:
 * an identifying User-Agent, at most one request per second, and cached answers (a pin dragged
 * around the same spot asks once). https://operations.osmfoundation.org/policies/nominatim/
 */
const ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = 'SaanPaw/0.1 (lost-pet recovery capstone, San Jose Del Monte, Bulacan)';
const MIN_INTERVAL_MS = 1100;
const CACHE_LIMIT = 2000;

export interface ReverseGeocodeResult {
  /** "123 Quirino Highway, Muzon, San Jose del Monte" - most specific parts first. */
  address: string;
  street?: string;
  houseNumber?: string;
  /** Neighbourhood / subdivision / barangay as OpenStreetMap names it. */
  area?: string;
  /**
   * Every place name OSM gave for the pin, most specific first (subdivision, then barangay...).
   * The apps match these against the city's barangay list, so the report is tagged with the
   * barangay the pin is actually in rather than the nearest of a few hand-placed centres.
   */
  places?: string[];
}

interface NominatimAddress {
  house_number?: string;
  road?: string;
  pedestrian?: string;
  footway?: string;
  neighbourhood?: string;
  residential?: string;
  quarter?: string;
  suburb?: string;
  village?: string;
  hamlet?: string;
  city?: string;
  town?: string;
  municipality?: string;
}

/** Turns Nominatim's address parts into one readable line. Pure, for tests. */
export function formatNominatimAddress(a: NominatimAddress | undefined, fallback?: string): ReverseGeocodeResult | null {
  if (!a) return fallback ? { address: fallback } : null;
  const street = a.road ?? a.pedestrian ?? a.footway;
  const area = a.neighbourhood ?? a.residential ?? a.quarter ?? a.suburb ?? a.village ?? a.hamlet;
  const city = a.city ?? a.town ?? a.municipality;
  const parts = [[a.house_number, street].filter(Boolean).join(' '), area, city].filter(
    (p, i, all): p is string => Boolean(p) && all.indexOf(p) === i,
  );
  if (!parts.length) return fallback ? { address: fallback } : null;
  const places = [a.neighbourhood, a.residential, a.quarter, a.suburb, a.village, a.hamlet].filter(
    (p, i, all): p is string => Boolean(p) && all.indexOf(p) === i,
  );
  return { address: parts.join(', '), street, houseNumber: a.house_number, area, ...(places.length ? { places } : {}) };
}

const cache = new Map<string, ReverseGeocodeResult | null>();
let queue: Promise<unknown> = Promise.resolve();
let lastCall = 0;

/** ~11 m: pins this close share one lookup. */
const cacheKey = (lat: number, lng: number) => `${lat.toFixed(4)},${lng.toFixed(4)}`;

/** Never throws; null when the address could not be found or the service is unreachable. */
export function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult | null> {
  const key = cacheKey(lat, lng);
  if (cache.has(key)) return Promise.resolve(cache.get(key) ?? null);

  const run = async () => {
    if (cache.has(key)) return cache.get(key) ?? null;
    const wait = lastCall + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    try {
      const url = `${ENDPOINT}?format=jsonv2&addressdetails=1&zoom=18&lat=${lat}&lon=${lng}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        logger.warn(`reverseGeocode: Nominatim answered ${res.status}`);
        return null;
      }
      const data = (await res.json()) as { address?: NominatimAddress; display_name?: string };
      const result = formatNominatimAddress(data.address, data.display_name);
      if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
      cache.set(key, result);
      return result;
    } catch (err) {
      logger.warn(`reverseGeocode: lookup failed (${err instanceof Error ? err.message : String(err)})`);
      return null;
    }
  };

  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}
