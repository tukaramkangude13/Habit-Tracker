import { useEffect, useMemo, useState } from 'react';
import { Download, FileDown, FileSpreadsheet } from 'lucide-react';
import { api } from '../api';
import { addDays, fmt, key, parse } from '../lib';
import { plan } from '../nutrition';
import { downloadBackup } from '../backup';
import { downloadReportCsv, printReport } from '../reportExport';
import { Card, btn, btnP } from './ui';

const FOLLOW = 0.9; // a day "follows the plan" at 90% or more of both the calorie and the protein target

const MOODS = { great: ['😄', 4], good: ['🙂', 3], okay: ['😐', 2], low: ['😔', 1], bad: ['😫', 0] };
const hm = (m) => { m = Math.round(m); const h = Math.floor(m / 60); return h ? `${h}h ${m % 60}m` : `${m}m`; };
const M = {
  rate: { label: 'Habits done', fmt: (v) => `${Math.round(v)}%` },
  wasted: { label: 'Time wasted', fmt: hm },
  sleep: { label: 'Sleep', fmt: (v) => `${v.toFixed(1)}h` },
  screen: { label: 'Phone time', fmt: hm },
  spend: { label: 'Spending', fmt: (v) => Math.round(v).toLocaleString() },
  mood: { label: 'Mood', fmt: (v) => `${v.toFixed(1)} / 4` },
  kcalPct: { label: 'Calories vs target', fmt: (v) => `${Math.round(v)}%` },
};
const moodGroup = (r) => (r.moodScore === null ? null : r.moodScore >= 3 ? 'good' : r.moodScore === 2 ? 'okay' : 'low');
const MOOD_GROUPS = [
  { label: 'Good mood', test: (r) => moodGroup(r) === 'good' },
  { label: 'Okay mood', test: (r) => moodGroup(r) === 'okay' },
  { label: 'Low mood', test: (r) => moodGroup(r) === 'low' },
];
const SLEEP_GROUPS = [
  { label: 'Slept under 6h', test: (r) => r.sleep !== null && r.sleep < 6 },
  { label: '6 to 7.5h', test: (r) => r.sleep !== null && r.sleep >= 6 && r.sleep < 7.5 },
  { label: '7.5h or more', test: (r) => r.sleep !== null && r.sleep >= 7.5 },
];
const FOOD_GROUPS = [
  { label: 'Followed plan', test: (r) => r.followed === true },
  { label: 'Missed plan', test: (r) => r.followed === false },
];

// Weekly habits are left out of the daily rate. A date with no saved day record is "not tracked" (null).
const dayRate = (d, habits, days) => {
  if (!days[d]) return null;
  const dow = parse(d).getDay();
  const due = habits.filter((h) => h.frequency !== 'weekly' && key(new Date(h.createdAt)) <= d && !(h.frequency === 'weekdays' && (dow === 0 || dow === 6)));
  if (!due.length) return null;
  const done = due.filter((h) => days[d].done?.includes(h._id)).length;
  return { done, due: due.length };
};

const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

// Calculation only. The screen and both downloads use this result.
function analyze(title, rows, groups, metrics) {
  const cols = groups.map((g) => {
    const r = rows.filter(g.test);
    const avg = {};
    metrics.forEach((id) => {
      const v = r.map((x) => x[id]).filter((x) => x !== null);
      avg[id] = v.length >= 3 ? mean(v) : null; // fewer than 3 days is noise
    });
    return { ...g, n: r.length, avg };
  });
  const [a, b] = [cols[0], cols[cols.length - 1]];
  const notes = metrics.flatMap((id) => {
    const x = a.avg[id], z = b.avg[id];
    if (x === null || z === null || Math.max(x, z) === 0) return [];
    if (Math.abs(x - z) / Math.max(x, z) < 0.2) return [];
    return [`${M[id].label} averaged ${M[id].fmt(x)} on "${a.label}" days vs ${M[id].fmt(z)} on "${b.label}" days.`];
  });
  return { title, metrics, cols, notes };
}

