import { nearestBarangay } from '../config/barangays';
import { isWithinServiceArea } from '../config/serviceArea';
import { reverseGeocode } from './reverseGeocode.service';

/** What a pin outside the city is called when its town could not be looked up. */
export const OUTSIDE_SJDM = 'Outside San Jose Del Monte';

/**
 * The barangay a pin is in: the one whose centre is nearest (63 centres, one per barangay, see
 * config/barangays.ts). Reports are tagged with this rather than the barangay the app sent, so the
 * label always follows the pin - older app builds sent the reporter's own barangay.
 *
 * Not taken from OpenStreetMap's address for the spot: San Jose Del Monte has no barangay
 * boundaries in OSM, so its address names a nearby place that can be the wrong barangay (a pin
 * in Fatima V came back as "Fatima I"). The nearest centre agrees with the map's own labels.
 *
 * A pin outside the city (only possible while the geo-fence is switched off) is not given the
 * nearest San Jose Del Monte barangay - a pin in Marilao is not in Muzon West. It is named after
 * its own place and town from OpenStreetMap ("Lambakin, Marilao"), or "Outside San Jose Del Monte".
 */
export async function barangayForPin(lat: number, lng: number): Promise<string> {
  if (isWithinServiceArea([lng, lat])) return nearestBarangay(lat, lng);
  const place = await reverseGeocode(lat, lng);
  const name = [place?.area, place?.city].filter((p, i, all): p is string => Boolean(p) && all.indexOf(p) === i);
  return name.length ? name.join(', ') : OUTSIDE_SJDM;
}
