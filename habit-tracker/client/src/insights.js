import { addDays, doneCount, key, parse, pct } from './lib';

const avg = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0);
const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const hr = (h) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;
const top = (arr) => {
  const c = {};
  arr.forEach((v) => { c[v] = (c[v] || 0) + 1; });
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0];
};

// Each insight needs a minimum amount of data, so nothing is shown from just a couple of days.
export function buildInsights({ habits, days, reflections, today }) {
  const out = [];
  if (!habits.length) return out;
  const tracked = Object.keys(days).filter((k) => k <= today && doneCount(days[k], habits) > 0).sort();
  if (!tracked.length) return out;

  const floor = key(addDays(parse(today), -59));
  const range = [];
  for (let d = parse(tracked[0] > floor ? tracked[0] : floor); key(d) <= today; d = addDays(d, 1)) range.push(key(d));
  const p = (k) => pct(days[k], habits);

  // Sleep vs completion
  const slept = range.filter((k) => days[k]?.sleep != null);
  const hi = slept.filter((k) => days[k].sleep >= 7).map(p);
  const lo = slept.filter((k) => days[k].sleep < 7).map(p);
  if (hi.length >= 3 && lo.length >= 3) {
    const d = avg(hi) - avg(lo);
    out.push({
      id: 'sleep', tone: d >= 0 ? 'good' : 'warn', title: 'Sleep and follow-through', n: hi.length + lo.length,
      text: `On days you sleep 7+ hours you complete ${avg(hi)}% of habits, versus ${avg(lo)}% after shorter nights (${d >= 0 ? '+' : ''}${d} points).`,
    });
  }

  // Strongest and weakest weekday
  if (range.length >= 14) {
    const by = Array.from({ length: 7 }, () => []);
    range.forEach((k) => by[parse(k).getDay()].push(p(k)));
    const ranked = by.map((a, i) => ({ i, n: a.length, v: avg(a) })).filter((x) => x.n >= 2).sort((a, b) => b.v - a.v);
    const best = ranked[0], worst = ranked[ranked.length - 1];
    if (ranked.length >= 4 && best.v - worst.v >= 10) {
      out.push({
        id: 'weekday', tone: 'info', title: 'Your weekly rhythm', n: range.length,
        text: `${WD[best.i]} is your strongest day (${best.v}%) and ${WD[worst.i]} your weakest (${worst.v}%). Plan something lighter or earlier on ${WD[worst.i]}s.`,
      });
    }
  }

  // Mood vs completion
  const moods = range.filter((k) => days[k]?.mood);
  const up = moods.filter((k) => ['great', 'good'].includes(days[k].mood)).map(p);
  const dn = moods.filter((k) => ['low', 'bad'].includes(days[k].mood)).map(p);
  if (up.length >= 3 && dn.length >= 3) {
    out.push({
      id: 'mood', tone: avg(dn) >= avg(up) ? 'good' : 'info', title: 'Mood and habits', n: up.length + dn.length,
      text: `On good-mood days you complete ${avg(up)}% of habits, and ${avg(dn)}% on low-mood days. ${avg(dn) >= avg(up) ? 'You keep going even when you feel low.' : 'On low days, a tiny version of one habit keeps your chain alive.'}`,
    });
  }

  // Slips (from the Reflection Log)
  const rec = reflections.filter((r) => r.date >= key(addDays(parse(today), -29)));
  if (rec.length >= 3) {
    const t = top(rec.map((r) => r.trigger));
    const h = top(rec.map((r) => r.hour).filter((x) => x != null));
    out.push({
      id: 'slips', tone: 'warn', title: 'When slips happen', n: rec.length,
      text: `Most common trigger: ${t[0]} (${t[1]} of ${rec.length} entries).${h ? ` Riskiest time: around ${hr(Number(h[0]))}.` : ''} Add friction just before that time, such as leaving your phone in another room.`,
    });
    const slipDays = new Set(rec.map((r) => r.date));
    const s = range.filter((k) => slipDays.has(k)).map(p), c = range.filter((k) => !slipDays.has(k)).map(p);
    if (s.length >= 3 && c.length >= 3) {
      out.push({
        id: 'slipdays', tone: 'info', title: 'Slips and your habits', n: s.length + c.length,
        text: `You complete ${avg(s)}% of habits on days you log a slip, versus ${avg(c)}% on other days.`,
      });
    }
  }
  return out;
}