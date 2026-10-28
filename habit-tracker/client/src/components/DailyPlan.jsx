import { useEffect, useState } from 'react';
import { Check, Circle, Plus, Trash2 } from 'lucide-react';
import { fmt } from '../lib';
import { Card, btnP, inp } from './ui';

const STATES = [
  { id: 'planned', label: 'Planned' },
  { id: 'done', label: 'Done' },
  { id: 'moved', label: 'Moved' },
  { id: 'dropped', label: 'Dropped' },
];

export default function DailyPlan({ today, day = {}, onSave }) {
  const [title, setTitle] = useState('');
  const [outcome, setOutcome] = useState(day.studyOutcome || '');
  const [nextStep, setNextStep] = useState(day.studyNextStep || '');
  useEffect(() => {
    setOutcome(day.studyOutcome || '');
    setNextStep(day.studyNextStep || '');
  }, [today, day.studyOutcome, day.studyNextStep]);

  const priorities = day.priorities || [];
  const addPriority = (event) => {
    event.preventDefault();
    const clean = title.trim();
    if (!clean || priorities.length >= 3) return;
    onSave({ priorities: [...priorities, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, title: clean, status: 'planned', reason: '' }] });
    setTitle('');
  };
  const patchPriority = (index, patch) => onSave({ priorities: priorities.map((item, i) => i === index ? { ...item, ...patch } : item) });
  const setRating = (field, value) => onSave({ [field]: value });
  const done = priorities.filter(item => item.status === 'done').length;

  return <Card title="Plan vs. actual" action={<span className="text-xs text-zinc-500">{fmt(today, { month: 'short', day: 'numeric' })}</span>}>
    <p className="mb-4 text-sm text-zinc-500">Choose up to three priorities. A task marked moved or dropped won’t count as completed.</p>
    <div className="mb-4 grid grid-cols-3 gap-2 text-center">
      <div className="rounded-xl bg-zinc-50 p-2.5 dark:bg-zinc-800/60"><b className="block text-lg">{priorities.length}</b><span className="text-[11px] text-zinc-500">planned</span></div>
      <div className="rounded-xl bg-emerald-50 p-2.5 dark:bg-emerald-500/10"><b className="block text-lg text-emerald-700 dark:text-emerald-300">{done}</b><span className="text-[11px] text-zinc-500">completed</span></div>
      <div className="rounded-xl bg-amber-50 p-2.5 dark:bg-amber-500/10"><b className="block text-lg text-amber-700 dark:text-amber-300">{priorities.filter(item => ['moved', 'dropped'].includes(item.status)).length}</b><span className="text-[11px] text-zinc-500">changed</span></div>
    </div>

    {priorities.length > 0 && <ul className="mb-3 space-y-2">{priorities.map((item, index) => <li key={item.id || index} className="rounded-xl border border-zinc-100 p-3 dark:border-zinc-800">
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 ${item.status === 'done' ? 'text-emerald-600' : 'text-zinc-400'}`}>{item.status === 'done' ? <Check size={16} /> : <Circle size={16} />}</span>
        <div className="min-w-0 flex-1"><p className={`text-sm font-medium ${item.status === 'done' ? 'text-zinc-500 line-through' : ''}`}>{item.title}</p>
          {['moved', 'dropped'].includes(item.status) && <input aria-label={`Why ${item.title} was ${item.status}`} className={`${inp} mt-2 py-1.5 text-xs`} maxLength={120} placeholder="Optional: what changed?" defaultValue={item.reason || ''} onBlur={event => event.target.value !== (item.reason || '') && patchPriority(index, { reason: event.target.value })} />}
        </div>
        <select aria-label={`Status for ${item.title}`} className="rounded-lg border border-zinc-200 bg-transparent px-2 py-1 text-xs dark:border-zinc-700" value={item.status || 'planned'} onChange={event => patchPriority(index, { status: event.target.value })}>
          {STATES.map(state => <option key={state.id} value={state.id}>{state.label}</option>)}
        </select>
        <button type="button" className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10" aria-label={`Remove ${item.title}`} onClick={() => onSave({ priorities: priorities.filter((_, i) => i !== index) })}><Trash2 size={14} /></button>
      </div>
    </li>)}</ul>}

    {priorities.length < 3 && <form onSubmit={addPriority} className="flex gap-2">
      <input className={inp} maxLength={120} value={title} onChange={event => setTitle(event.target.value)} placeholder="What matters most today?" />
      <button className={btnP} disabled={!title.trim()} aria-label="Add priority"><Plus size={16} />Add</button>
    </form>}

    <div className="mt-5 grid gap-4 border-t border-zinc-100 pt-4 dark:border-zinc-800 sm:grid-cols-2">
      {[["energy", "Energy"], ["focus", "Focus"]].map(([field, label]) => <div key={field}>
        <p className="mb-2 text-sm font-medium">{label} <span className="text-xs font-normal text-zinc-400">1 low · 5 high</span></p>
        <div className="flex gap-1.5">{[1, 2, 3, 4, 5].map(value => <button type="button" key={value} aria-label={`${label} ${value} out of 5`} aria-pressed={Number(day[field]) === value} onClick={() => setRating(field, value)} className={`grid h-8 w-9 place-items-center rounded-lg text-sm font-semibold ${Number(day[field]) === value ? 'bg-indigo-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-indigo-50 dark:bg-zinc-800 dark:text-zinc-300'}`}>{value}</button>)}</div>
      </div>)}
    </div>

    <div className="mt-5 grid gap-3 border-t border-zinc-100 pt-4 dark:border-zinc-800">
      <label className="text-sm font-medium">Study / work result <span className="font-normal text-zinc-400">(what did you learn or finish?)</span>
        <textarea className={`${inp} mt-1.5`} rows={2} maxLength={500} placeholder="For example: solved 2 React questions; still need to practice props." value={outcome} onChange={event => setOutcome(event.target.value)} onBlur={() => outcome !== (day.studyOutcome || '') && onSave({ studyOutcome: outcome })} />
      </label>
      <label className="text-sm font-medium">Next step
        <input className={`${inp} mt-1.5`} maxLength={200} placeholder="What is the next small step?" value={nextStep} onChange={event => setNextStep(event.target.value)} onBlur={() => nextStep !== (day.studyNextStep || '') && onSave({ studyNextStep: nextStep })} />
      </label>
    </div>
  </Card>;
}
