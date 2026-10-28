import { useState } from 'react';
import { Check, Flame, Pencil, Plus, Trash2 } from 'lucide-react';
import { key, streakOf } from '../lib';
import { Card, Modal, Field, ICONS, inp, btn, btnP, iconBtn } from './ui';

const blank = { name: '', icon: 'target', frequency: 'daily', goal: '', reminder: '', startDate: key(), endDate: '' };

function HabitModal({ habit, onClose, onSave }) {
  const [f, setF] = useState(() => ({ ...habit, startDate: habit.startDate || (habit.createdAt ? key(new Date(habit.createdAt)) : key()), endDate: habit.endDate || '' }));
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = () => {
    const name = f.name.trim();
    if (!name) throw new Error('Habit name is required.');
    if (name.length > 40) throw new Error('Name must be 40 characters or fewer.');
    if (f.endDate && f.startDate && f.endDate < f.startDate) throw new Error('End date must be on or after the start date.');
    return onSave({ ...f, name });
  };
  return (
    <Modal title={f._id ? 'Edit habit' : 'New habit'} onClose={onClose} onSubmit={submit}>
      <Field label="Habit name"><input autoFocus className={inp} value={f.name} onChange={set('name')} placeholder="e.g. Morning run" /></Field>
      <Field label="Icon">
        <div className="flex flex-wrap gap-2">
          {Object.entries(ICONS).map(([k, I]) => (
            <button type="button" key={k} aria-label={k} aria-pressed={f.icon === k} onClick={() => setF({ ...f, icon: k })}
              className={`rounded-lg border p-2 transition ${f.icon === k ? 'border-indigo-600 bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10' : 'border-zinc-200 dark:border-zinc-700'}`}><I size={18} /></button>
          ))}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Frequency">
          <select className={inp} value={f.frequency} onChange={set('frequency')}>
            <option value="daily">Every day</option><option value="weekdays">Weekdays</option><option value="weekly">Weekly</option><option value="once">One-time task</option>
          </select>
        </Field>
        <Field label="Reminder (optional)"><input type="time" className={inp} value={f.reminder} onChange={set('reminder')} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start date"><input type="date" className={inp} value={f.startDate} onChange={set('startDate')} /></Field>
        <Field label="Last day (optional)"><input type="date" className={inp} min={f.startDate} value={f.endDate} onChange={set('endDate')} /></Field>
      </div>
      <p className="-mt-2 text-xs text-zinc-500">Leave the last day empty for an ongoing habit. Reports count only dates in this schedule.</p>
      <Field label="Goal (optional)"><input className={inp} value={f.goal} onChange={set('goal')} placeholder="e.g. 30 minutes" /></Field>
    </Modal>
  );
}

export default function HabitList({ habits, archivedHabits = [], days, today, onToggle, onMarkTracked, onSave, onDelete }) {
  const [edit, setEdit] = useState(null);
  const done = days[today]?.done || [];
  const explicitlyTracked = days[today]?.habitsTracked === true;
  const trackedByCompletion = done.length > 0;
  const habitsTracked = explicitlyTracked || trackedByCompletion;
  return (
    <Card title="Today's Habits" action={<div className="flex flex-wrap items-center gap-2">
      {habits.length > 0 && <button type="button" className={`${habitsTracked ? btn : btnP} py-1.5 text-xs`} aria-pressed={habitsTracked} disabled={trackedByCompletion && !explicitlyTracked} onClick={() => onMarkTracked?.(!habitsTracked)} title="Mark that you reviewed today's scheduled habits. An empty completed list is then counted as a tracked zero, not missing data.">{trackedByCompletion && !explicitlyTracked ? 'Tracked from check-offs' : habitsTracked ? 'Habits tracked ✓' : 'Mark habits tracked'}</button>}
      {archivedHabits.length > 0 && <select aria-label="Reuse a past habit" defaultValue="" className={`${inp} w-auto max-w-48 py-1.5 text-xs`} onChange={(e) => {
        const [action, id] = e.target.value.split(':');
        const source = archivedHabits.find(h => h._id === id);
        if (source && action === 'reuse') setEdit({ name: source.name, icon: source.icon || 'target', frequency: source.frequency || 'daily', goal: source.goal || '', reminder: source.reminder || '', startDate: today, endDate: '' });
        if (source && action === 'edit') setEdit(source);
        e.target.value = '';
      }}><option value="">Past habits...</option><optgroup label="Reuse as a new habit">{archivedHabits.map(h => <option key={`reuse-${h._id}`} value={`reuse:${h._id}`}>{h.name}</option>)}</optgroup><optgroup label="Correct dates in past reports">{archivedHabits.map(h => <option key={`edit-${h._id}`} value={`edit:${h._id}`}>{h.name}</option>)}</optgroup></select>}
      <button className={btnP} onClick={() => setEdit(blank)}><Plus size={16} />Add Habit</button>
    </div>}>
      {habits.length === 0 ? (
        <p className="py-5 text-center text-sm text-zinc-500">No habits yet. Add your first habit to start tracking.</p>
      ) : (
        <ul className="space-y-2">
          {habits.map((h) => {
            const I = ICONS[h.icon] || ICONS.target, d = done.includes(h._id);
            const s = streakOf((k) => days[k]?.done?.includes(h._id));
            return (
              <li key={h._id} className="flex items-center gap-3 rounded-xl border border-zinc-100 p-3 transition hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700">
                <button role="checkbox" aria-checked={d} aria-label={`Complete ${h.name}`} onClick={() => onToggle(h._id)}
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-all duration-200 ${d ? 'scale-110 border-indigo-600 bg-indigo-600' : 'border-zinc-300 dark:border-zinc-600'}`}>
                  {d && <Check size={14} strokeWidth={3} className="text-white" />}
                </button>
                <I size={18} className="shrink-0 text-indigo-600 dark:text-indigo-400" />
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-medium ${d ? 'text-zinc-400 line-through' : ''}`}>{h.name}</p>
                  {(h.goal || h.reminder || h.endDate) && <p className="truncate text-xs text-zinc-500">{[h.goal, h.reminder && `Reminder ${h.reminder}`, h.endDate && `Through ${h.endDate}`].filter(Boolean).join(', ')}</p>}
                </div>
                <span className="flex items-center gap-1 text-xs font-medium text-orange-500"><Flame size={14} />{s}</span>
                <button className={iconBtn} aria-label={`Edit ${h.name}`} onClick={() => setEdit(h)}><Pencil size={15} /></button>
                <button className={iconBtn} aria-label={`Delete ${h.name}`} onClick={() => window.confirm(`Remove "${h.name}" from today onward? Past days keep their history.`) && onDelete(h._id)}><Trash2 size={15} /></button>
              </li>
            );
          })}
        </ul>
      )}
      {edit && <HabitModal habit={edit} onClose={() => setEdit(null)} onSave={onSave} />}
    </Card>
  );
}
