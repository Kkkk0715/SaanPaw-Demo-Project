import { logger } from '../utils/logger';

/**
 * Road route between two points, from OSRM (the open-source router used with OpenStreetMap).
 *
 * Defaults to the public OSRM demo server, which asks for light use only (about one request a
 * second, no heavy traffic) - fine for a shelter opening a recovery now and then. Set ROUTING_URL
 * to a self-hosted OSRM, or another OSRM-compatible service, for anything bigger. Answers are cached
 * and the server is called from here rather than the apps so that limit is respected in one place.
 */
const BASE = (process.env.ROUTING_URL || 'https://router.project-osrm.org').replace(/\/$/, '');
const CACHE_LIMIT = 500;
const MIN_INTERVAL_MS = 1100;

export interface RoadRoute {
  /** The road path as [latitude, longitude] pairs, ready for the map. */
  path: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
}

interface OsrmResponse {
  code?: string;
  routes?: { distance: number; duration: number; geometry?: { coordinates?: [number, number][] } }[];
}

/** OSRM's answer as a RoadRoute, or null. Pure, for tests. */
export function parseOsrmRoute(data: OsrmResponse | null | undefined): RoadRoute | null {
  const route = data?.code === 'Ok' ? data.routes?.[0] : undefined;
  const coordinates = route?.geometry?.coordinates;
  if (!route || !coordinates || coordinates.length < 2) return null;
  return {
    // GeoJSON is [lng, lat]; Leaflet wants [lat, lng].
    path: coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
    distanceMeters: Math.round(route.distance),
    durationSeconds: Math.round(route.duration),
  };
}

const cache = new Map<string, RoadRoute | null>();
let queue: Promise<unknown> = Promise.resolve();
let lastCall = 0;

/** ~11 m precision: the same pair of pins asks once. */
const key = (fromLat: number, fromLng: number, toLat: number, toLng: number) =>
  [fromLat, fromLng, toLat, toLng].map((n) => n.toFixed(4)).join(',');

/** Never throws; null when no road route was found or the router is unreachable. */
export function roadRoute(fromLat: number, fromLng: number, toLat: number, toLng: number): Promise<RoadRoute | null> {
  const k = key(fromLat, fromLng, toLat, toLng);
  if (cache.has(k)) return Promise.resolve(cache.get(k) ?? null);

  const run = async () => {
    if (cache.has(k)) return cache.get(k) ?? null;
    const wait = lastCall + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    try {
      const url = `${BASE}/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'SaanPaw/0.1' } });
      if (!res.ok) {
        logger.warn(`routing: router answered ${res.status}`);
        return null;
      }
      const result = parseOsrmRoute((await res.json()) as OsrmResponse);
      if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
      cache.set(k, result);
      return result;
    } catch (err) {
      logger.warn(`routing: lookup failed (${err instanceof Error ? err.message : String(err)})`);
      return null;
    }
  };

  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}
