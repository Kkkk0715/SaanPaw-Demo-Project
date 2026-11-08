import { nearestBarangay } from '../config/barangays';

/**
 * The barangay a pin is in: the one whose centre is nearest (63 centres, one per barangay, see
 * config/barangays.ts). Reports are tagged with this rather than the barangay the app sent, so the
 * label always follows the pin - older app builds sent the reporter's own barangay.
 *
 * Not taken from OpenStreetMap's address for the spot: San Jose Del Monte has no barangay
 * boundaries in OSM, so its address names a nearby place that can be the wrong barangay (a pin
 * in Fatima V came back as "Fatima I"). The nearest centre agrees with the map's own labels.
 */
export async function barangayForPin(lat: number, lng: number): Promise<string> {
  return nearestBarangay(lat, lng);
}
