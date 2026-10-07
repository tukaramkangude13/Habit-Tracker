import { useState } from 'react';
import { Minus, Pencil, Plus, Trash2, Check, X } from 'lucide-react';
import { fmt, goalPct, key, parse } from '../lib';
import { Bar, Card, Field, Modal, btnP, iconBtn, inp } from './ui';

const blank = () => ({ title: '', description: '', category: '', target: 100, current: 0, unit: '', startDate: key(), deadline: '' });

function GoalModal({ goal, onClose, onSave }) {
  const [f, setF] = useState(goal);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = () => {
    const target = Number(f.target), current = Number(f.current);
    if (!f.title.trim()) throw new Error('Goal title is required.');
    if (!(target > 0)) throw new Error('Target must be greater than 0.');
    if (!(current >= 0)) throw new Error('Current value cannot be negative.');
    if (f.deadline && f.startDate && f.deadline < f.startDate) throw new Error('Deadline must be after the start date.');
    return onSave({ ...f, title: f.title.trim(), target, current });
  };
  return (
    <Modal title={f._id ? 'Edit goal' : 'New goal'} onClose={onClose} onSubmit={submit}>
      <Field label="Title"><input autoFocus className={inp} value={f.title} onChange={set('title')} placeholder="e.g. Learn DSA" /></Field>
      <Field label="Description (optional)"><textarea rows={2} className={inp} value={f.description} onChange={set('description')} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category"><input className={inp} value={f.category} onChange={set('category')} placeholder="Career" /></Field>
        <Field label="Unit"><input className={inp} value={f.unit} onChange={set('unit')} placeholder="Problems" /></Field>
        <Field label="Target"><input type="number" min="1" className={inp} value={f.target} onChange={set('target')} /></Field>
        <Field label="Current"><input type="number" min="0" className={inp} value={f.current} onChange={set('current')} /></Field>
        <Field label="Start date"><input type="date" className={inp} value={f.startDate || ''} onChange={set('startDate')} /></Field>
        <Field label="Deadline"><input type="date" className={inp} value={f.deadline || ''} onChange={set('deadline')} /></Field>
      </div>
    </Modal>
  );
}

function GoalCard({ g, onEdit, onDelete, onPatch }) {
  const [nm, setNm] = useState('');
  const ms = g.milestones || [], p = goalPct(g), left = Math.max(0, g.target - g.current);
  const daysLeft = g.deadline ? Math.ceil((parse(g.deadline) - parse(key())) / 864e5) : null;
  const setMs = (m) => onPatch(g, { milestones: m });
  const addMs = (e) => { e.preventDefault(); if (nm.trim()) { setMs([...ms, { title: nm.trim(), done: false }]); setNm(''); } };
  return (
    <li className="rounded-xl border border-zinc-100 p-4 dark:border-zinc-800">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-medium">{g.title}</h3>
          <p className="text-xs text-zinc-500">{g.category || 'General'}{g.description && ` | ${g.description}`}</p>
        </div>
        <div className="flex shrink-0">
          <button className={iconBtn} aria-label={`Edit ${g.title}`} onClick={() => onEdit(g)}><Pencil size={15} /></button>
          <button className={iconBtn} aria-label={`Delete ${g.title}`} onClick={() => window.confirm(`Delete "${g.title}"?`) && onDelete(g._id)}><Trash2 size={15} /></button>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm">
        <span>{g.current} / {g.target} {g.unit}</span><span className="font-medium">{p}% complete</span>
      </div>
      <div className="mt-2"><Bar value={p} /></div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
        <span>{left} {g.unit} remaining{g.deadline && `, due ${fmt(g.deadline, { month: 'short', day: 'numeric', year: 'numeric' })}`}{daysLeft !== null && (daysLeft < 0 ? ' (overdue)' : ` (${daysLeft}d left)`)}</span>
        {ms.length === 0 && (
          <span className="flex items-center gap-1">
            <button aria-label="Decrease" className={iconBtn} onClick={() => onPatch(g, { current: Math.max(0, g.current - 1) })}><Minus size={14} /></button>
            <button aria-label="Increase" className={iconBtn} onClick={() => onPatch(g, { current: g.current + 1 })}><Plus size={14} /></button>
          </span>
        )}
      </div>
      <ul className="mt-3 space-y-1">
        {ms.map((m, i) => (
          <li key={m._id || i} className="group flex items-center gap-2 text-sm">
            <button role="checkbox" aria-checked={m.done} aria-label={m.title} onClick={() => setMs(ms.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))}
              className={`grid h-4 w-4 place-items-center rounded border transition ${m.done ? 'border-indigo-600 bg-indigo-600' : 'border-zinc-300 dark:border-zinc-600'}`}>
              {m.done && <Check size={11} strokeWidth={3} className="text-white" />}
            </button>
            <span className={`flex-1 ${m.done ? 'text-zinc-400 line-through' : ''}`}>{m.title}</span>
            <button aria-label={`Remove ${m.title}`} className="text-zinc-300 opacity-0 transition hover:text-red-500 focus:opacity-100 group-hover:opacity-100" onClick={() => setMs(ms.filter((_, j) => j !== i))}><X size={14} /></button>
          </li>
        ))}
      </ul>
      <form onSubmit={addMs} className="mt-2"><input value={nm} onChange={(e) => setNm(e.target.value)} placeholder="Add milestone and press Enter" className={`${inp} py-1.5 text-xs`} /></form>
    </li>
  );
}

export default function GoalList({ goals, onSave, onDelete, onPatch }) {
  const [edit, setEdit] = useState(null);
  return (
    <Card title="My Goals" action={<button className={btnP} onClick={() => setEdit(blank())}><Plus size={16} />Add Goal</button>}>
      {goals.length === 0 ? <p className="py-8 text-center text-sm text-zinc-500">No goals yet. Add one with a target and a deadline.</p> : (
        <ul className="grid gap-3 md:grid-cols-2">{goals.map((g) => <GoalCard key={g._id} g={g} onEdit={setEdit} onDelete={onDelete} onPatch={onPatch} />)}</ul>
      )}
      {edit && <GoalModal goal={edit} onClose={() => setEdit(null)} onSave={onSave} />}
    </Card>
  );
}
