import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, FileDown, FileSpreadsheet } from 'lucide-react';
import { api } from '../api';
import { fmt, habitAppliesOn, key, parse } from '../lib';
import { downloadCsv, printReport } from '../report';
import { Bar, Card, btn, btnP, iconBtn } from './ui';

export default function MonthlyReport({ habits, days, today }) {
  const [m, setM] = useState(() => parse(today).getFullYear() * 12 + parse(today).getMonth());
  const [err, setErr] = useState('');
  const [time, setTime] = useState({ logs: [], limit: 60 });
  const [timeReady, setTimeReady] = useState(false);
  const y = Math.floor(m / 12), mo = m % 12;
  const label = new Date(y, mo, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const summary = useMemo(() => {
    const month = `${y}-${String(mo + 1).padStart(2, '0')}`;
    const end = month === today.slice(0, 7) ? today : key(new Date(y, mo + 1, 0));
    const dates = Array.from({ length: Number(end.slice(-2)) }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
    let done = 0, due = 0, tracked = 0, perfect = 0;
    const daily = dates.map(date => {
      const eligible = habits.filter(h => h.frequency !== 'weekly' && h.frequency !== 'once' && habitAppliesOn(h, date));
      if (!days[date] || !eligible.length) return { date, rate: null };
      const completed = eligible.filter(h => days[date].done?.includes(h._id)).length;
      tracked++; done += completed; due += eligible.length;
      if (completed === eligible.length) perfect++;
      return { date, rate: completed / eligible.length * 100 };
    });
    const logs = time.logs.filter(row => row.date.startsWith(month) && row.date <= today);
    const total = logs.reduce((sum, row) => sum + (Number(row.minutes) || 0), 0);
    const categories = Object.entries(logs.reduce((out, row) => { out[row.category] = (out[row.category] || 0) + (Number(row.minutes) || 0); return out; }, {})).sort((a, b) => b[1] - a[1]);
    return { daily, done, due, tracked, perfect, rate: due ? Math.round(done / due * 100) : null, logs, total, categories, loggedDays: new Set(logs.map(row => row.date)).size };
  }, [y, mo, today, habits, days, time.logs]);
  const hm = (minutes) => { const value = Math.round(minutes); return value >= 60 ? `${Math.floor(value / 60)}h ${value % 60}m` : `${value}m`; };

  // Time-wasted entries and the daily limit are fetched here so the report can include them.
  useEffect(() => {
    Promise.allSettled([api.get('/timelogs'), api.get('/settings')]).then(([logsResult, settingsResult]) => {
      if (logsResult.status === 'fulfilled') setTime({ logs: logsResult.value, limit: settingsResult.status === 'fulfilled' && settingsResult.value.timeLimit > 0 ? settingsResult.value.timeLimit : 60 });
      else setErr(`Time report could not load: ${logsResult.reason?.message || 'server unavailable'}`);
      setTimeReady(true);
    });
  }, []);

  const run = (fn) => { try { setErr(''); fn(y, mo, habits, days, today, time); } catch (e) { setErr(e.message); } };
  return (
    <Card title="Monthly Report">
      <div className="mb-3 flex items-center justify-between text-sm">
        <button className={iconBtn} aria-label="Previous month" onClick={() => setM(m - 1)}><ChevronLeft size={16} /></button>
        <span className="font-medium">{label}</span>
        <button className={iconBtn} aria-label="Next month" disabled={m >= parse(today).getFullYear() * 12 + parse(today).getMonth()} onClick={() => setM(m + 1)}><ChevronRight size={16} /></button>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Habit completion', summary.rate === null ? 'No data' : `${summary.rate}%`, `${summary.done} of ${summary.due} scheduled check-ins`],
          ['Days tracked', summary.tracked, `${summary.perfect} complete days`],
          ['Time logged', !timeReady ? 'Loading…' : hm(summary.total), `${summary.logs.length} entries · ${summary.loggedDays} days`],
          ['Daily average', !timeReady ? 'Loading…' : summary.loggedDays ? hm(summary.total / summary.loggedDays) : 'No data', 'on days with time entries'],
        ].map(([title, value, detail]) => <div key={title} className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/60"><p className="text-xs text-zinc-500">{title}</p><p className="mt-1 text-lg font-semibold">{value}</p><p className="text-[11px] text-zinc-500">{detail}</p></div>)}
      </div>
      <div className="mb-4 grid gap-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800 md:grid-cols-2">
        <div><h3 className="mb-2 text-sm font-semibold">Daily task completion</h3><div className="flex h-24 items-end gap-1">{summary.daily.map(day => <div key={day.date} title={`${fmt(day.date)}: ${day.rate === null ? 'not tracked' : `${Math.round(day.rate)}%`}`} className="flex h-full flex-1 items-end"><div className="w-full rounded-t bg-indigo-500" style={{ height: day.rate === null ? '2px' : `${Math.max(3, day.rate)}%`, opacity: day.rate === null ? 0.2 : 1 }} /></div>)}</div><p className="mt-2 text-xs text-zinc-500">Faint bars mean no daily record. Completion uses only habits due that day.</p></div>
        <div><h3 className="mb-2 text-sm font-semibold">Time you marked as wasted</h3>{summary.categories.length ? <ul className="space-y-2">{summary.categories.slice(0, 5).map(([category, minutes]) => <li key={category}><div className="mb-1 flex justify-between gap-2 text-xs"><span className="truncate">{category}</span><span>{hm(minutes)} · {summary.total ? Math.round(minutes / summary.total * 100) : 0}%</span></div><Bar value={summary.categories[0][1] ? minutes / summary.categories[0][1] * 100 : 0} /></li>)}</ul> : <p className="text-sm text-zinc-500">{timeReady ? 'No time entries this month. Log time in Time Audit to see where it goes.' : 'Loading time entries…'}</p>}</div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button disabled={!timeReady || (!habits.length && !summary.logs.length)} className={`${btnP} disabled:opacity-50`} onClick={() => run(printReport)}><FileDown size={16} />PDF</button>
        <button disabled={!timeReady || (!habits.length && !summary.logs.length)} className={`${btn} disabled:opacity-50`} onClick={() => run(downloadCsv)}><FileSpreadsheet size={16} />Excel (CSV)</button>
      </div>
      {err && <p role="alert" className="mt-2 text-xs text-red-500">{err}</p>}
    </Card>
  );
}
