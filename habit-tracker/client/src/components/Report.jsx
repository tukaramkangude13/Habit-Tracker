import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../api';
import { habitStats, key, parse } from '../lib';
import { Bar, Card, iconBtn } from './ui';

const hm = (m) => { m = Math.round(m); const h = Math.floor(m / 60); return h ? `${h}h ${m % 60}m` : `${m}m`; };
const num = (v) => Math.round(v).toLocaleString();
const inp = 'w-24 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900';
const TARGETS = [['habitPct', 'Habit completion (%)'], ['sleepMin', 'Min average sleep (hours)'], ['screenMax', 'Max phone time (min/day)']];

export default function Report({ habits, days, today }) {
  const [m, setM] = useState(() => parse(today).getFullYear() * 12 + parse(today).getMonth());
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const y = Math.floor(m / 12), mo = m % 12;
  const month = `${y}-${String(mo + 1).padStart(2, '0')}`;
  const label = new Date(y, mo, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  useEffect(() => {
    let live = true;
    setData(null); setErr('');
    api.get(`/report?month=${month}`).then((d) => live && setData(d)).catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [month]);

  const saveTarget = async (k, v) => {
    const value = Number(v || 0);
    if (!(value >= 0)) return setErr('Target cannot be negative.');
    try {
      setErr(''); await api.put(`/settings/${k}`, { value });
      setData((d) => ({ ...d, settings: { ...d.settings, [k]: value } }));
    } catch (e) { setErr(e.message); }
  };

  const r = useMemo(() => {
    if (!data) return null;
    const ks = Array.from({ length: new Date(y, mo + 1, 0).getDate() }, (_, i) => key(new Date(y, mo, i + 1)));
    const perHabit = habits.map((h) => ({ h, ...habitStats(h, days, ks, today) })).filter((x) => x.due);
    const due = perHabit.reduce((a, x) => a + x.due, 0), hit = perHabit.reduce((a, x) => a + x.hit, 0);
    const from = data.wasted.firstDate && data.wasted.firstDate > ks[0] ? data.wasted.firstDate : ks[0];
    const elapsed = ks.filter((k) => k >= from && k <= today).length;
    return {
      perHabit,
      habitPct: due ? Math.round((hit / due) * 100) : null,
      wastedAvg: data.wasted.firstDate && elapsed ? data.wasted.total / elapsed : null,
    };
  }, [data, habits, days, today, y, mo]);

  const s = data?.settings || {};
  const metrics = r && [
    { label: 'Habit completion', actual: r.habitPct, fmt: (v) => `${v}%`, target: s.habitPct, higher: true },
    { label: 'Spending', actual: data.spend.total, fmt: num, target: s.budget, higher: false },
    { label: 'Average sleep', actual: data.sleep.avg, fmt: (v) => `${v.toFixed(1)} h`, target: s.sleepMin, higher: true },
    { label: 'Phone screen time / day', actual: data.screen.avg, fmt: hm, target: s.screenMax, higher: false },
    { label: 'Time wasted / day', actual: r.wastedAvg, fmt: hm, target: s.timeLimit > 0 ? s.timeLimit : 60, higher: false },
  ];
  const w = data?.weight;
  const wDelta = w && w.start !== null ? +(w.end - w.start).toFixed(1) : null;
  const wOk = w && wDelta !== null && w.target > 0 ? Math.abs(w.end - w.target) < Math.abs(w.start - w.target) : null;

  const Status = ({ ok }) => ok === null ? null
    : <span className={`text-xs font-medium ${ok ? 'text-emerald-600' : 'text-red-500'}`}>{ok ? 'On target' : 'Off target'}</span>;
  const Cats = ({ title, rows, fmt }) => rows.length > 0 && (
    <div className="min-w-0">
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      <ul className="space-y-1 text-sm">
        {rows.slice(0, 6).map(([c, v]) => <li key={c} className="flex justify-between gap-2"><span className="truncate">{c}</span><span className="shrink-0 text-zinc-500">{fmt(v)}</span></li>)}
      </ul>
    </div>
  );

  return (
    <Card title="Monthly report">
      <div className="mb-4 flex items-center justify-between text-sm">
        <button className={iconBtn} aria-label="Previous month" onClick={() => setM(m - 1)}><ChevronLeft size={16} /></button>
        <span className="font-medium">{label}</span>
        <button className={iconBtn} aria-label="Next month" onClick={() => setM(m + 1)}><ChevronRight size={16} /></button>
      </div>
      {err && <p role="alert" className="mb-3 text-xs text-red-500">{err}</p>}
      {!data ? <p className="py-6 text-center text-sm text-zinc-500">{err ? '' : 'Loading...'}</p> : (
        <div className="space-y-8">
          <div className="grid gap-4 md:grid-cols-2">
            {metrics.map((x) => {
              const has = x.actual !== null && x.actual !== undefined;
              const t = x.target > 0 ? x.target : null;
              const ok = has && t ? (x.higher ? x.actual >= t : x.actual <= t) : null;
              return (
                <div key={x.label} className="min-w-0 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-800/50">
                  <div className="flex items-center justify-between gap-2 text-sm"><span className="text-zinc-500">{x.label}</span><Status ok={ok} /></div>
                  <p className="mt-1 text-2xl font-semibold">{has ? x.fmt(x.actual) : 'No data'}</p>
                  <p className="mb-2 text-xs text-zinc-500">{t ? `${x.higher ? 'Target at least' : 'Limit'} ${x.fmt(t)}` : 'No target set'}</p>
                  {has && t && <Bar value={Math.min(100, (x.actual / t) * 100)} />}
                </div>
              );
            })}
            <div className="min-w-0 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-800/50">
              <div className="flex items-center justify-between gap-2 text-sm"><span className="text-zinc-500">Weight</span><Status ok={wOk} /></div>
              <p className="mt-1 text-2xl font-semibold">{w.end !== null ? `${w.end} kg` : 'No data'}</p>
              <p className="text-xs text-zinc-500">
                {wDelta !== null ? `${wDelta > 0 ? '+' : ''}${wDelta} kg this month` : ''}{w.target > 0 ? `${wDelta !== null ? ', ' : ''}target ${w.target} kg` : ''}
              </p>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <Cats title="Spending by category" rows={data.spend.byCategory} fmt={num} />
            <Cats title="Time wasted by category" rows={data.wasted.byCategory} fmt={hm} />
            {r.perHabit.length > 0 && (
              <div className="min-w-0">
                <h3 className="mb-2 text-sm font-medium">Habits</h3>
                <ul className="space-y-2">
                  {r.perHabit.map(({ h, due, hit }) => (
                    <li key={h._id}>
                      <div className="mb-1 flex justify-between gap-2 text-sm"><span className="truncate">{h.name}</span><span className="shrink-0 text-xs text-zinc-500">{hit}/{due}</span></div>
                      <Bar value={(hit / due) * 100} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-1 text-sm font-medium">Targets</h3>
            <p className="mb-2 text-xs text-zinc-500">0 means no target. Budget is set in Expenses and the daily time limit in Time Audit.</p>
            <div className="flex flex-wrap gap-4">
              {TARGETS.map(([k, l]) => (
                <label key={k} className="text-xs text-zinc-500">{l}
                  <input type="number" min="0" className={`${inp} mt-1 block`} defaultValue={s[k] || ''}
                    onBlur={(e) => saveTarget(k, e.target.value)} />
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}