import { addDays, doneCount, fmt, key, parse, pct } from '../lib';
import { Card } from './ui';

export default function WeeklyAnalytics({ habits, days, today }) {
  const ds = Array.from({ length: 7 }, (_, i) => key(addDays(parse(today), i - 6)));
  const v = ds.map((k) => pct(days[k], habits));
  const max = Math.max(...v), avg = Math.round(v.reduce((a, b) => a + b, 0) / 7);
  const total = ds.reduce((a, k) => a + doneCount(days[k], habits), 0);
  return (
    <Card title="Last 7 Days">
      <div className="flex h-32 items-end gap-2">
        {ds.map((k, i) => (
          <div key={k} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${fmt(k)}: ${v[i]}%`}>
            <span className="text-[10px] text-zinc-500">{v[i]}%</span>
            <div className="w-full rounded-t-md bg-indigo-600 transition-all duration-500" style={{ height: `${Math.max(v[i], 3)}%`, opacity: v[i] ? 1 : 0.15 }} />
            <span className="text-[10px] text-zinc-500">{fmt(k, { weekday: 'narrow' })}</span>
          </div>
        ))}
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
        {[['Average', `${avg}%`], ['Best day', max ? fmt(ds[v.indexOf(max)], { weekday: 'short' }) : 'None'], ['Completed', total]].map(([l, x]) => (
          <div key={l}><dd className="font-semibold">{x}</dd><dt className="text-xs text-zinc-500">{l}</dt></div>
        ))}
      </dl>
    </Card>
  );
}
