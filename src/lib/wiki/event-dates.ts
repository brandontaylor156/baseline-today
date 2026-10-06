// Dates from a tennis event infobox (pure, unit tested): "13–19 March", "27 February – 5 March",
// "March 13–19", "January 30 – February 5", "13–19 March 2023". The season fills in the year.

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const month = (s: string) => MONTHS.findIndex((m) => m.startsWith(s.toLowerCase().slice(0, 3)));
const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export function eventDates(field: string, season: number): { start: string; end: string } | null {
  const text = field
    // Unwrap templates ({{nowrap|…}}) and links, keeping their text.
    .replace(/\{\{[^|{}]*\|/g, " ")
    .replace(/\}\}|<[^>]+>|\[\[|\]\]/g, " ")
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  const year = Number(text.match(/\b(19|20)\d{2}\b/)?.[0]) || season;
  const M = "(jan\\w*|feb\\w*|mar\\w*|apr\\w*|may|jun\\w*|jul\\w*|aug\\w*|sep\\w*|oct\\w*|nov\\w*|dec\\w*)";
  let m: RegExpMatchArray | null;
  // 13-19 March / 27 February - 5 March
  if ((m = text.match(new RegExp(`(\\d{1,2})\\s*(?:${M})?\\s*-\\s*(\\d{1,2})\\s*${M}`, "i")))) {
    const endMonth = month(m[4]);
    const startMonth = m[2] ? month(m[2]) : endMonth;
    const startYear = startMonth > endMonth ? year - 1 : year;
    return { start: iso(startYear, startMonth, Number(m[1])), end: iso(year, endMonth, Number(m[3])) };
  }
  // March 13-19 / January 30 - February 5
  if ((m = text.match(new RegExp(`${M}\\s*(\\d{1,2})\\s*-\\s*(?:${M}\\s*)?(\\d{1,2})`, "i")))) {
    const startMonth = month(m[1]);
    const endMonth = m[3] ? month(m[3]) : startMonth;
    const startYear = startMonth > endMonth ? year - 1 : year;
    return { start: iso(startYear, startMonth, Number(m[2])), end: iso(year, endMonth, Number(m[4])) };
  }
  return null;
}
