// Weeks for the weekly recap (pure, unit tested). A week runs Monday to Sunday (UTC) and is named by
// its Monday, so /week/2026-09-28 covers tournaments that ended 28 Sep to 4 Oct 2026.

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** The Monday on or before an ISO date. */
export function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return iso(new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY));
}

export function isMonday(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) && mondayOf(date) === date;
}

/** Monday and Sunday of a week. */
export function weekRange(monday: string): { start: string; end: string } {
  return { start: monday, end: iso(new Date(Date.parse(`${monday}T00:00:00Z`) + 6 * DAY)) };
}

export function shiftWeek(monday: string, weeks: number): string {
  return iso(new Date(Date.parse(`${monday}T00:00:00Z`) + weeks * 7 * DAY));
}

/** "28 Sep – 4 Oct 2026". */
export function weekLabel(monday: string): string {
  const { end } = weekRange(monday);
  const f = (d: string, year: boolean) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });
  return `${f(monday, false)} – ${f(end, true)}`;
}

/** Weeks, newest first, in which at least one tournament finished, up to the last complete week. */
export function finishedWeeks(endDates: (string | null)[], today: string): string[] {
  const lastComplete = shiftWeek(mondayOf(today), -1);
  const weeks = new Set(endDates.filter((d): d is string => !!d).map(mondayOf));
  return [...weeks].filter((w) => w <= lastComplete).sort().reverse();
}
