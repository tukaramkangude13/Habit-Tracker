import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Lightbulb, TrendingUp } from 'lucide-react';
import { api } from '../api';
import { buildInsights } from '../insights';
import { Card } from './ui';

const TONES = {
  good: [TrendingUp, 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10'],
  warn: [AlertTriangle, 'text-amber-600 bg-amber-50 dark:bg-amber-500/10'],
  info: [Lightbulb, 'text-indigo-600 bg-indigo-50 dark:bg-indigo-500/10'],
};

export default function Insights({ habits, days, today }) {
  const [reflections, setReflections] = useState([]);
  useEffect(() => { api.get('/reflections').then(setReflections).catch(() => {}); }, []);
  const list = useMemo(() => buildInsights({ habits, days, reflections, today }), [habits, days, reflections, today]);

  return (
    <Card title="Insights">
      {list.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500">
          Not enough data yet. Keep ticking habits and logging sleep and mood for about two weeks, and patterns will appear here.
        </p>
      ) : (
        <ul className="space-y-3">
          {list.map((i) => {
            const [Icon, cls] = TONES[i.tone];
            return (
              <li key={i.id} className="flex gap-3 rounded-xl border border-zinc-100 p-4 dark:border-zinc-800">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${cls}`}><Icon size={18} /></span>
                <div>
                  <h3 className="text-sm font-medium">{i.title}</h3>
                  <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-300">{i.text}</p>
                  <p className="mt-1 text-xs text-zinc-400">Based on {i.n} {i.id === 'slips' ? 'entries' : 'days'}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-4 text-xs text-zinc-400">These are patterns in your own data, not proof of cause. Use them as hints about what to try.</p>
    </Card>
  );
}