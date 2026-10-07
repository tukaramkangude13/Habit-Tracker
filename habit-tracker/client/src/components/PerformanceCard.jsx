import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { addDays, key, parse } from '../lib';
import { avgPct, habitRate, weeklyTrend } from '../performance';
import { Bar, Card } from './ui';

const Delta = ({ v }) => {
  const I = v > 0 ? TrendingUp : v < 0 ? TrendingDown : Minus;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${v > 0 ? 'text-emerald-600' : v < 0 ? 'text-red-500' : 'text-zinc-400'}`}>
      <I size={13} />{v > 0 ? '+' : ''}{v}%
    </span>
  );
};

export default function PerformanceCard({ habits, days, today }) {
  const back = (n) => key(addDays(parse(today), -n));
  const tiles = [['Last 30 days', avgPct(today, 30, days, habits), avgPct(back(30), 30, days, habits)],
    ['Last 7 days', avgPct(today, 7, days, habits), avgPct(back(7), 7, days, habits)]];
  const trend = weeklyTrend(today, 12, days, habits);
  const rows = habits.map((h) => { const r = habitRate(h, today, 30, days); return { h, r, d: r - habitRate(h, back(30), 30, days) }; }).sort((a, b) => b.r - a.r);
  const W = 300, H = 80;
  const line = trend.map((t, i) => `${(i * W) / (trend.length - 1)},${H - (t.value / 100) * H}`).join(' ');
  return (
    <Card title="Performance Evolution">
      {habits.length === 0 ? <p className="text-sm text-zinc-500">Add habits to see how you are improving.</p> : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            {tiles.map(([l, v, p]) => (
              <div key={l} className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/50">
                <p className="text-xs text-zinc-500">{l}</p>
                <p className="text-xl font-semibold">{v}%</p>
                <Delta v={v - p} /> <span className="text-xs text-zinc-400">vs previous</span>
              </div>
            ))}
          </div>
          <div>
            <p className="mb-1 text-xs text-zinc-500">Weekly completion, last 12 weeks</p>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-24 w-full" role="img" aria-label="Weekly completion trend">
              <polygon points={`0,${H} ${line} ${W},${H}`} className="fill-indigo-600/10" />
              <polyline points={line} fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke" className="stroke-indigo-600" />
            </svg>
          </div>
          <ul className="space-y-3">
            {rows.map(({ h, r, d }) => (
              <li key={h._id}>
                <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{h.name}</span><span className="flex shrink-0 items-center gap-2">{r}% <Delta v={d} /></span>
                </div>
                <Bar value={r} />
              </li>
            ))}
          </ul>
          {rows.length > 1 && (
            <p className="text-xs text-zinc-500">Strongest: <b>{rows[0].h.name}</b>. Needs attention: <b>{rows[rows.length - 1].h.name}</b>.</p>
          )}
        </div>
      )}
    </Card>
  );
}
