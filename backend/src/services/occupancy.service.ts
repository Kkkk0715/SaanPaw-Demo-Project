import { ShelterAnimal } from '../models/ShelterAnimal';

/** Animals a shelter is physically looking after: in its care and not yet reunited or adopted. */
export const IN_CARE_STATUSES = ['under_rescue', 'inconclusive'];

/**
 * Live occupancy per shelter, counted from its Shelter Animals records. Occupancy used to be a
 * number the shelter typed in once, so it sat at 0 while animals came in and went home.
 */
export async function occupancyFor(shelterIds: unknown[]): Promise<Map<string, number>> {
  const ids = shelterIds.map(String);
  if (!ids.length) return new Map();
  const animals = await ShelterAnimal.find(
    { shelterId: { $in: ids }, caseStatus: { $in: IN_CARE_STATUSES } },
    'shelterId',
  ).lean();
  const counts = new Map<string, number>();
  for (const a of animals) counts.set(String(a.shelterId), (counts.get(String(a.shelterId)) ?? 0) + 1);
  return counts;
}

/** Copies the live count onto each shelter document before it is serialized. */
export async function withLiveOccupancy<T extends { _id: unknown; currentOccupancy?: number | null }>(
  shelters: T[],
): Promise<T[]> {
  const counts = await occupancyFor(shelters.map((s) => s._id));
  return shelters.map((s) => ({ ...s, currentOccupancy: counts.get(String(s._id)) ?? 0 }));
}
