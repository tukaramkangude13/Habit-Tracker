import { addDays, key, parse, pct } from './lib';

const span = (end, n) => Array.from({ length: n }, (_, i) => key(addDays(parse(end), i - n + 1)));

// Average daily completion % over the n days ending at `end`.
export const avgPct = (end, n, days, habits) =>
  Math.round(span(end, n).reduce((a, k) => a + pct(days[k], habits), 0) / n);

// % of the n days ending at `end` on which one habit was done.
export const habitRate = (h, end, n, days) =>
  Math.round((span(end, n).filter((k) => days[k]?.done?.includes(h._id)).length / n) * 100);

// One point per week (7-day average), oldest first.
export const weeklyTrend = (end, weeks, days, habits) =>
  Array.from({ length: weeks }, (_, i) => {
    const e = key(addDays(parse(end), -7 * (weeks - 1 - i)));
    return { end: e, value: avgPct(e, 7, days, habits) };
  });
