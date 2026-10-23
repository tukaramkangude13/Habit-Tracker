import { useEffect, useMemo, useState } from 'react';
import { FileDown, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { api } from '../api';
import { addDays, key, parse } from '../lib';
import { buildNutritionReport, downloadNutritionCsv, printNutritionReport } from '../nutritionReport';
import { Card, btn, btnP, iconBtn, inp } from './ui';

export default function NutritionReport({ today }) {
  const [data, setData] = useState(null);
  const [from, setFrom] = useState(key(addDays(parse(today), -6)));
  const [to, setTo] = useState(today);
  const [err, setErr] = useState('');

  const load = () => Promise.all([api.get('/foodlogs'), api.get('/nutrition/profile'), api.get('/weights')])
    .then(([foods, profile, weights]) => { setData({ foods, profile, weights }); setErr(''); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const rep = useMemo(() => (data ? buildNutritionReport({ ...data, today, from, to }) : null), [data, today, from, to]);
  const preset = (id) => { setTo(today); setFrom(id === '7' ? key(addDays(parse(today), -6)) : id === 'month' ? today.slice(0, 8) + '01' : key(addDays(parse(today), -29))); };
  const run = (fn) => { try { setErr(''); fn(rep); } catch (e) { setErr(e.message); } };
  const bad = from > to;

  return (
    <Card title="Nutrition report" action={<button className={iconBtn} aria-label="Refresh" onClick={load}><RefreshCw size={15} /></button>}>
      <p className="mb-4 text-sm text-zinc-500">Pick the days, then download what you ate, your calories and protein against your plan, and your weight trend.</p>
      <div className="flex flex-wrap items-end gap-2">
        {[['7', 'Last 7 days'], ['month', 'This month'], ['30', 'Last 30 days']].map(([id, l]) => (
          <button key={id} onClick={() => preset(id)} className="rounded-full bg-zinc-100 px-3 py-1 text-xs hover:bg-zinc-200 dark:bg-zinc-800">{l}</button>
        ))}
        <label className="ml-auto text-xs text-zinc-500">From<input type="date" max={today} value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} className={`${inp} mt-1 w-auto py-1`} /></label>
        <label className="text-xs text-zinc-500">To<input type="date" max={today} value={to} onChange={(e) => e.target.value && setTo(e.target.value)} className={`${inp} mt-1 w-auto py-1`} /></label>
      </div>
      {(bad || err) && <p role="alert" className="mt-3 text-xs text-red-500">{bad ? 'The start date must be before the end date.' : err}</p>}
      {!data && !err && <p className="mt-4 text-sm text-zinc-500">Loading...</p>}
      {rep && !bad && (rep.n === 0 ? (
        <p className="mt-5 text-center text-sm text-zinc-500">No food logged in this range. Days before your first entry are not counted.</p>
      ) : (
        <div className="mt-5 space-y-4">
          <dl className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
            {[['Days logged', `${rep.n} of ${rep.cal.length}`], ['Avg calories', Math.round(rep.avgK).toLocaleString()], ['Avg protein', `${Math.round(rep.avgP)} g`], ['Days on plan', rep.onPlan === null ? '-' : `${rep.onPlan} of ${rep.n}`]].map(([l, v]) => (
              <div key={l} className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/50"><dd className="text-lg font-semibold">{v}</dd><dt className="text-xs text-zinc-500">{l}</dt></div>
            ))}
          </dl>
          <div className="flex flex-wrap gap-2">
            <button className={btnP} onClick={() => run(printNutritionReport)}><FileDown size={16} />PDF</button>
            <button className={btn} onClick={() => run(downloadNutritionCsv)}><FileSpreadsheet size={16} />Excel (CSV)</button>
          </div>
        </div>
      ))}
    </Card>
  );
}
