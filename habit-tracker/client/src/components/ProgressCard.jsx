import { Card } from './ui';

export default function ProgressCard({ done, total }) {
  const p = total ? Math.round((done / total) * 100) : 0;
  const r = 42, c = 2 * Math.PI * r;
  const msg = !total ? 'Add a habit to get started.' : p === 100 ? 'Perfect day. Well done.' : p >= 50 ? 'More than halfway there. Keep going.' : p > 0 ? 'Good start. One more.' : 'A fresh day. Pick one habit to begin.';
  return (
    <Card title="Today's Progress">
      <div className="flex items-center gap-6">
        <svg width="110" height="110" viewBox="0 0 100 100" role="img" aria-label={`${p}% complete`}>
          <circle cx="50" cy="50" r={r} fill="none" strokeWidth="8" className="stroke-zinc-100 dark:stroke-zinc-800" />
          <circle cx="50" cy="50" r={r} fill="none" strokeWidth="8" strokeLinecap="round" strokeDasharray={c}
            strokeDashoffset={c * (1 - p / 100)} transform="rotate(-90 50 50)" className="stroke-indigo-600 transition-all duration-500" />
          <text x="50" y="56" textAnchor="middle" className="fill-current text-[20px] font-semibold">{p}%</text>
        </svg>
        <div>
          <p className="text-lg font-medium">{done} of {total} habits completed</p>
          <p className="text-sm text-zinc-500">{msg}</p>
        </div>
      </div>
    </Card>
  );
}
