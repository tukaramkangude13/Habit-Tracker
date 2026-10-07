import { useEffect, useState } from 'react';
import { Bar, Card, inp } from './ui';

const MOODS = [['great', '😄', 'Great'], ['good', '🙂', 'Good'], ['okay', '😐', 'Okay'], ['low', '😔', 'Low'], ['bad', '😫', 'Bad']];

export function MoodTracker({ mood, onChange }) {
  return (
    <Card title="How are you feeling today?">
      <div className="flex justify-between gap-1" role="radiogroup">
        {MOODS.map(([id, e, label]) => (
          <button key={id} role="radio" aria-checked={mood === id} onClick={() => onChange(id)}
            className={`flex flex-1 flex-col items-center rounded-xl border py-2 text-xs transition ${mood === id ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-500/10' : 'border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>
            <span className="text-xl">{e}</span>{label}
          </button>
        ))}
      </div>
    </Card>
  );
}

export function SleepTracker({ sleep, date, onChange }) {
  const [err, setErr] = useState('');
  const commit = (e) => {
    const raw = e.target.value;
    if (raw === '') return setErr('');
    const v = Number(raw);
    if (!(v >= 0 && v <= 24)) return setErr('Enter hours between 0 and 24.');
    setErr(''); onChange(v);
  };
  return (
    <Card title="Sleep">
      <div className="mb-3 flex items-baseline gap-2">
        <input key={`${date}-${sleep}`} type="number" min="0" max="24" step="0.5" defaultValue={sleep ?? ''} onBlur={commit} aria-label="Hours slept" placeholder="0" className={`${inp} w-20`} />
        <span className="text-sm text-zinc-500">/ 8 hours</span>
      </div>
      <Bar value={Math.min(100, ((sleep || 0) / 8) * 100)} />
      {err && <p role="alert" className="mt-2 text-xs text-red-500">{err}</p>}
    </Card>
  );
}

export function DailyNotes({ note, date, onSave }) {
  const [v, setV] = useState(note || '');
  useEffect(() => setV(note || ''), [date]); // eslint-disable-line
  useEffect(() => {
    if (v === (note || '')) return;
    const t = setTimeout(() => onSave(v), 600);
    return () => clearTimeout(t);
  }, [v]); // eslint-disable-line
  return (
    <Card title="Daily Notes">
      <textarea rows={4} value={v} onChange={(e) => setV(e.target.value)} placeholder="What did you accomplish today?" aria-label="Daily note" className={`${inp} resize-none`} />
      <p className="mt-1 text-right text-[11px] text-zinc-400">Saved automatically</p>
    </Card>
  );
}
