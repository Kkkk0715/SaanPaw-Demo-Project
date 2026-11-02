import type { AnimalCaseStatus, AnimalReport } from './types';

/** Text helpers, so both surfaces phrase things the same way. */

/** Relative time, e.g. "4h ago". */
export function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - +new Date(iso)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * What to call a report. Lost pets have a name; found animals get described.
 * "other" means nothing to a reader, so the breed stands in for it.
 */
export function describeAnimal(
  report: Pick<AnimalReport, 'name' | 'color' | 'breed' | 'animalType'>,
): string {
  if (report.name) return report.name;
  const noun = report.animalType === 'other' ? (report.breed ?? 'animal') : report.animalType;
  const colour = report.color?.trim();
  return colour ? `${colour} ${noun}` : `Unidentified ${noun}`;
}

/**
 * Human-readable status, e.g. "account_banned" -> "account banned". The case status
 * "under_rescue" reads as "under recovery" - the stored value is unchanged.
 */
export function humanizeStatus(status: string): string {
  if (status === 'under_rescue') return 'under recovery';
  return status.replace(/_/g, ' ');
}

// ------------------------------------------------------------------ passwords

/** The password rules the server enforces. Shown as a live checklist under every new-password field. */
export const PASSWORD_RULES: { label: string; test: (pw: string) => boolean }[] = [
  { label: 'At least 8 characters', test: (pw) => pw.length >= 8 },
  { label: 'At least 1 number', test: (pw) => /\d/.test(pw) },
  { label: 'At least 1 special character (e.g. ! @ # $ %)', test: (pw) => /[^A-Za-z0-9\s]/.test(pw) },
];

export const passwordChecks = (pw: string) => PASSWORD_RULES.map((r) => ({ label: r.label, met: r.test(pw) }));

export const passwordMeetsRules = (pw: string) => PASSWORD_RULES.every((r) => r.test(pw));

// --------------------------------------------------------------- input filters

/** Keeps digits only, for number-only fields (capacity, house no., codes). */
export const digitsOnly = (text: string) => text.replace(/\D+/g, '');

/** Keeps letters (any alphabet, so "Ñ" works), spaces, hyphens, apostrophes and periods - for name fields. */
export const lettersOnly = (text: string) => text.replace(/[^\p{L} .'-]+/gu, '');

// ----------------------------------------------------------------- case status

/** A case only moves forward: under recovery -> one outcome. Matches the server's rule. */
export const CASE_STATUS_NEXT: Record<AnimalCaseStatus, AnimalCaseStatus[]> = {
  under_rescue: ['reunited', 'adopted', 'inconclusive'],
  reunited: [],
  adopted: [],
  inconclusive: [],
};

export const nextCaseStatuses = (status: AnimalCaseStatus) => CASE_STATUS_NEXT[status];

export const isCaseClosed = (status: AnimalCaseStatus) => CASE_STATUS_NEXT[status].length === 0;

/** After these outcomes the report behind the case stops showing in report lists. */
export const isReportHidingStatus = (status: AnimalCaseStatus) => status === 'adopted' || status === 'inconclusive';

// ------------------------------------------------------------------ pagination

export interface Page<T> {
  items: T[];
  /** 1-based, clamped to the available pages. */
  page: number;
  pageCount: number;
  total: number;
  /** 1-based index of the first and last item shown, for "Showing 11-20 of 43". */
  from: number;
  to: number;
}

export function paginate<T>(items: T[], page: number, pageSize: number): Page<T> {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const start = (current - 1) * pageSize;
  const slice = items.slice(start, start + pageSize);
  return { items: slice, page: current, pageCount, total, from: total ? start + 1 : 0, to: start + slice.length };
}

// --------------------------------------------------------------------- address

/** Where a report came from, most specific first: "12 Quirino Hwy, Muzon (near the chapel)". */
export function reportPlace(report: Pick<AnimalReport, 'address' | 'landmark' | 'barangay'>): string {
  const base = report.address?.trim() || `Brgy. ${report.barangay}`;
  return report.landmark?.trim() ? `${base} (${report.landmark.trim()})` : base;
}

/** Hides a private identifier except its last few characters, e.g. "SJDM-2026-0042" -> "••••042". */
export function maskPrivate(value: string | undefined, visible = 3): string {
  if (!value) return '—';
  return value.length <= visible ? '••••' : `••••${value.slice(-visible)}`;
}

// ----------------------------------------------------------------------- charts

export interface DailyCount {
  /** yyyy-mm-dd, local time. */
  date: string;
  /** Short label, e.g. "Mon". */
  label: string;
  lost: number;
  found: number;
}

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Lost and found reports per day for the last `days` days (oldest first), for the dashboard charts. */
export function reportsPerDay(reports: Pick<AnimalReport, 'kind' | 'reportedAt'>[], days = 7, now = new Date()): DailyCount[] {
  const buckets: DailyCount[] = [];
  const index = new Map<string, DailyCount>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const bucket = { date: dayKey(d), label: d.toLocaleDateString('en-US', { weekday: 'short' }), lost: 0, found: 0 };
    buckets.push(bucket);
    index.set(bucket.date, bucket);
  }
  for (const r of reports) {
    const bucket = index.get(dayKey(new Date(r.reportedAt)));
    if (bucket) bucket[r.kind] += 1;
  }
  return buckets;
}

/** Counts per key, e.g. reports per status, for a breakdown bar chart. */
export function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    const k = key(item);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
