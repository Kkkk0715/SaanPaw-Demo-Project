import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isWithinSJDM } from '@saanpaw/shared';

export interface Fix {
  latitude: number;
  longitude: number;
  /** Metres; null when the phone didn't say. */
  accuracy: number | null;
  /** "gps" = a fresh fix now; "last_known" / "history" = an earlier accurate fix (e.g. indoors). */
  source: 'gps' | 'last_known' | 'history';
  /** When the fix was taken (ms). */
  at: number;
}

const HISTORY_KEY = 'saanpaw.locationHistory';
/** A fix this good is trusted outright, and remembered for later. */
const GOOD_ACCURACY_M = 60;
/** Earlier fixes older than this are not used as a stand-in. */
const HISTORY_MAX_AGE_MS = 6 * 60 * 60_000;
const FRESH_TIMEOUT_MS = 12_000;

async function readHistory(): Promise<Fix[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as Fix[]) : [];
  } catch {
    return [];
  }
}

/** Keeps the last 20 accurate fixes on the phone (never sent anywhere). */
async function remember(fix: Fix) {
  if (fix.accuracy === null || fix.accuracy > GOOD_ACCURACY_M) return;
  try {
    const list = (await readHistory()).filter((f) => Date.now() - f.at < HISTORY_MAX_AGE_MS);
    list.unshift({ ...fix, source: 'history' });
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 20)));
  } catch {
    /* history is a convenience only */
  }
}

const toFix = (pos: Location.LocationObject, source: Fix['source']): Fix => ({
  latitude: pos.coords.latitude,
  longitude: pos.coords.longitude,
  accuracy: pos.coords.accuracy ?? null,
  source,
  at: pos.timestamp ?? Date.now(),
});

const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);

export const locationService = {
  /**
   * The best position available now. Indoors GPS is often off by hundreds of metres or never
   * arrives; then the phone's last known position or the most accurate fix from the last few
   * hours is used instead, and `source` / `accuracy` say so, so the screen can tell the person.
   */
  async getCurrent(): Promise<Fix | null> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    let fresh: Fix | null = null;
    try {
      const pos = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }), FRESH_TIMEOUT_MS);
      fresh = pos ? toFix(pos, 'gps') : null;
    } catch {
      fresh = null;
    }
    if (fresh && fresh.accuracy !== null && fresh.accuracy <= GOOD_ACCURACY_M) {
      void remember(fresh);
      return fresh;
    }

    // Weak or no signal: compare with earlier accurate fixes and use whichever is most precise.
    const candidates: Fix[] = [];
    if (fresh) candidates.push(fresh);
    try {
      const last = await Location.getLastKnownPositionAsync({ maxAge: 30 * 60_000, requiredAccuracy: 100 });
      if (last) candidates.push(toFix(last, 'last_known'));
    } catch {
      /* not available */
    }
    candidates.push(...(await readHistory()).filter((f) => Date.now() - f.at < HISTORY_MAX_AGE_MS));
    if (!candidates.length) return null;
    candidates.sort((a, b) => (a.accuracy ?? 9999) - (b.accuracy ?? 9999));
    const best = candidates[0];
    // A fresh fix that is only a little worse is still preferred: the person may have moved.
    if (fresh && best !== fresh && (fresh.accuracy ?? 9999) <= (best.accuracy ?? 9999) * 1.5) return fresh;
    return best;
  },

  /**
   * The phone's last known position if it is recent, for showing the user on a map straight away
   * while a fresh fix is still coming in. Null when there is none, or permission is off.
   */
  async getRecent(): Promise<{ latitude: number; longitude: number } | null> {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const pos = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 });
    if (pos) return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    const remembered = (await readHistory())[0];
    return remembered && Date.now() - remembered.at < HISTORY_MAX_AGE_MS
      ? { latitude: remembered.latitude, longitude: remembered.longitude }
      : null;
  },

  /**
   * Follows the phone's position while the caller is listening: calls `onMove` with each new fix
   * (roughly every 25 m moved). Returns a function that stops watching. Resolves to a no-op when
   * permission is refused, so the caller simply keeps its fallback position.
   */
  async watch(onMove: (p: { latitude: number; longitude: number }) => void): Promise<() => void> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return () => {};
    const sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 25, timeInterval: 5_000 },
      (pos) => {
        void remember(toFix(pos, 'gps'));
        onMove({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      },
    );
    return () => sub.remove();
  },

  /** Limitation 1: reject anything outside San Jose Del Monte. */
  assertWithinServiceArea(latitude: number, longitude: number): void {
    if (!isWithinSJDM(latitude, longitude)) {
      throw new Error('This location is outside San Jose Del Monte, Bulacan.');
    }
  },

  toGeoPoint(latitude: number, longitude: number) {
    return { type: 'Point' as const, coordinates: [longitude, latitude] as [number, number] };
  },
};

/** "your last accurate location from 12 min ago (±15 m)" for the screen to show. */
export function describeFix(fix: Fix): string | null {
  if (fix.source === 'gps' && (fix.accuracy ?? 0) <= GOOD_ACCURACY_M) return null;
  const mins = Math.max(1, Math.round((Date.now() - fix.at) / 60_000));
  const ago = mins < 60 ? `${mins} min ago` : `${Math.round(mins / 60)} h ago`;
  const acc = fix.accuracy !== null ? ` (±${Math.round(fix.accuracy)} m)` : '';
  if (fix.source === 'gps') return `GPS signal is weak here${acc}, so the pin may be off. Tap the map to correct it.`;
  return `GPS is weak here (indoors?), so your last accurate location from ${ago}${acc} was used. Tap the map if the animal was somewhere else.`;
}
