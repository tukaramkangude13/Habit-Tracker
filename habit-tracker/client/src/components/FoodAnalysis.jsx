import { useMemo, useState } from 'react';
import { addDays, fmt, key, parse } from '../lib';
import { analyse } from '../nutritionStats';
import { Bar, Card, btn } from './ui';

const SORTS = [['times', 'Times eaten'], ['kcal', 'Calories'], ['protein', 'Protein']];
const pill = (on) => `${btn} py-1 text-xs ${on ? 'border-indigo-600 bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10' : ''}`;

// target is optional: { kcal, protein } from the plan, or null before setup.
export default function FoodAnalysis({ foods, today, target, onOpen }) {
  const [n, setN] = useState(7);
  const [sort, setSort] = useState('times');
  const a = useMemo(() => analyse(foods, today, n), [foods, today, n]);
  const rows = [...a.foods].sort((x, y) => y[sort] - x[sort]).slice(0, 8);
  const max = rows[0]?.[sort] || 1;
  const avgK = a.days ? Math.round(a.totalKcal / a.days) : 0, avgP = a.days ? Math.round(a.totalProtein / a.days) : 0;
  const scale = target?.kcal || Math.max(1, ...Object.values(a.byDay).map((d) => d.kcal));
  const topMeal = Object.entries(a.byMeal).sort((x, y) => y[1] - x[1])[0];
  const topEaten = [...a.foods].sort((x, y) => y.times - x.times)[0];
  const topProt = [...a.foods].sort((x, y) => y.protein - x.protein)[0];
  const dayList = Array.from({ length: n }, (_, i) => key(addDays(parse(today), -i)));
  const stats = [['Days logged', `${a.days} / ${n}`], ['Avg calories', `${avgK}`], ['Avg protein', `${avgP} g`]];
  if (target) stats.push(['Days on target', `${a.dates.filter((d) => a.byDay[d].kcal >= target.kcal * 0.9).length} / ${a.days}`]);
  const tips = a.days ? [
    `Most eaten: ${topEaten.name}, logged ${topEaten.times} times.`,
    topProt.protein > 0 && `Biggest protein source: ${topProt.name}, ${Math.round((topProt.protein / a.totalProtein) * 100)}% of your protein.`,
    a.totalKcal > 0 && `You eat most of your calories at ${topMeal[0].toLowerCase()} (${Math.round((topMeal[1] / a.totalKcal) * 100)}%).`,
    target && avgK < target.kcal * 0.9 && `Your average is ${target.kcal - avgK} kcal below target. Add a calorie-dense snack such as peanuts, a banana shake or peanut butter on roti.`,
    target && avgP < target.protein * 0.9 && `Protein averages ${avgP} g against a target of ${target.protein} g. Paneer, eggs, dal, soya or whey can close the gap.`,
  ].filter(Boolean) : [];

  return (
    <Card title="Food analysis" action={<div className="flex gap-1">{[7, 30].map((d) => <button key={d} className={pill(n === d)} onClick={() => setN(d)}>{d} days</button>)}</div>}>
      {a.days === 0 ? <p className="py-6 text-center text-sm text-zinc-500">No food logged in the last {n} days. Log meals in the Daily diary and your patterns will show here.</p> : (
        <div className="space-y-6">
          <dl className={`grid grid-cols-2 gap-3 text-center ${target ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
            {stats.map(([l, v]) => <div key={l} className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/50"><dd className="text-lg font-semibold">{v}</dd><dt className="text-xs text-zinc-500">{l}</dt></div>)}
          </dl>
          <ul className="space-y-1.5 text-sm text-zinc-600 dark:text-zinc-300">{tips.map((t) => <li key={t}>{t}</li>)}</ul>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-medium">What you eat most</h3>
                <div className="flex gap-1">{SORTS.map(([k, l]) => <button key={k} className={pill(sort === k)} onClick={() => setSort(k)}>{l}</button>)}</div>
              </div>
              <ul className="space-y-3">
                {rows.map((r) => (
                  <li key={r.name}>
                    <div className="mb-1 flex justify-between gap-2 text-sm"><span className="truncate">{r.name}</span>
                      <span className="shrink-0 text-xs text-zinc-500">{r.times}x, {Math.round(r.kcal)} kcal, {Math.round(r.protein)} g</span></div>
                    <Bar value={(r[sort] / max) * 100} />
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-3 text-sm font-medium">Calories by meal</h3>
              <ul className="space-y-3">
                {Object.entries(a.byMeal).map(([m, k]) => (
                  <li key={m}>
                    <div className="mb-1 flex justify-between text-sm"><span>{m}</span><span className="text-xs text-zinc-500">{Math.round(k)} kcal, {a.totalKcal ? Math.round((k / a.totalKcal) * 100) : 0}%</span></div>
                    <Bar value={a.totalKcal ? (k / a.totalKcal) * 100 : 0} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium">Day by day (click a day to open its diary)</h3>
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {dayList.map((d) => {
                const day = a.byDay[d];
                return (
                  <li key={d}>
                    <button onClick={() => onOpen(d)} className="grid w-full grid-cols-[5rem_1fr_8rem] items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                      <span className="text-zinc-500">{fmt(d, { month: 'short', day: 'numeric' })}</span>
                      <Bar value={day ? Math.min(100, (day.kcal / scale) * 100) : 0} />
                      <span className="text-right text-xs text-zinc-500">{day ? `${Math.round(day.kcal)} kcal, ${Math.round(day.protein)} g` : 'Not logged'}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </Card>
  );
}
