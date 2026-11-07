export const ROLES = ['developer', 'shelter_admin', 'user'] as const;
export type Role = (typeof ROLES)[number];

export const ANIMAL_TYPES = ['dog', 'cat', 'other'] as const;

/** Lost / found report lifecycle. */
export const REPORT_STATUSES = ['active', 'matched', 'recovered', 'closed'] as const;

/**
 * Animal case status - the four states named in the proposal scope, plus "recovered": the shelter
 * has the animal in its care. A recovered case is closed as a case and carries on as a Shelter
 * Animal record, where the final outcome (reunited / adopted / inconclusive) is set.
 */
export const ANIMAL_CASE_STATUSES = [
  'under_rescue',
  'recovered',
  'reunited',
  'adopted',
  'inconclusive',
] as const;

/** A shelter animal's own statuses: in care, then one outcome. "Recovered" applies to cases only. */
export const SHELTER_ANIMAL_STATUSES = ['under_rescue', 'reunited', 'adopted', 'inconclusive'] as const;

export const SHELTER_APPROVAL_STATUSES = ['pending', 'approved', 'rejected'] as const;

export const NOTIFICATION_TYPES = [
  'lost_report',
  'found_report',
  'match',
  'message',
  'status_update',
  'moderation',
] as const;

type CaseStatusValue = (typeof ANIMAL_CASE_STATUSES)[number];

/**
 * A case only moves forward: it opens as "under recovery" and ends in exactly one outcome.
 * Once recovered, reunited, adopted or inconclusive it is closed, so a status can never loop back.
 */
export const CASE_STATUS_TRANSITIONS: Record<CaseStatusValue, readonly CaseStatusValue[]> = {
  under_rescue: ['recovered', 'reunited', 'adopted', 'inconclusive'],
  recovered: [],
  reunited: [],
  adopted: [],
  inconclusive: [],
};

export const canChangeCaseStatus = (from: CaseStatusValue, to: CaseStatusValue) =>
  CASE_STATUS_TRANSITIONS[from].includes(to);

/** Wording shown to people. The stored value stays `under_rescue` so existing data keeps working. */
export const CASE_STATUS_LABELS: Record<CaseStatusValue, string> = {
  under_rescue: 'Under recovery',
  recovered: 'Recovered',
  reunited: 'Reunited',
  adopted: 'Adopted',
  inconclusive: 'Inconclusive',
};

/**
 * Case outcomes that put the animal on the shelter's Shelter Animals list: recovered (in care,
 * outcome still to come), reunited or adopted. Inconclusive means the shelter never had it.
 */
export const SHELTERED_CASE_STATUSES: readonly CaseStatusValue[] = ['recovered', 'reunited', 'adopted'];

/** Outcomes after which the report behind a case stops being listed. */
export const CLOSING_CASE_STATUSES: readonly CaseStatusValue[] = ['adopted', 'inconclusive'];
