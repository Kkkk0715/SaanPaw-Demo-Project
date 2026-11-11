/**
 * Age check for user registration. Same rule as ageFromBirthDate in shared/src/describe.ts, which
 * the app uses to warn before submitting; the server's answer is the one that counts.
 */

/** Users must be at least this old to register (Terms of Use). */
export const MIN_USER_AGE = 18;

/** Today's date in the Philippines (UTC+8), whatever clock the code runs on. */
function todayInManila(now: Date): { y: number; m: number; d: number } {
  const t = new Date(now.getTime() + 8 * 3600_000);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/**
 * Completed years of age for a "YYYY-MM-DD" birthday, counted on the Philippine calendar date;
 * null when the text isn't a real calendar date (e.g. 2005-02-30) or lies in the future.
 * Someone born 29 Feb turns a year older on 1 Mar in non-leap years.
 */
export function ageFromBirthDate(birthDate: string, now: Date = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate.trim());
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  const today = todayInManila(now);
  let age = today.y - y;
  if (today.m < m || (today.m === m && today.d < d)) age -= 1;
  return age < 0 ? null : age;
}
