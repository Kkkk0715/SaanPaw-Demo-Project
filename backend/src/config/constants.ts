export const ROLES = ['developer', 'shelter_admin', 'user'] as const;
export type Role = (typeof ROLES)[number];

export const ANIMAL_TYPES = ['dog', 'cat', 'other'] as const;

/** Lost / found report lifecycle. */
export const REPORT_STATUSES = ['active', 'matched', 'recovered', 'closed'] as const;

/** Animal case status - exactly the four states named in the proposal scope. */
export const ANIMAL_CASE_STATUSES = [
  'under_rescue',
  'reunited',
  'adopted',
  'inconclusive',
] as const;

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
 * Once reunited, adopted or inconclusive it is closed, so a status can never loop back.
 */
export const CASE_STATUS_TRANSITIONS: Record<CaseStatusValue, readonly CaseStatusValue[]> = {
  under_rescue: ['reunited', 'adopted', 'inconclusive'],
  reunited: [],
  adopted: [],
  inconclusive: [],
};

export const canChangeCaseStatus = (from: CaseStatusValue, to: CaseStatusValue) =>
  CASE_STATUS_TRANSITIONS[from].includes(to);

/** Wording shown to people. The stored value stays `under_rescue` so existing data keeps working. */
export const CASE_STATUS_LABELS: Record<CaseStatusValue, string> = {
  under_rescue: 'Under recovery',
  reunited: 'Reunited',
  adopted: 'Adopted',
  inconclusive: 'Inconclusive',
};

/** Outcomes after which the report behind a case stops being listed. */
export const CLOSING_CASE_STATUSES: readonly CaseStatusValue[] = ['adopted', 'inconclusive'];
