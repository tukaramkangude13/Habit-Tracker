import { Flame, Moon, Sun, User } from 'lucide-react';
import { fmt, parse } from '../lib';
import { iconBtn } from './ui';

const QUOTES = [
  'Small steps, repeated daily, add up.',
  'Consistency beats intensity.',
  'Show up today; the results follow.',
  'You are what you repeatedly do.',
  'Progress, not perfection.',
];

export default function Header({ today, streak, dark, onToggleTheme }) {
  const h = new Date().getHours();
  const greet = h < 12 ? 'Good Morning' : h < 18 ? 'Good Afternoon' : 'Good Evening';
  const quote = QUOTES[Math.floor(parse(today) / 864e5) % QUOTES.length];
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{greet} 👋</h1>
        <p className="text-sm text-zinc-500">{fmt(today, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        <p className="mt-1 text-xs italic text-zinc-400">{quote}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1.5 text-sm font-medium text-orange-600 dark:bg-orange-500/10">
          <Flame size={16} />{streak} Day Streak
        </span>
        <button onClick={onToggleTheme} aria-label="Toggle dark mode" className={iconBtn}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
        <div className="grid h-9 w-9 place-items-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20" aria-label="Profile"><User size={18} /></div>
      </div>
    </header>
  );
}