// Display only. Each value gets a bar scaled against the largest value in its row.
function Compare({ a: { title, metrics, cols, notes } }) {
  return (
    <Card title={title}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[460px] text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500">
              <th className="pb-2 font-normal" />
              {cols.map((c) => <th key={c.label} className="pb-2 pr-3 font-normal">{c.label}<span className="block text-[10px]">{c.n} days{c.n < 5 ? ' (few)' : ''}</span></th>)}
            </tr>
          </thead>
          <tbody>
            {metrics.map((id) => {
              const top = Math.max(...cols.map((c) => c.avg[id] ?? 0), 0.0001);
              return (
                <tr key={id} className="border-t border-zinc-100 align-top dark:border-zinc-800">
                  <td className="py-2 pr-3 text-zinc-500">{M[id].label}</td>
                  {cols.map((c) => (
                    <td key={c.label} className="py-2 pr-3">
                      <span className="font-medium">{c.avg[id] === null ? '-' : M[id].fmt(c.avg[id])}</span>
                      <div className="mt-1 h-1.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800">
                        <div className="h-1.5 rounded-full bg-indigo-500" style={{ width: c.avg[id] === null ? 0 : `${(c.avg[id] / top) * 100}%` }} />
                      </div>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {notes.length > 0 ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{notes.map((n) => <li key={n}>{n}</li>)}</ul>
      ) : (
        <p className="mt-3 text-xs text-zinc-500">No clear difference yet, or not enough days. A column needs at least 3 days with data.</p>
      )}
    </Card>
  );
}

const Kpi = ({ label, value, sub }) => (
  <div className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
    <p className="truncate text-xs text-zinc-500">{label}</p>
    <p className="mt-1 text-xl font-semibold">{value}</p>
    <p className="truncate text-xs text-zinc-400">{sub}</p>
  </div>
);

export default function Report({ habits, days, today }) {
  const [span, setSpan] = useState('month'); // 'month' | 30 | 90
  const [extra, setExtra] = useState(null);
  const [goal, setGoal] = useState(null); // { kcal, protein } from the Nutrition plan, or null if no plan is set up
  const [err, setErr] = useState('');

  const n = span === 'month' ? parse(today).getDate() : span; // number of days shown
  const from = key(addDays(parse(today), 1 - n));
  const label = span === 'month' ? fmt(today, { month: 'long', year: 'numeric' }) : `last ${span} days`;

  useEffect(() => {
    let live = true;
    setExtra(null); setErr('');
    api.get(`/report?from=${from}&to=${today}`).then((d) => live && setExtra(d)).catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [from, today]);

  // Same calculation as the Nutrition tab: profile + latest logged weight.
  useEffect(() => {
    let live = true;
    Promise.all([api.get('/nutrition/profile'), api.get('/weights')]).then(([p, w]) => {
      if (!live || !p) return;
      const P = plan({ ...p, weight: w.length ? w[w.length - 1].kg : p.weight }, today);
      setGoal({ kcal: P.gain <= 0 ? P.tdee : P.kcal, protein: P.protein });
    }).catch(() => {});
    return () => { live = false; };
  }, [today]);

  const rows = useMemo(() => {
    if (!extra) return [];
    const any = (f) => Object.values(extra).some((x) => x[f] !== undefined);
    const tw = any('wasted'), ts = any('spend'); // never logged in this range = "no data", not 0
    return Array.from({ length: n }, (_, i) => key(addDays(parse(today), i - n + 1))).map((d) => {
      const day = days[d], x = extra[d] || {}, r = dayRate(d, habits, days);
      const ate = goal && x.kcal !== undefined; // a day with no food logged is "not tracked", not a missed day
      return {
        d, mood: day?.mood || null, moodScore: MOODS[day?.mood]?.[1] ?? null,
        sleep: typeof day?.sleep === 'number' ? day.sleep : null,
        rate: r ? (r.done / r.due) * 100 : null, done: r?.done ?? null, due: r?.due ?? null,
        wasted: tw ? x.wasted || 0 : null, spend: ts ? x.spend || 0 : null, screen: x.screen ?? null,
        kcal: x.kcal ?? null, protein: x.protein ?? null,
        kcalPct: ate ? (x.kcal / goal.kcal) * 100 : null,
        followed: ate ? x.kcal >= FOLLOW * goal.kcal && (x.protein || 0) >= FOLLOW * goal.protein : null,
        note: day?.note || '',
      };
    });
  }, [extra, habits, days, today, n, goal]);

  const analysis = useMemo(() => {
    if (!extra) return [];
    const sc = rows.map((r) => ({ ...r, mood: r.moodScore }));
    const out = [
      analyze('What changes with your mood', sc.filter((r) => r.moodScore !== null), MOOD_GROUPS, ['rate', 'wasted', 'sleep', 'screen', 'spend', 'kcalPct']),
      analyze('What changes with your sleep', sc, SLEEP_GROUPS, ['mood', 'rate', 'wasted', 'screen', 'spend']),
    ];
    if (sc.some((r) => r.followed !== null)) {
      out.push(analyze('What changes when you follow your nutrition plan', sc.filter((r) => r.followed !== null), FOOD_GROUPS, ['mood', 'rate', 'wasted', 'sleep', 'screen']));
    }
    return out;
  }, [rows, extra]);

  const run = (fn) => { try { setErr(''); fn({ rows, analysis, M, MOODS, label }); } catch (e) { setErr(e.message); } };

  const col = (k) => rows.map((r) => r[k]).filter((v) => v !== null);
  const avgOf = (k) => (col(k).length ? mean(col(k)) : null);
  const wastedTotal = col('wasted').reduce((s, v) => s + v, 0);
  const moodAvg = col('moodScore').length ? mean(col('moodScore')) : null;
  const moodEmoji = moodAvg === null ? '' : Object.values(MOODS).find(([, s]) => s === Math.round(moodAvg))?.[0];
  const foodDays = col('followed');
  const followedDays = foodDays.filter(Boolean).length;

  return (
    <div className="space-y-6">
      <Card title="Report"
        action={<div className="flex flex-wrap justify-end gap-1">{[['month', 'This month'], [30, '30 days'], [90, '90 days']].map(([v, l]) => (
          <button key={v} onClick={() => setSpan(v)} className={`rounded-full px-3 py-1 text-xs ${span === v ? 'bg-indigo-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800'}`}>{l}</button>
        ))}</div>}>
        {err && <p role="alert" className="mb-3 text-xs text-red-500">{err}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm capitalize text-zinc-500">{label}</p>
          <div className="flex flex-wrap gap-2">
            <button disabled={!extra} className={`${btnP} disabled:opacity-50`} onClick={() => run(printReport)}><FileDown size={16} />PDF</button>
            <button disabled={!extra} className={`${btn} disabled:opacity-50`} onClick={() => run(downloadReportCsv)}><FileSpreadsheet size={16} />Excel (CSV)</button>
            <button className={btn} onClick={() => downloadBackup().catch((e) => setErr(e.message))}><Download size={16} />Backup (JSON)</button>
          </div>
        </div>
      </Card>

      {!extra && !err && <p className="py-10 text-center text-sm text-zinc-500">Loading...</p>}

      {extra && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi label="Habits done (avg)" value={avgOf('rate') === null ? '-' : M.rate.fmt(avgOf('rate'))} sub={`${col('rate').length} tracked days`} />
            <Kpi label="Sleep (avg)" value={avgOf('sleep') === null ? '-' : M.sleep.fmt(avgOf('sleep'))} sub={`${col('sleep').length} nights logged`} />
            <Kpi label="Time wasted" value={col('wasted').length ? hm(wastedTotal) : '-'} sub={col('wasted').length ? `${hm(wastedTotal / rows.length)} a day` : 'nothing logged'} />
            <Kpi label="Average mood" value={moodAvg === null ? '-' : `${moodEmoji} ${moodAvg.toFixed(1)}`} sub={`${col('moodScore').length} days with mood`} />
            <Kpi label="Nutrition plan" value={foodDays.length ? `${followedDays} / ${foodDays.length} days` : '-'} sub={goal ? (foodDays.length ? 'days you followed it' : 'no food logged') : 'set up a plan first'} />
          </div>

          {analysis.map((a) => <Compare key={a.title} a={a} />)}
          <p className="px-1 text-xs text-zinc-500">These are patterns, not causes. Low mood might make you waste time, or wasting time might lower your mood. The tables only show what tends to happen together.</p>
        </>
      )}
    </div>
  );
}