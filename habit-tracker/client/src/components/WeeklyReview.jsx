import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, CalendarDays, Save } from 'lucide-react';
import { api } from '../api';
import { addDays, fmt, key, parse } from '../lib';
import { Card, btnP, inp } from './ui';

const EMPTY = { wins: '', blockers: '', experiment: '' };

export default function WeeklyReview({ days, today }) {
  const weekStart = useMemo(() => {
    const weekday = parse(today).getDay();
    return key(addDays(parse(today), -((weekday + 6) % 7)));
  }, [today]);
  const [saved, setSaved] = useState([]);
  const [draft, setDraft] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    setLoading(true);
    api.get('/weekly-reviews').then(rows => {
      if (!live) return;
      setSaved(rows);
      const current = rows.find(row => row.weekStart === weekStart);
      setDraft({ wins: current?.wins || '', blockers: current?.blockers || '', experiment: current?.experiment || '' });
      setLoading(false);
    }).catch(error => {
      if (live) { setErr(error.message); setLoading(false); }
    });
    return () => { live = false; };
  }, [weekStart]);

  const dates = useMemo(() => {
    const end = today < key(addDays(parse(weekStart), 6)) ? today : key(addDays(parse(weekStart), 6));
    const count = Math.max(0, Math.round((parse(end) - parse(weekStart)) / 86400000) + 1);
    return Array.from({ length: count }, (_, index) => key(addDays(parse(weekStart), index)));
  }, [today, weekStart]);
  const daysSummary = useMemo(() => {
    const priorities = dates.flatMap(date => (days[date]?.priorities || []).map(item => ({ ...item, date })));
    const expected = priorities.filter(item => !['moved', 'dropped'].includes(item.status));
    const energy = dates.map(date => Number(days[date]?.energy)).filter(value => value >= 1 && value <= 5);
    const focus = dates.map(date => Number(days[date]?.focus)).filter(value => value >= 1 && value <= 5);
    const study = dates.flatMap(date => days[date]?.studyOutcome?.trim() ? [{ date, outcome: days[date].studyOutcome, next: days[date].studyNextStep }] : []);
    return {
      planned: expected.length,
      done: expected.filter(item => item.status === 'done').length,
      changed: priorities.filter(item => ['moved', 'dropped'].includes(item.status)).length,
      energy: energy.length ? energy.reduce((sum, value) => sum + value, 0) / energy.length : null,
      focus: focus.length ? focus.reduce((sum, value) => sum + value, 0) / focus.length : null,
      study,
      recordedDays: dates.filter(date => days[date]).length,
    };
  }, [dates, days]);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true); setErr('');
    try {
      const row = await api.put(`/weekly-reviews/${weekStart}`, draft);
      setSaved(current => [...current.filter(item => item.weekStart !== weekStart), row]);
    } catch (error) { setErr(error.message); }
    finally { setSaving(false); }
  };
  const set = field => event => setDraft(current => ({ ...current, [field]: event.target.value }));

  return <Card title="Weekly review" action={<span className="inline-flex items-center gap-1.5 text-xs text-zinc-500"><CalendarDays size={14} />{fmt(weekStart, { month: 'short', day: 'numeric' })} – {fmt(dates[dates.length - 1] || today, { month: 'short', day: 'numeric' })}</span>}>
    <p className="mb-4 text-sm text-zinc-500">Use the records from this week to decide what to keep, what got in the way, and one small change to try next week.</p>
    <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {[
        ['Priorities done', `${daysSummary.done}/${daysSummary.planned}`, `${daysSummary.changed} moved or dropped`],
        ['Days recorded', `${daysSummary.recordedDays}/${dates.length}`, 'with a saved daily record'],
        ['Energy average', daysSummary.energy === null ? '—' : daysSummary.energy.toFixed(1), 'out of 5'],
        ['Focus average', daysSummary.focus === null ? '—' : daysSummary.focus.toFixed(1), 'out of 5'],
      ].map(([label, value, detail]) => <div key={label} className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/60"><p className="text-[11px] text-zinc-500">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p><p className="text-[10px] text-zinc-400">{detail}</p></div>)}
    </div>

    {daysSummary.study.length > 0 && <div className="mb-5 rounded-xl border border-indigo-100 bg-indigo-50/70 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/30"><h4 className="flex items-center gap-2 text-sm font-semibold"><ArrowUpRight size={15} className="text-indigo-600" />Study / work outcomes</h4><ul className="mt-2 space-y-2">{daysSummary.study.map(item => <li key={item.date} className="text-sm"><span className="mr-2 text-xs text-zinc-500">{fmt(item.date, { weekday: 'short', month: 'short', day: 'numeric' })}</span>{item.outcome}{item.next && <span className="mt-0.5 block pl-2 text-xs text-zinc-500">Next: {item.next}</span>}</li>)}</ul></div>}

    <form onSubmit={save} className="space-y-3">
      <label className="block text-sm font-medium">What went well?
        <textarea className={`${inp} mt-1.5`} rows={2} maxLength={1000} value={draft.wins} onChange={set('wins')} placeholder="A result, habit, or choice you want to repeat" />
      </label>
      <label className="block text-sm font-medium">What got in the way?
        <textarea className={`${inp} mt-1.5`} rows={2} maxLength={1000} value={draft.blockers} onChange={set('blockers')} placeholder="A blocker, interruption, or plan that no longer mattered" />
      </label>
      <label className="block text-sm font-medium">One small experiment for next week
        <textarea className={`${inp} mt-1.5`} rows={2} maxLength={1000} value={draft.experiment} onChange={set('experiment')} placeholder="A specific change you can try for seven days" />
      </label>
      {err && <p role="alert" className="text-sm text-rose-600">{err}</p>}
      <div className="flex items-center justify-between gap-3"><p className="text-xs text-zinc-400">{loading ? 'Loading saved review…' : saved.some(row => row.weekStart === weekStart) ? 'This week’s review is saved.' : 'Your review is private to your account.'}</p><button className={btnP} disabled={loading || saving}><Save size={15} />{saving ? 'Saving…' : 'Save review'}</button></div>
    </form>
  </Card>;
}
