import { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { api } from '../api';
import { addDays, fmt, key, parse } from '../lib';
import { Bar, Card, Field, btn, btnP, iconBtn, inp } from './ui';

const CATS = ['Reels / Shorts', 'Social media', 'Chit-chat / texting', 'Movies / series / shows', 'Adult content', 'Gaming', 'Aimless browsing', 'Other'];
const QUICK = [10, 15, 30, 60, 120];
const hm = (m) => { m = Math.round(m); const h = Math.floor(m / 60); return h ? `${h}h ${m % 60}m` : `${m}m`; };
const on = 'border-indigo-600 bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10';

export default function TimeAudit({ today }) {
  const [logs, setLogs] = useState([]);
  const [limit, setLimit] = useState(60);
  const [limitText, setLimitText] = useState('60');
  const [date, setDate] = useState(today);
  const [cat, setCat] = useState(CATS[0]);
  const [minutes, setMinutes] = useState('');
  const [note, setNote] = useState('');
  const [range, setRange] = useState(7);
  const [err, setErr] = useState('');

  useEffect(() => {
    Promise.all([api.get('/timelogs'), api.get('/settings')])
      .then(([l, s]) => { setLogs(l); if (s.timeLimit > 0) { setLimit(s.timeLimit); setLimitText(String(s.timeLimit)); } })
      .catch((x) => setErr(x.message));
  }, []);

  const guard = (fn) => async (...a) => { try { setErr(''); await fn(...a); } catch (x) { setErr(x.message); } };
  const add = guard(async (e) => {
    e.preventDefault();
    const m = Math.round(Number(minutes));
    if (!(m >= 1 && m <= 720)) throw new Error('Enter minutes between 1 and 720.');
    const r = await api.post('/timelogs', { date, category: cat, minutes: m, note: note.trim() });
    setLogs((l) => [...l, r]); setMinutes(''); setNote('');
  });
  const del = guard(async (id) => { await api.del('/timelogs/' + id); setLogs((l) => l.filter((x) => x._id !== id)); });
  const saveLimit = guard(async (e) => {
    e.preventDefault();
    const v = Math.round(Number(limitText));
    if (!(v >= 1 && v <= 1440)) throw new Error('Limit must be 1 to 1440 minutes.');
    await api.put('/settings/timeLimit', { value: v }); setLimit(v);
  });

  const st = useMemo(() => {
    const days = Array.from({ length: range }, (_, i) => key(addDays(parse(today), -(range - 1 - i))));
    const tot = Object.fromEntries(days.map((d) => [d, 0])), cats = {};
    logs.forEach((l) => { if (l.date in tot) { tot[l.date] += l.minutes; cats[l.category] = (cats[l.category] || 0) + l.minutes; } });
    const sum = Object.values(tot).reduce((a, b) => a + b, 0);
    // Average only over days since your first entry, so days before you started tracking don't count as zero.
    const first = logs.reduce((m, l) => (l.date < m ? l.date : m), today);
    const counted = days.filter((d) => d >= first).length;
    const wk = (end) => logs.filter((l) => l.date > key(addDays(parse(end), -7)) && l.date <= end).reduce((a, l) => a + l.minutes, 0);
    return { days, tot, sum, avg: sum / Math.max(1, counted), max: Math.max(limit, 1, ...Object.values(tot)),
      cats: Object.entries(cats).sort((a, b) => b[1] - a[1]), thisW: wk(today), lastW: wk(key(addDays(parse(today), -7))) };
  }, [logs, range, today, limit]);

  const dayLogs = logs.filter((l) => l.date === date);
  const todayTotal = logs.filter((l) => l.date === today).reduce((a, l) => a + l.minutes, 0);
  const diff = st.thisW - st.lastW;

  return (
    <div className="space-y-6">
      {err && <p role="alert" className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-500/10">{err}</p>}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Log time you wasted">
            <form onSubmit={add} className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {CATS.map((c) => <button type="button" key={c} aria-pressed={cat === c} onClick={() => setCat(c)} className={`${btn} py-1 text-xs ${cat === c ? on : ''}`}>{c}</button>)}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Date"><input type="date" max={today} value={date} onChange={(e) => e.target.value && e.target.value <= today && setDate(e.target.value)} className={inp} /></Field>
                <Field label="Minutes"><input type="number" min="1" max="720" value={minutes} onChange={(e) => setMinutes(e.target.value)} className={inp} placeholder="e.g. 45" /></Field>
                <Field label="Note (optional)"><input maxLength={100} value={note} onChange={(e) => setNote(e.target.value)} className={inp} placeholder="e.g. before bed" /></Field>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {QUICK.map((q) => <button type="button" key={q} onClick={() => setMinutes(String(q))} className={`${btn} py-1 text-xs`}>{hm(q)}</button>)}
                <button className={`${btnP} ml-auto`}>Add</button>
              </div>
            </form>
          </Card>

          <Card title={date === today ? 'Entries: today' : `Entries: ${fmt(date, { weekday: 'short', month: 'short', day: 'numeric' })}`}>
            {dayLogs.length === 0 ? <p className="text-sm text-zinc-500">Nothing logged for this day.</p> : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {dayLogs.map((l) => (
                  <li key={l._id} className="flex items-center gap-2 py-2 text-sm">
                    <span className="flex-1 truncate">{l.category}{l.note && <span className="text-zinc-500"> | {l.note}</span>}</span>
                    <span className="font-medium">{hm(l.minutes)}</span>
                    <button className={iconBtn} aria-label={`Delete ${l.category}`} onClick={() => del(l._id)}><Trash2 size={14} /></button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card title="Today">
          <p className="text-3xl font-semibold">{hm(todayTotal)}</p>
          <p className="mb-3 text-sm text-zinc-500">of your {hm(limit)} daily limit</p>
          <div className={todayTotal > limit ? '[&_div>div]:bg-red-500' : ''}><Bar value={Math.min(100, (todayTotal / limit) * 100)} /></div>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            {todayTotal > limit ? `${hm(todayTotal - limit)} over your limit.` : `${hm(limit - todayTotal)} left before your limit.`}
          </p>
          <form onSubmit={saveLimit} className="mt-4 flex items-end gap-2">
            <Field label="Daily limit (minutes)"><input type="number" min="1" value={limitText} onChange={(e) => setLimitText(e.target.value)} className={inp} /></Field>
            <button className={btn}>Save</button>
          </form>
        </Card>
      </div>

      <Card title="Where your time goes" action={<div className="flex gap-1">{[7, 30].map((d) => <button key={d} onClick={() => setRange(d)} className={`${btn} py-1 text-xs ${range === d ? on : ''}`}>{d} days</button>)}</div>}>
        {st.sum === 0 ? <p className="py-6 text-center text-sm text-zinc-500">Nothing logged in the last {range} days. Log honestly and the picture builds up here.</p> : (
          <div className="space-y-6">
            <dl className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
              {[['Total', hm(st.sum)], ['Daily average', hm(st.avg)], ['Per year at this pace', `${Math.round((st.avg * 365) / 60)} hours`], ['Full days per year', (st.avg * 365 / 1440).toFixed(1)]].map(([l, v]) => (
                <div key={l} className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/50"><dd className="text-lg font-semibold">{v}</dd><dt className="text-xs text-zinc-500">{l}</dt></div>
              ))}
            </dl>
            {st.lastW > 0 && <p className="text-sm text-zinc-600 dark:text-zinc-300">The last 7 days: {hm(Math.abs(diff))} {diff <= 0 ? 'less' : 'more'} than the 7 days before.</p>}
            <div>
              <div className="relative">
                <div className="flex h-32 items-end gap-1">
                  {st.days.map((d) => (
                    <div key={d} title={`${fmt(d)}: ${hm(st.tot[d])}`} className="flex h-full flex-1 flex-col justify-end">
                      <div className={`w-full rounded-t ${st.tot[d] > limit ? 'bg-red-400' : 'bg-indigo-600'}`} style={{ height: `${(st.tot[d] / st.max) * 100}%`, minHeight: st.tot[d] ? 2 : 0 }} />
                    </div>
                  ))}
                </div>
                <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-emerald-500" style={{ bottom: `${(limit / st.max) * 100}%` }} />
              </div>
              {range === 7 && <div className="mt-1 flex gap-1">{st.days.map((d) => <span key={d} className="flex-1 text-center text-[10px] text-zinc-500">{fmt(d, { weekday: 'short' })}</span>)}</div>}
              <p className="mt-1 text-xs text-zinc-400">Dashed line is your daily limit. Red bars are days over it.</p>
            </div>
            <div>
              <h3 className="mb-3 text-sm font-medium">Biggest time leaks</h3>
              <ul className="space-y-3">
                {st.cats.map(([c, v]) => (
                  <li key={c}>
                    <div className="mb-1 flex justify-between text-sm"><span>{c}</span><span className="text-xs text-zinc-500">{hm(v)}, {Math.round((v / st.sum) * 100)}%</span></div>
                    <Bar value={(v / st.cats[0][1]) * 100} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Card>
      <p className="text-center text-xs text-zinc-400">Logging honestly matters more than the number. Entries are private to your account.</p>
    </div>
  );
}