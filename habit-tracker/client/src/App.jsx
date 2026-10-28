import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { bestStreak, doneCount, habitAppliesOn, habitsOn, key, streakOf } from './lib';
import Nutrition from './components/Nutrition';
import Header from './components/Header';
import ProgressCard from './components/ProgressCard';
import StreakStats from './components/StreakStats';
import HabitList from './components/HabitList';
import WeeklyTracker from './components/WeeklyTracker';
import GoalList from './components/GoalList';
import WeeklyAnalytics from './components/WeeklyAnalytics';
import HabitHeatmap from './components/HabitHeatmap';
import { MoodTracker, SleepTracker, DailyNotes } from './components/Wellness';
import MonthlyReport from './components/MonthlyReport';
import PerformanceCard from './components/PerformanceCard';
import Reflection from './components/Reflection';
import Insights from './components/Insights';
import PhoneUsage from './components/PhoneUsage';
import TimeAudit from './components/TimeAudit';
import { CheckSquare, Wallet, Lightbulb, Utensils, Hourglass, BookOpen, BarChart3, CandlestickChart } from 'lucide-react';
import Notes from './components/Notes';
import Expenses from './components/Expenses';
import Report from './components/Report';
import LifeIndex from './components/LifeIndex';
import TradingJournal from './components/TradingJournal';
import Dashboard from './components/Dashboard';
// Re-check every minute so a new day automatically shows a fresh checklist.
function useToday() {
  const [t, setT] = useState(key());

  useEffect(() => {
    const i = setInterval(() => {
      setT(key());
    }, 60000);

    return () => clearInterval(i);
  }, []);

  return t;
}

// Create or update an item
const upsert = (path, set) => async (d) => {
  const r = d._id
    ? await api.put(`/${path}/${d._id}`, d)
    : await api.post(`/${path}`, d);

  set((list) =>
    d._id
      ? list.map((item) => (item._id === r._id ? r : item))
      : [...list, r]
  );
};

// Delete an item
const remove = (path, set) => async (id) => {
  await api.del(`/${path}/${id}`);

  set((list) => list.filter((item) => item._id !== id));
};

