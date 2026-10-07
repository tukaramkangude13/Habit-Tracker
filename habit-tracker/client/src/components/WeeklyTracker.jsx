import { useState } from 'react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, fmt, key, parse, pct, weekDates } from '../lib';
import { Card, btn, iconBtn } from './ui';

const D = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function WeeklyTracker({ habits, days, today, onToggle }) {
  const [offset, setOffset] = useState(0); // 0 = this week, -1 = last week, ...
  const week = weekDates(key(addDays(parse(today), offset * 7)));
  const range = `${fmt(week[0], { month: 'short', day: 'numeric' })} - ${fmt(week[6], { month: 'short', day: 'numeric' })}`;
  const elapsed = week.filter((k) => k <= today);
  const weekPct = elapsed.length ? Math.round(elapsed.reduce((a, k) => a + pct(days[k], habits), 0) / elapsed.length) : 0;
  const cols = 'grid grid-cols-[minmax(0,1fr)_repeat(7,1.75rem)] items-center gap-x-1 sm:grid-cols-[minmax(0,1fr)_repeat(7,2.5rem)]';

  return (
    <Card
      title={offset === 0 ? 'This Week' : range}
      action={
        <div className="flex items-center gap-1">
          <span className="mr-2 text-xs text-zinc-500">{weekPct}% done</span>
          {offset !== 0 && <button className={`${btn} py-1 text-xs`} onClick={() => setOffset(0)}>This week</button>}
          <button className={iconBtn} aria-label="Previous week" onClick={() => setOffset(offset - 1)}><ChevronLeft size={16} /></button>
          <button className={`${iconBtn} disabled:opacity-30`} aria-label="Next week" disabled={offset >= 0} onClick={() => setOffset(offset + 1)}><ChevronRight size={16} /></button>
        </div>
      }
    >
      {habits.length === 0 ? <p className="text-sm text-zinc-500">Add habits to see your week.</p> : (
        <div className="space-y-1">
          <div className={cols}>
            <span />
            {D.map((d, i) => (
              <span key={d} className={`rounded-md py-0.5 text-center text-[11px] ${week[i] === today ? 'bg-indigo-600 font-semibold text-white' : 'text-zinc-500'}`}
                title={fmt(week[i])}>{d}</span>
            ))}
          </div>
          {habits.map((h) => (
            <div key={h._id} className={cols}>
              <span className="truncate pr-2 text-sm">{h.name}</span>
              {week.map((k) => {
                const on = days[k]?.done?.includes(h._id), future = k > today;
                return (
                  <button key={k} disabled={future} onClick={() => onToggle(h._id, k)} aria-label={`${h.name} ${k}`} aria-pressed={!!on}
                    className={`mx-auto grid h-6 w-6 place-items-center rounded-full border transition sm:h-7 sm:w-7 ${on ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-zinc-300 dark:border-zinc-700'} ${k === today && !on ? 'border-indigo-400' : ''} ${future ? 'opacity-30' : 'hover:border-indigo-500'}`}>
                    {on && <Check size={13} strokeWidth={3} />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}