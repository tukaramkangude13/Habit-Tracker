import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { fmt, key, parse, pct } from '../lib';
import { Card, iconBtn } from './ui';

const LEVELS = ['bg-zinc-100 dark:bg-zinc-800', 'bg-indigo-100 dark:bg-indigo-950', 'bg-indigo-200 dark:bg-indigo-900',
  'bg-indigo-400 dark:bg-indigo-700', 'bg-indigo-500', 'bg-indigo-700 dark:bg-indigo-400'];
const level = (p) => (p === 0 ? 0 : p <= 25 ? 1 : p <= 50 ? 2 : p <= 75 ? 3 : p < 100 ? 4 : 5);

export default function HabitHeatmap({ habits, days, today }) {
  const [m, setM] = useState(() => parse(today).getMonth() + parse(today).getFullYear() * 12);
  const y = Math.floor(m / 12), mo = m % 12;
  const first = new Date(y, mo, 1), n = new Date(y, mo + 1, 0).getDate(), lead = (first.getDay() + 6) % 7;
  const cells = [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => key(new Date(y, mo, i + 1)))];
  return (
    <Card title="Monthly Activity" action={
      <div className="flex items-center gap-1 text-sm">
        <button className={iconBtn} aria-label="Previous month" onClick={() => setM(m - 1)}><ChevronLeft size={16} /></button>
        <span className="w-28 text-center">{first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
        <button className={iconBtn} aria-label="Next month" onClick={() => setM(m + 1)}><ChevronRight size={16} /></button>
      </div>}>
      <div className="grid grid-cols-7 gap-1.5">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className="text-center text-[10px] text-zinc-400">{d}</span>)}
        {cells.map((k, i) => {
          if (!k) return <span key={i} />;
          const p = k > today ? 0 : pct(days[k], habits);
          return <div key={k} title={`${fmt(k)} - ${p}% completed`} className={`aspect-square rounded-md ${LEVELS[level(p)]} ${k === today ? 'ring-2 ring-indigo-600 ring-offset-1 dark:ring-offset-zinc-900' : ''}`} />;
        })}
      </div>
      <div className="mt-3 flex items-center justify-end gap-1 text-[10px] text-zinc-500">
        Less {LEVELS.map((c) => <span key={c} className={`h-3 w-3 rounded-sm ${c}`} />)} More
      </div>
    </Card>
  );
}
