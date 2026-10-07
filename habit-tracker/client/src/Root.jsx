import { useEffect, useState } from 'react';
import { api, getToken, setToken } from './api';
import App from './App';
import AuthPage from './components/AuthPage';

export default function Root() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(Boolean(getToken()));

  useEffect(() => {
    document.documentElement.classList.toggle('dark', localStorage.getItem('theme') === 'dark');
    if (getToken()) api.get('/auth/me').then((r) => setUser(r.user)).catch(() => setToken(null)).finally(() => setChecking(false));
    const out = () => setUser(null);
    window.addEventListener('auth:logout', out);
    return () => window.removeEventListener('auth:logout', out);
  }, []);

  if (checking) return <p className="grid min-h-screen place-items-center text-zinc-500">Loading...</p>;
  return user
    ? <App user={user} onLogout={() => { setToken(null); setUser(null); }} />
    : <AuthPage onAuth={({ token, user: u }) => { setToken(token); setUser(u); }} />;
}