import * as Location from 'expo-location';
import { isWithinSJDM } from '@saanpaw/shared';

export const locationService = {
  async getCurrent(): Promise<{ latitude: number; longitude: number } | null> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
  },

  /**
   * The phone's last known position if it is recent, for showing the user on a map straight away
   * while a fresh fix is still coming in. Null when there is none, or permission is off.
   */
  async getRecent(): Promise<{ latitude: number; longitude: number } | null> {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const pos = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 });
    return pos ? { latitude: pos.coords.latitude, longitude: pos.coords.longitude } : null;
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
      (pos) => onMove({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
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
