import { useState } from 'react';
import { Eye, EyeOff, Target } from 'lucide-react';
import { api } from '../api';
import { Field, btnP, inp } from './ui';

export default function AuthPage({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ name: '', email: '', password: '', confirm: '' });
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const signup = mode === 'signup';
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const switchTo = (m) => { setMode(m); setErr(''); };

  const submit = async (e) => {
    e.preventDefault();
    if (signup && !f.name.trim()) return setErr('Enter your name.');
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) return setErr('Enter a valid email address.');
    if (!f.password) return setErr('Enter your password.');
    if (signup && f.password.length < 8) return setErr('Password must be at least 8 characters.');
    if (signup && f.password !== f.confirm) return setErr('Passwords do not match.');
    setBusy(true); setErr('');
    try {
      onAuth(await api.post(`/auth/${mode}`, { name: f.name.trim(), email: f.email.trim(), password: f.password }));
    } catch (x) { setErr(x.message); setBusy(false); }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-zinc-50 p-4 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-600 text-white"><Target size={20} /></span>
          <span className="text-lg font-semibold">Habit & Goal Tracker</span>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="text-xl font-semibold">{signup ? 'Create your account' : 'Welcome back'}</h1>
          <p className="mb-5 text-sm text-zinc-500">{signup ? 'Start tracking your habits, goals and expenses.' : 'Log in to continue.'}</p>
          <form onSubmit={submit} className="space-y-3" noValidate>
            {signup && <Field label="Name"><input autoFocus autoComplete="name" className={inp} value={f.name} onChange={set('name')} /></Field>}
            <Field label="Email"><input type="email" autoComplete="email" className={inp} value={f.email} onChange={set('email')} /></Field>
            <Field label="Password">
              <div className="relative">
                <input type={show ? 'text' : 'password'} autoComplete={signup ? 'new-password' : 'current-password'} className={`${inp} pr-10`} value={f.password} onChange={set('password')} />
                <button type="button" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-700">
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>
            {signup && <Field label="Confirm password"><input type={show ? 'text' : 'password'} autoComplete="new-password" className={inp} value={f.confirm} onChange={set('confirm')} /></Field>}
            {err && <p role="alert" className="text-sm text-red-500">{err}</p>}
            <button disabled={busy} className={`${btnP} w-full justify-center py-2 disabled:opacity-60`}>{busy ? 'Please wait...' : signup ? 'Sign up' : 'Log in'}</button>
          </form>
        </div>
        <p className="mt-4 text-center text-sm text-zinc-500">
          {signup ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button onClick={() => switchTo(signup ? 'login' : 'signup')} className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">{signup ? 'Log in' : 'Sign up'}</button>
        </p>
      </div>
    </main>
  );
}