import { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { api } from '../api';
import { addDays, fmt, key, parse } from '../lib';
import { Card, Field, btnP, iconBtn, inp } from './ui';

const CATS = ['Reels / scrolling', 'Adult content', 'Procrastination', 'Other'];
const TRIGGERS = ['Bored', 'Stressed', 'Tired', 'Lonely', 'Anxious', 'Autopilot', 'Other'];
const hourLabel = (h) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;
const blank = () => ({ category: CATS[0], trigger: TRIGGERS[0], what: '', next: '' });

export default function Reflection({ today }) {
  const [items, setItems] = useState([]);
  const [f, setF] = useState(blank());
  const [err, setErr] = useState('');
  useEffect(() => { api.get('/reflections').then(setItems).catch((e) => setErr(e.message)); }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const add = async (e) => {
    e.preventDefault();
    if (!f.what.trim()) return setErr('Write what happened first.');
    try {
      setErr('');
      const r = await api.post('/reflections', { ...f, what: f.what.trim(), next: f.next.trim(), date: today, hour: new Date().getHours() });
      setItems((l) => [...l, r]);
      setF(blank());
    } catch (x) { setErr(x.message); }
  };
  const del = async (id) => {
    try { await api.del(`/reflections/${id}`); setItems((l) => l.filter((x) => x._id !== id)); } catch (x) { setErr(x.message); }
  };

  const ins = useMemo(() => {
    const d = (n) => key(addDays(parse(today), -n));
    const recent = items.filter((i) => i.date >= d(29));
    const top = (fn) => {
      const c = {};
      recent.forEach((i) => { const v = fn(i); c[v] = (c[v] || 0) + 1; });
      return Object.entries(c).sort((a, b) => b[1] - a[1])[0];
    };
    return {
      count: recent.length, trigger: top((i) => i.trigger), hour: top((i) => i.hour),
      week: items.filter((i) => i.date >= d(6)).length,
      prev: items.filter((i) => i.date >= d(13) && i.date < d(6)).length,
    };
  }, [items, today]);

  return (
    <Card title="Reflection Log">
      <p className="mb-3 text-xs text-zinc-500">Slipped? Write it down without judging yourself. Patterns show up after a few entries.</p>
      <form onSubmit={add} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="What was it?"><select className={inp} value={f.category} onChange={set('category')}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="What triggered it?"><select className={inp} value={f.trigger} onChange={set('trigger')}>{TRIGGERS.map((c) => <option key={c}>{c}</option>)}</select></Field>
        </div>
        <Field label="What happened, and what were you thinking?"><textarea rows={3} maxLength={500} className={`${inp} resize-none`} value={f.what} onChange={set('what')} /></Field>
        <Field label="Next time I will..."><input maxLength={300} className={inp} value={f.next} onChange={set('next')} placeholder="e.g. leave my phone in another room" /></Field>
        {err && <p role="alert" className="text-xs text-red-500">{err}</p>}
        <button className={btnP}>Save entry</button>
      </form>

      {items.length > 0 && (
        <div className="mt-5 space-y-3 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          {ins.count >= 3 && (
            <p className="rounded-lg bg-zinc-50 p-3 text-xs text-zinc-600 dark:bg-zinc-800/50 dark:text-zinc-300">
              Last 30 days: {ins.count} entries. Most common trigger: <b>{ins.trigger?.[0]}</b> ({ins.trigger?.[1]}).
              {ins.hour && <> Riskiest time: around <b>{hourLabel(Number(ins.hour[0]))}</b>.</>}
              {' '}This week {ins.week}, last week {ins.prev}.
            </p>
          )}
          <ul className="space-y-3">
            {items.slice(-5).reverse().map((i) => (
              <li key={i._id} className="text-sm">
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span>{fmt(i.date)} | {i.category} | {i.trigger}</span>
                  <button className={iconBtn} aria-label="Delete entry" onClick={() => window.confirm('Delete this entry?') && del(i._id)}><Trash2 size={13} /></button>
                </div>
                <p>{i.what}</p>
                {i.next && <p className="text-xs text-indigo-600 dark:text-indigo-400">Next time: {i.next}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}