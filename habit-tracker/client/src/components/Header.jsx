import { Flame, LogOut, Moon, Sun, User } from 'lucide-react';
import { fmt } from '../lib';
import { btn, iconBtn } from './ui';

export default function Header({ today, streak, dark, onToggleTheme, user, onLogout }) {
  const h = new Date().getHours();
  const greet = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[.12em] text-indigo-600 dark:text-indigo-400">Your personal dashboard</p>
        <h1 className="mt-0.5 text-xl font-semibold tracking-tight sm:text-2xl">{greet}{user?.name ? `, ${user.name.split(' ')[0]}` : ''}</h1>
        <p className="text-sm text-zinc-500">{fmt(today, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2">
        <span className="flex items-center gap-1.5 rounded-full bg-orange-50 px-2.5 py-1.5 text-xs font-semibold text-orange-600 sm:px-3 sm:text-sm dark:bg-orange-500/10">
          <Flame size={16} />{streak} Day Streak
        </span>
        <button onClick={onToggleTheme} aria-label="Toggle dark mode" className={iconBtn}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
        <span className="hidden h-9 w-9 place-items-center rounded-full bg-indigo-100 text-indigo-600 sm:grid dark:bg-indigo-500/20" aria-label={user?.name || 'Profile'}><User size={18} /></span>
        <button type="button" onClick={onLogout} aria-label="Log out" className={`${iconBtn} app-logout-mobile`}><LogOut size={17} /></button>
        <button type="button" onClick={onLogout} className={`${btn} app-logout-desktop`}><LogOut size={15} />Log out</button>
      </div>
    </header>
  );
}