export default function App({ user, onLogout }) {
  const today = useToday();

  // Active tab
  const [tab, setTab] = useState(
    () => localStorage.getItem('tab') || 'dashboard'
  );

  const [habits, setHabits] = useState([]);
  const [goals, setGoals] = useState([]);
  const [days, setDays] = useState({});
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState('');

  // Dark mode
  const [dark, setDark] = useState(
    () => localStorage.getItem('theme') === 'dark'
  );

  // Save selected tab
  useEffect(() => {
    localStorage.setItem('tab', tab);
  }, [tab]);

  useEffect(() => {
    if (localStorage.getItem('dashboard-default-migrated')) return;
    localStorage.setItem('dashboard-default-migrated', '1');
    if (!localStorage.getItem('tab') || localStorage.getItem('tab') === 'habits') setTab('dashboard');
  }, []);

  // Load application data
  useEffect(() => {
    Promise.all([
      api.get('/habits'),
      api.get('/goals'),
      api.get('/days'),
    ])
      .then(([h, g, d]) => {
        setHabits(h);
        setGoals(g);

        setDays(
          Object.fromEntries(
            d.map((x) => [x.date, x])
          )
        );

        setReady(true);
      })
      .catch((e) => {
        setErr(`Cannot reach the server: ${e.message}`);
      });
  }, []);

  // Apply dark mode
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);

    localStorage.setItem(
      'theme',
      dark ? 'dark' : 'light'
    );
  }, [dark]);

  // Save a day's data
  const saveDay = (date, patch) => {
    setDays((current) => ({
      ...current,
      [date]: {
        ...current[date],
        date,
        ...patch,
      },
    }));

    api
      .put(`/days/${date}`, patch)
      .catch((e) => setErr(e.message));
  };

  // Toggle habit
  const toggle = (id, date = today) => {
    const done = days[date]?.done || [];

    const nextDone = done.includes(id)
      ? done.filter((x) => x !== id)
      : [...done, id];

    saveDay(date, {
      done: nextDone,
      habitsTracked: true,
    });
  };

  // Update goal
  const patchGoal = (goal, patch) => {
    setGoals((list) =>
      list.map((item) =>
        item._id === goal._id
          ? { ...item, ...patch }
          : item
      )
    );

    api
      .put(`/goals/${goal._id}`, patch)
      .catch((e) => setErr(e.message));
  };

  // Statistics
  // `habits` holds every habit, archived ones included, so history stays intact.
  // `live` is what applies today and what the screens show.
  const live = useMemo(
    () => habits.filter((h) => habitAppliesOn(h, today)),
    [habits, today]
  );
  const archivedHabits = useMemo(
    () => habits.filter((h) => (h.endDate && h.endDate < today) || (h.archivedOn && h.archivedOn <= today)),
    [habits, today]
  );

  // Removing a habit archives it from today onward. Past days keep their ticks.
  const archiveHabit = async (id) => {
    try {
      const r = await api.put(`/habits/${id}`, { archivedOn: today });
      setHabits((list) => list.map((h) => (h._id === r._id ? r : h)));
    } catch (e) {
      setErr(e.message);
    }
  };

  // Statistics: each day is judged against the habits that applied on that day.
  const stats = useMemo(() => {
    const done = (date) => doneCount(days[date], habitsOn(habits, date));
    const active = (date) => done(date) > 0;
    const keys = Object.keys(days).filter(active);

    return {
      current: streakOf(active),
      best: bestStreak(keys),
      total: keys.reduce((sum, date) => sum + done(date), 0),
      perfect: keys.filter((date) => {
        const due = habitsOn(habits, date);
        return due.length > 0 && done(date) === due.length;
      }).length,
    };
  }, [habits, days]);

  // Loading screen
  if (!ready) {
    return (
      <p className="grid min-h-screen place-items-center p-6 text-center text-zinc-500">
        {err || 'Loading...'}
      </p>
    );
  }

  const day = days[today] || {};

   const shared = {
    habits,
    days,
    today,
  };

  return (
    <div className="app-shell min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-100/70 via-zinc-50 to-zinc-100 text-zinc-900 dark:from-indigo-950/30 dark:via-zinc-950 dark:to-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-7xl space-y-5 px-4 py-4 sm:px-6 sm:py-5 lg:px-8">

        {/* Header */}
        <Header
          today={today}
          streak={stats.current}
          dark={dark}
          onToggleTheme={() => setDark(!dark)}
          user={user}
          onLogout={onLogout}
        />

        {/* Error */}
        {err && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-500/10"
          >
            {err}
          </p>
        )}

        {/* Tabs */}
        <nav aria-label="Main navigation" className="sticky top-2 z-20 -mx-2 flex flex-nowrap gap-1 overflow-x-auto rounded-2xl border border-white/70 bg-white/85 p-1.5 shadow-lg shadow-zinc-900/[0.04] backdrop-blur-xl sm:mx-0 sm:flex-wrap sm:overflow-visible dark:border-zinc-800/80 dark:bg-zinc-900/85">
          {[
            ['dashboard', 'Dashboard', BarChart3],
            ['habits', 'Habits', CheckSquare],
            ['insights', 'Insights', Lightbulb],
            ['expenses', 'Expenses', Wallet],
            ['nutrition', 'Nutrition', Utensils],
            ['time', 'Time Audit', Hourglass],
            ['report', 'Report', BarChart3],
            ['life-index', 'Life Index', BarChart3],
            ['trading', 'Trading Journal', CandlestickChart],
            ['notes', 'Notes', BookOpen]
          ].map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              aria-current={tab === id ? 'page' : undefined}
              onClick={() => setTab(id)}
                className={`flex min-w-0 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold transition sm:text-sm ${tab === id
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'
                }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>

        {/* Refresh the saved analysis whenever the Life Index tab becomes active. */}
        <div className={tab === 'life-index' ? '' : 'hidden'}>
          <LifeIndex today={today} active={tab === 'life-index'} />
        </div>

        {tab === 'dashboard' && <Dashboard habits={habits} goals={goals} days={days} today={today} active={tab === 'dashboard'} onNavigate={setTab} onToggle={toggle} onSaveDay={(patch) => saveDay(today, patch)} />}

        {/* HABITS TAB */}
        {tab === 'habits' ?
          (
            <div className="grid gap-4 lg:grid-cols-3">

              {/* LEFT SIDE */}
              <div className="space-y-4 lg:col-span-2">

                <ProgressCard
                                    done={doneCount(day, live)}
                  total={live.length}
                />

                <StreakStats {...stats} />

                <HabitList
                  {...shared}
                  habits={live}
                  archivedHabits={archivedHabits}
                  onToggle={toggle}
                  onMarkTracked={(tracked) => saveDay(today, { habitsTracked: tracked })}
                  onSave={upsert('habits', setHabits)}
                  onDelete={archiveHabit}                />

                <WeeklyTracker
                  {...shared}
                  onToggle={toggle}
                />

                <PerformanceCard
                  {...shared}
                />

                <GoalList
                  goals={goals}
                  onSave={upsert('goals', setGoals)}
                  onDelete={remove('goals', setGoals)}
                  onPatch={patchGoal}
                />

              </div>

              {/* RIGHT SIDE */}
              <div className="min-w-0 space-y-4">

                <MoodTracker
                  mood={day.mood}
                  onChange={(mood) =>
                    saveDay(today, { mood })
                  }
                />

                <SleepTracker
                  sleep={day.sleep}
                  date={today}
                  onChange={(sleep) =>
                    saveDay(today, { sleep })
                  }
                />

                <DailyNotes
                  note={day.note}
                  date={today}
                  onSave={(note) =>
                    saveDay(today, { note })
                  }
                />

                <Reflection
                  today={today}
                />

                <WeeklyAnalytics
                  {...shared}
                />

                <HabitHeatmap
                  {...shared}
                />

                <MonthlyReport
                  {...shared}
                />

              </div>
            </div>

          ) : tab === 'insights' ?
            (

              /* INSIGHTS TAB */
              <div className="mx-auto max-w-2xl">
                <Insights {...shared} />
              </div>

            )

            : tab === 'dashboard' ? null : tab === 'trading' ? (
<TradingJournal />
            ) : tab === 'report' ? (
<Report habits={habits} days={days} today={today} />            ) :                tab === 'nutrition' ? (
              <Nutrition today={today} />
            ) : tab === 'notes' ? (
              <Notes />
            ) : tab === 'time' ? (
              <div className="space-y-4"><PhoneUsage today={today} /><TimeAudit today={today} /></div>) : tab === 'expenses' ? (

                /* EXPENSES TAB */
                <Expenses today={today} />

              ) : null

        }

      </div>
    </div>
  );
}
