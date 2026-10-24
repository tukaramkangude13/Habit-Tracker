import { useMemo, useState } from 'react';
import { CheckCircle2, Circle, FileDown, FileSpreadsheet } from 'lucide-react';
import { addDays, fmt, key, parse, weekDates } from '../lib';
import { buildTaskReport, downloadTaskCsv, printTaskReport } from '../taskReport';
import { Bar, Card, btn, btnP, inp } from './ui';

export default function TaskReport({ habits, days, today }) {
  const [from, setFrom] = useState(weekDates(today)[0]);
  const [to, setTo] = useState(today);
  const [err, setErr] = useState('');
  const rep = useMemo(() => buildTaskReport(habits, days, today, from, to), [habits, days, today, from, to]);

  const preset = (id) => {
    setErr('');
    setTo(today);
    setFrom(id === 'today' ? today : id === 'week' ? weekDates(today)[0] : id === 'month' ? today.slice(0, 8) + '01' : key(addDays(parse(today), -29)));
  };
  const todayRow = rep.rows.find((r) => r.d === today);
  const run = (fn) => { try { setErr(''); fn(rep, today); } catch (e) { setErr(e.message); } };
  const bad = from > to;

  return (
    <Card title="Task report">
      <p className="mb-4 text-sm text-zinc-500">Choose the days. See which tasks you completed and which are still pending, then download it.</p>
      <div className="flex flex-wrap items-end gap-2">
        {[['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['30', 'Last 30 days']].map(([id, l]) => (
          <button key={id} onClick={() => preset(id)} className="rounded-full bg-zinc-100 px-3 py-1 text-xs hover:bg-zinc-200 dark:bg-zinc-800">{l}</button>
        ))}
        <label className="ml-auto text-xs text-zinc-500">From<input type="date" max={today} value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} className={`${inp} mt-1 w-auto py-1`} /></label>
        <label className="text-xs text-zinc-500">To<input type="date" max={today} value={to} onChange={(e) => e.target.value && setTo(e.target.value)} className={`${inp} mt-1 w-auto py-1`} /></label>
      </div>
      {(bad || err) && <p role="alert" className="mt-3 text-xs text-red-500">{bad ? 'The start date must be before the end date.' : err}</p>}

      {!bad && rep.rows.length === 0 ? (
        <p className="mt-6 text-center text-sm text-zinc-500">No tracked days in this range. Days before your first record are not counted.</p>
      ) : !bad && (
        <div className="mt-5 space-y-5">
          <dl className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
            {[['Completed', rep.completed, 'text-emerald-600'], ['Pending', rep.pending, 'text-red-500'], ['Completion', rep.rate === null ? '-' : `${rep.rate}%`, ''], ['Perfect days', rep.perfect, '']].map(([l, v, c]) => (
              <div key={l} className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/50"><dd className={`text-xl font-semibold ${c}`}>{v}</dd><dt className="text-xs text-zinc-500">{l}</dt></div>
            ))}
          </dl>
          {todayRow && (
            <div className="rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800">
              <p className="mb-2 font-medium">Today</p>
              <ul className="grid gap-1 sm:grid-cols-2">
                {todayRow.done.map((n) => <li key={n} className="flex items-center gap-2 text-emerald-600"><CheckCircle2 size={15} />{n}</li>)}
                {todayRow.pending.map((n) => <li key={n} className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300"><Circle size={15} className="text-red-400" />{n} <span className="text-xs text-zinc-400">pending</span></li>)}
              </ul>
            </div>
          )}
          <div>
            <p className="mb-2 text-sm font-medium">Daily mood and task status</p>
            <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-800/60"><tr><th className="p-3">Date</th><th className="p-3">Mood</th><th className="p-3">Completed</th><th className="p-3">Pending</th></tr></thead>
                <tbody>{rep.rows.map((r) => <tr key={r.d} className="border-t border-zinc-100 dark:border-zinc-800"><td className="p-3">{fmt(r.d)}</td><td className="p-3">{r.mood || <span className="text-zinc-400">Not recorded</span>}</td><td className="p-3 text-emerald-600">{r.done.length}</td><td className="p-3 text-rose-500">{r.pending.length}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">By task</p>
            <ul className="space-y-3">
              {[...rep.tasks].sort((a, b) => b.pending - a.pending).map((t) => (
                <li key={t.name}>
                  <div className="mb-1 flex justify-between gap-2 text-sm"><span className="truncate">{t.name}</span><span className="shrink-0 text-xs text-zinc-500">{t.done} done, {t.pending} pending ({t.pct}%)</span></div>
                  <Bar value={t.pct} />
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={btnP} onClick={() => run(printTaskReport)}><FileDown size={16} />PDF</button>
            <button className={btn} onClick={() => run(downloadTaskCsv)}><FileSpreadsheet size={16} />Excel (CSV)</button>
          </div>
          <p className="text-xs text-zinc-400">Counted from {fmt(rep.from)} to {fmt(rep.to)}. Weekly habits are excluded. One-time tasks stay pending until completed and count once in the summary. Mood is shown when recorded.</p>
        </div>
      )}
    </Card>
  );
}