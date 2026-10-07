import { Flame, Trophy, CheckCircle2, Star } from 'lucide-react';

export default function StreakStats({ current, best, total, perfect }) {
  const items = [[Flame, 'Current Streak', `${current} Days`, 'text-orange-500'], [Trophy, 'Best Streak', `${best} Days`, 'text-amber-500'],
    [CheckCircle2, 'Completed', `${total} Habits`, 'text-emerald-500'], [Star, 'Perfect Days', `${perfect} Days`, 'text-indigo-500']];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map(([I, label, value, color]) => (
        <div key={label} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <I size={18} className={color} />
          <p className="mt-2 text-xl font-semibold">{value}</p>
          <p className="text-xs text-zinc-500">{label}</p>
        </div>
      ))}
    </div>
  );
}
