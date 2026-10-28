import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, CircleDollarSign, Clock3, Flame, Footprints, Smartphone, Sparkles, Target, Utensils } from 'lucide-react';
import { api } from '../api';
import { addDays, fmt, habitAppliesOn, key, parse } from '../lib';
import DailyPlan from './DailyPlan';
import WeeklyReview from './WeeklyReview';

const hm = (minutes) => {
  const value = Math.round(Number(minutes) || 0);
  return value >= 60 ? `${Math.floor(value / 60)}h ${value % 60}m` : `${value}m`;
};

function Metric({ icon: Icon, label, value, detail, tone = 'indigo', delay = 0 }) {
  const colors = {
    indigo: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-300',
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300',
    sky: 'bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300',
    rose: 'bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300',
  };
  return <article className="dashboard-stat rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80" style={{ '--delay': `${delay}ms` }}>
    <span className={`grid h-9 w-9 place-items-center rounded-xl ${colors[tone]}`}><Icon size={18} /></span>
    <p className="mt-3 text-xs font-medium text-zinc-500">{label}</p>
    <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
    <p className="mt-1 text-xs text-zinc-500">{detail}</p>
  </article>;
}

export default function Dashboard({ habits, goals, days, today, active, onNavigate, onToggle, onSaveDay }) {
  const [extra, setExtra] = useState({ expenses: [], time: [], food: [], screen: [], profile: null });
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState([]);

  useEffect(() => {
    if (!active) return;
    let live = true;
    setLoading(true);
    Promise.allSettled([
      api.get('/expenses'), api.get('/timelogs'), api.get('/foodlogs'), api.get('/screentime'), api.get('/nutrition/profile'),
    ]).then(results => {
      if (!live) return;
      const get = (index, fallback) => results[index].status === 'fulfilled' ? results[index].value : fallback;
      setExtra({ expenses: get(0, []), time: get(1, []), food: get(2, []), screen: get(3, []), profile: get(4, null) });
      setUnavailable(results.flatMap((item, index) => item.status === 'rejected' ? [['expenses', 'time audit', 'nutrition', 'phone use', 'nutrition plan'][index]] : []));
      setLoading(false);
    });
    return () => { live = false; };
  }, [active, today]);

  const due = useMemo(() => {
    return habits.filter(h => h.frequency !== 'weekly' && h.frequency !== 'once' && habitAppliesOn(h, today));
  }, [habits, today]);
  const doneIds = days[today]?.done || [];
  const completed = due.filter(h => doneIds.includes(h._id)).length;
  const pct = due.length ? Math.round(completed / due.length * 100) : 0;
  const totals = useMemo(() => {
    const sum = (rows, field) => rows.filter(row => row.date === today).reduce((acc, row) => acc + (Number(row[field]) || 0), 0);
    const currentFood = extra.food.filter(row => row.date === today);
    return {
      spend: sum(extra.expenses, 'amount'),
      wasted: sum(extra.time, 'minutes'),
      phone: sum(extra.screen, 'totalMinutes'),
      spendCount: extra.expenses.filter(row => row.date === today).length,
      timeCount: extra.time.filter(row => row.date === today).length,
      phoneCount: extra.screen.filter(row => row.date === today).length,
      calories: currentFood.reduce((n, row) => n + (Number(row.kcal) || 0), 0),
      protein: currentFood.reduce((n, row) => n + (Number(row.protein) || 0), 0),
      foodCount: currentFood.length,
      calorieTarget: Number(extra.profile?.target) || 0,
    };
  }, [extra, today]);
  const week = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = key(addDays(parse(today), index - 6));
    const record = days[date];
    if (!record) return { date, value: null };
    const dueThatDay = habits.filter(h => h.frequency !== 'weekly' && h.frequency !== 'once' && habitAppliesOn(h, date));
    return { date, value: dueThatDay.length ? Math.round(dueThatDay.filter(h => record.done?.includes(h._id)).length / dueThatDay.length * 100) : null };
  }), [days, habits, today]);
  const pending = due.filter(h => !doneIds.includes(h._id)).slice(0, 4);
  return <main className="space-y-4 sm:space-y-5" aria-label="Dashboard">
    <section className="dashboard-hero relative overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-600 p-5 text-white shadow-xl shadow-indigo-900/15 sm:p-6">
      <div className="pointer-events-none absolute -right-12 -top-24 h-72 w-72 rounded-full border border-white/10" />
      <div className="pointer-events-none absolute -right-3 -top-16 h-52 w-52 rounded-full border border-white/10" />
      <div className="relative grid gap-5 md:grid-cols-[1.2fr_.8fr] md:items-end">
        <div><span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium"><Sparkles size={14} /> Your day at a glance</span>
          <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">A little progress goes a long way.</h2>
          <p className="mt-2 text-sm text-indigo-100">{fmt(today, { weekday: 'long', month: 'long', day: 'numeric' })} · {completed} of {due.length} daily habits complete</p>
          <button onClick={() => onNavigate('habits')} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-50">{pending.length ? 'Continue today' : 'Review habits'}<ArrowRight size={16} /></button>
        </div>
        <div className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm">
          <div className="flex items-end justify-between"><div><p className="text-xs text-indigo-100">Today’s completion</p><p className="mt-1 text-4xl font-bold">{pct}<span className="text-xl text-indigo-100">%</span></p></div><div className="pb-1 text-right text-sm text-indigo-100">{completed} done<br />{Math.max(0, due.length - completed)} left</div></div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-white transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} /></div>
          <p className="mt-3 text-xs text-indigo-100">{pct === 100 && due.length ? 'You completed every daily habit. Nice work.' : pending.length ? `${pending[0].name} is a good next step.` : 'Add a daily habit whenever you are ready.'}</p>
        </div>
      </div>
    </section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Today’s key numbers">
      <Metric icon={Flame} label="Current streak" value={`${statsStreak(days, habits, today)} days`} detail="Days with at least one habit done" tone="amber" delay={40} />
      <Metric icon={Clock3} label="Time to reclaim" value={loading ? '…' : totals.timeCount ? hm(totals.wasted) : 'No data'} detail="Time you logged as wasted today" tone="rose" delay={90} />
      <Metric icon={Smartphone} label="Phone use" value={loading ? '…' : totals.phoneCount ? hm(totals.phone) : 'No data'} detail="Today’s device report" tone="sky" delay={140} />
      <Metric icon={Utensils} label="Food logged" value={loading ? '…' : totals.foodCount ? `${Math.round(totals.calories).toLocaleString()} kcal` : 'No data'} detail={totals.foodCount ? `${Math.round(totals.protein)} g protein${totals.calorieTarget ? ` · ${Math.round(totals.calories / totals.calorieTarget * 100)}% of calorie goal` : ''}` : 'Add a meal to track nutrition'} tone="emerald" delay={190} />
      <Metric icon={CircleDollarSign} label="Spending" value={loading ? '…' : totals.spendCount ? totals.spend.toLocaleString() : 'No spend'} detail="Expenses recorded today" delay={240} />
    </section>

    <section className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
      <article className="dashboard-panel rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">Your next steps</h3><p className="mt-1 text-sm text-zinc-500">Small actions still open today</p></div><button onClick={() => onNavigate('habits')} className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400">All habits</button></div>
        {pending.length ? <ul className="mt-4 space-y-2">{pending.map(h => <li key={h._id} className="flex items-center gap-3 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/60"><span className="grid h-8 w-8 place-items-center rounded-full border border-zinc-300 text-zinc-400 dark:border-zinc-600"><Check size={15} /></span><span className="min-w-0 flex-1 truncate text-sm font-medium">{h.name}</span>{h.reminder && <span className="text-xs text-zinc-500">{h.reminder}</span>}<button onClick={() => onToggle(h._id)} className="rounded-lg px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-500/10">Mark done</button></li>)}</ul> : <p className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">{due.length ? 'Daily habits complete. Make space for something restorative.' : 'Add your first habit to see a clear plan for today.'}</p>}
        {goals.length > 0 && <div className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800"><div className="flex items-center gap-2 text-xs font-semibold text-zinc-500"><Target size={14} /> ACTIVE GOALS</div><div className="mt-2 flex flex-wrap gap-2">{goals.slice(0, 3).map(g => <span key={g._id} className="rounded-full bg-indigo-50 px-3 py-1 text-xs text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">{g.title}</span>)}</div></div>}
      </article>

      <article className="dashboard-panel rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-start justify-between"><div><h3 className="font-semibold">Habit rhythm</h3><p className="mt-1 text-sm text-zinc-500">Daily completion over the last 7 days</p></div><Footprints size={18} className="text-indigo-500" /></div>
        <div className="mt-5 flex h-28 items-end gap-2">{week.map(day => <div key={day.date} className="flex h-full flex-1 flex-col items-center justify-end gap-2" title={`${fmt(day.date, { weekday: 'short', month: 'short', day: 'numeric' })}: ${day.value === null ? 'not tracked' : `${day.value}%`}`}><div className="flex w-full flex-1 items-end rounded-lg bg-zinc-50 dark:bg-zinc-800/60"><div className={`w-full rounded-lg ${day.date === today ? 'bg-violet-500' : 'bg-indigo-500'}`} style={{ height: day.value === null ? '3px' : `${Math.max(day.value ? 10 : 0, day.value)}%`, opacity: day.value === null ? 0.18 : 0.8 }} /></div><span className="text-[10px] text-zinc-500">{fmt(day.date, { weekday: 'narrow' })}</span></div>)}</div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-zinc-500"><span className="rounded-lg bg-zinc-50 px-2 py-1 dark:bg-zinc-800">Sleep {days[today]?.sleep != null ? `${days[today].sleep}h` : 'not logged'}</span><span className="rounded-lg bg-zinc-50 px-2 py-1 dark:bg-zinc-800">Mood {days[today]?.mood || 'not logged'}</span><button onClick={() => onNavigate('report')} className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-500/10">Open reports<ArrowRight size={13} /></button></div>
      </article>
    </section>

    <section className="grid gap-4 xl:grid-cols-2" aria-label="Plan and reflect">
      <DailyPlan today={today} day={days[today] || {}} onSave={onSaveDay} />
      <WeeklyReview days={days} today={today} />
    </section>

    {unavailable.length > 0 && <p className="text-xs text-zinc-400">Could not load {unavailable.join(', ')} right now. Other dashboard metrics are still available.</p>}
  </main>;
}

function statsStreak(days, habits, today) {
  let cursor = parse(today), count = 0;
  const hasDone = date => habits.some(h => habitAppliesOn(h, key(date)) && days[key(date)]?.done?.includes(h._id));
  if (!hasDone(cursor)) cursor = addDays(cursor, -1);
  while (hasDone(cursor)) { count++; cursor = addDays(cursor, -1); }
  return count;
}
