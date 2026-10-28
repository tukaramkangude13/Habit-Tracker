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
// Due vs hit for one habit in a month. Daily: every day. Weekdays: Mon-Fri. Weekly: one hit per Mon-Sun week.
// Only days from the habit's creation date up to today count.
export const habitStats = (h, days, ks, today) => {
  const start = h.startDate || (h.createdAt ? key(new Date(h.createdAt)) : ks[0]);
  let due = 0, hit = 0;
  const weeks = {};
  for (const k of ks) {
    if (k > today || k < start || (h.endDate && k > h.endDate) || (h.archivedOn && k >= h.archivedOn)) continue;
    const dow = parse(k).getDay();
    const done = !!days[k]?.done?.includes(h._id);
    if (h.frequency === 'weekly') {
      const w = key(addDays(parse(k), -((dow + 6) % 7)));
      weeks[w] = weeks[w] || done;
    } else if (h.frequency === 'weekdays' && (dow === 0 || dow === 6)) continue;
    else { due++; if (done) hit++; }
  }
  const w = Object.values(weeks);
  return { due: due + w.length, hit: hit + w.filter(Boolean).length };
};
// Habits that counted on a given date: already created, and not yet archived.
export const habitsOn = (habits, d) =>
  habits.filter((h) => habitAppliesOn(h, d));

export const habitAppliesOn = (habit, date) => {
  const created = habit.startDate || (habit.createdAt ? key(new Date(habit.createdAt)) : date);
  if (date < created || (habit.endDate && date > habit.endDate) || (habit.archivedOn && date >= habit.archivedOn)) return false;
  const weekday = parse(date).getDay();
  return habit.frequency !== 'weekdays' || (weekday !== 0 && weekday !== 6);
};
