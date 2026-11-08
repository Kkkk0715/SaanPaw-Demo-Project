import { barangayFromPlaces, nearestBarangay } from '../config/barangays';
import { reverseGeocode } from './reverseGeocode.service';

/** Waiting longer than this for the map's answer isn't worth holding up a report submission. */
const LOOKUP_BUDGET_MS = 5000;

/**
 * The barangay a pin is actually in: the one OpenStreetMap names for that spot, or, when it names
 * none (or doesn't answer in time), the barangay whose centre is nearest. Reports are tagged with
 * this rather than the barangay the app sent, so the label always follows the pin - older app
 * builds sent the reporter's own barangay no matter where the pin was. Never throws.
 */
export async function barangayForPin(lat: number, lng: number): Promise<string> {
  const geo = await Promise.race([
    reverseGeocode(lat, lng).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), LOOKUP_BUDGET_MS)),
  ]);
  return barangayFromPlaces([...(geo?.places ?? []), geo?.area]) ?? nearestBarangay(lat, lng);
}
