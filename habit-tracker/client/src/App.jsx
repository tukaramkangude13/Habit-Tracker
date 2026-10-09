import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { bestStreak, doneCount, key, streakOf } from './lib';
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

import {
  CheckSquare,
  Wallet,
  Lightbulb,
  Utensils,
} from 'lucide-react';
import Expenses from './components/Expenses';

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
    () => localStorage.getItem('tab') || 'habits'
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
  const stats = useMemo(() => {
    const active = (date) =>
      doneCount(days[date], habits) > 0;

    const keys = Object.keys(days).filter(active);

    return {
      current: streakOf(active),

      best: bestStreak(keys),

      total: keys.reduce(
        (total, date) =>
          total + doneCount(days[date], habits),
        0
      ),

      perfect: habits.length
        ? keys.filter(
          (date) =>
            doneCount(days[date], habits) ===
            habits.length
        ).length
        : 0,
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
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">

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
        <nav
          role="tablist"
          className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800"
        >
          {[
            ['habits', 'Habits', CheckSquare],
            ['insights', 'Insights', Lightbulb],
            ['expenses', 'Expenses', Wallet],
            ['nutrition', 'Nutrition', Utensils]
          ].map(([id, label, Icon]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-medium transition ${tab === id
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>

        {/* HABITS TAB */}
        {tab === 'habits' ?
          (
            <div className="grid gap-6 lg:grid-cols-3">

              {/* LEFT SIDE */}
              <div className="space-y-6 lg:col-span-2">

                <ProgressCard
                  done={doneCount(day, habits)}
                  total={habits.length}
                />

                <StreakStats {...stats} />

                <HabitList
                  {...shared}
                  onToggle={toggle}
                  onSave={upsert('habits', setHabits)}
                  onDelete={remove('habits', setHabits)}
                />

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
              <div className="min-w-0 space-y-6">

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

            : tab === 'nutrition' ? (
              <Nutrition today={today} />
            ) :
              (

                /* EXPENSES TAB */
                <Expenses today={today} />

              )

        }

      </div>
    </div>
  );
}