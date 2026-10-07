import { useState } from 'react';
import { Check, Flame, Pencil, Plus, Trash2 } from 'lucide-react';
import { streakOf } from '../lib';
import { Card, Modal, Field, ICONS, inp, btnP, iconBtn } from './ui';

const blank = { name: '', icon: 'target', frequency: 'daily', goal: '', reminder: '' };

function HabitModal({ habit, onClose, onSave }) {
  const [f, setF] = useState(habit);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = () => {
    const name = f.name.trim();
    if (!name) throw new Error('Habit name is required.');
    if (name.length > 40) throw new Error('Name must be 40 characters or fewer.');
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
            <option value="daily">Daily</option><option value="weekdays">Weekdays</option><option value="weekly">Weekly</option>
          </select>
        </Field>
        <Field label="Reminder (optional)"><input type="time" className={inp} value={f.reminder} onChange={set('reminder')} /></Field>
      </div>
      <Field label="Goal (optional)"><input className={inp} value={f.goal} onChange={set('goal')} placeholder="e.g. 30 minutes" /></Field>
    </Modal>
  );
}

export default function HabitList({ habits, days, today, onToggle, onSave, onDelete }) {
  const [edit, setEdit] = useState(null);
  const done = days[today]?.done || [];
  return (
    <Card title="Today's Habits" action={<button className={btnP} onClick={() => setEdit(blank)}><Plus size={16} />Add Habit</button>}>
      {habits.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">No habits yet. Add your first habit to start tracking.</p>
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
                  {(h.goal || h.reminder) && <p className="truncate text-xs text-zinc-500">{[h.goal, h.reminder && `Reminder ${h.reminder}`].filter(Boolean).join(', ')}</p>}
                </div>
                <span className="flex items-center gap-1 text-xs font-medium text-orange-500"><Flame size={14} />{s}</span>
                <button className={iconBtn} aria-label={`Edit ${h.name}`} onClick={() => setEdit(h)}><Pencil size={15} /></button>
                <button className={iconBtn} aria-label={`Delete ${h.name}`} onClick={() => window.confirm(`Delete "${h.name}"? Its history will be removed.`) && onDelete(h._id)}><Trash2 size={15} /></button>
              </li>
            );
          })}
        </ul>
      )}
      {edit && <HabitModal habit={edit} onClose={() => setEdit(null)} onSave={onSave} />}
    </Card>
  );
}
