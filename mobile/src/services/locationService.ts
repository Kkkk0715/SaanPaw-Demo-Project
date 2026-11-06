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
