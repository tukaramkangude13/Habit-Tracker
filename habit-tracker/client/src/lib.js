// Dates are local YYYY-MM-DD keys. Date, streak and progress helpers live here.
export const key = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const parse = (k) => new Date(k + 'T00:00:00');
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const weekDates = (today) => {
  const mon = addDays(parse(today), -((parse(today).getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => key(addDays(mon, i)));
};
export const fmt = (k, o = { month: 'long', day: 'numeric' }) => parse(k).toLocaleDateString('en-US', o);

export const doneCount = (day, habits) => habits.filter((h) => day?.done?.includes(h._id)).length;
export const pct = (day, habits) => (habits.length ? Math.round((doneCount(day, habits) / habits.length) * 100) : 0);

// Consecutive days ending today (or yesterday if today isn't done yet) for which has(dateKey) is true.
export const streakOf = (has) => {
  let d = new Date();
  if (!has(key(d))) d = addDays(d, -1);
  let n = 0;
  while (has(key(d))) { n++; d = addDays(d, -1); }
  return n;
};
export const bestStreak = (keys) => {
  let best = 0, run = 0, prev = null;
  for (const k of [...keys].sort()) {
    run = prev && key(addDays(parse(prev), 1)) === k ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }
  return best;
};
export const goalPct = (g) => {
  const m = g.milestones || [];
  if (m.length) return Math.round((m.filter((x) => x.done).length / m.length) * 100);
  return g.target > 0 ? Math.min(100, Math.round((g.current / g.target) * 100)) : 0;
};
