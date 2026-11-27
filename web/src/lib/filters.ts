/** Small helpers shared by the console's list filters. */

/** Whether `iso` falls between two YYYY-MM-DD days (Manila time), either end optional. */
export function inDateRange(iso: string | undefined, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!iso) return false;
  const t = +new Date(iso);
  if (from && t < +new Date(`${from}T00:00:00+08:00`)) return false;
  if (to && t > +new Date(`${to}T23:59:59.999+08:00`)) return false;
  return true;
}

/** Every word typed appears somewhere in the given fields (case-insensitive). */
export function matchesText(query: string, fields: (string | number | undefined | null)[]): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fields.filter((f) => f !== undefined && f !== null && f !== '').join(' ').toLowerCase();
  return words.every((w) => hay.includes(w));
}
