import { useEffect, useMemo, useState } from 'react';
import { Copy, RefreshCw } from 'lucide-react';
import { api } from '../api';
import { addDays, fmt, key, parse } from '../lib';
import { Bar, Card, btn, iconBtn } from './ui';

const hm = (m) => { m = Math.round(m); const h = Math.floor(m / 60); return h ? `${h}h ${m % 60}m` : `${m}m`; };

export default function PhoneUsage({ today }) {
  const [rows, setRows] = useState([]);
  const [deviceKey, setDeviceKey] = useState('');
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState('');

  const load = () => Promise.all([api.get('/screentime'), api.get('/device/key')])
    .then(([r, k]) => { setRows(r); setDeviceKey(k.key); }).catch((x) => setErr(x.message));
  useEffect(() => { load(); }, []);

  const st = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => key(addDays(parse(today), i - 6)));
    const by = Object.fromEntries(rows.map((r) => [r.date, r]));
    const apps = {};
    days.forEach((d) => (by[d]?.apps || []).forEach((a) => { apps[a.name] = (apps[a.name] || 0) + a.minutes; }));
    const logged = days.filter((d) => by[d]);
    const total = logged.reduce((a, d) => a + by[d].totalMinutes, 0);
    return { days, by, top: Object.entries(apps).sort((a, b) => b[1] - a[1]).slice(0, 8), avg: logged.length ? total / logged.length : 0,
      max: Math.max(60, ...days.map((d) => by[d]?.totalMinutes || 0)) };
  }, [rows, today]);

  const copy = (text, what) => { navigator.clipboard?.writeText(text); setCopied(what); setTimeout(() => setCopied(''), 1500); };
  const reset = async () => {
    if (!window.confirm('Create a new key? The phone app will stop syncing until you paste the new one.')) return;
    try { setDeviceKey((await api.post('/device/key/reset', {})).key); } catch (x) { setErr(x.message); }
  };
  const t = st.by[today];

  return (
    <Card title="Phone screen time" action={<button className={iconBtn} aria-label="Refresh" onClick={load}><RefreshCw size={15} /></button>}>
      {err && <p role="alert" className="mb-3 text-xs text-red-500">{err}</p>}
      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-zinc-500">No phone data yet. Connect your phone using the steps below.</p>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <p className="text-3xl font-semibold">{t ? hm(t.totalMinutes) : '0m'}</p>
              <p className="mb-3 text-sm text-zinc-500">today, from your phone. 7-day average {hm(st.avg)}</p>
              <ul className="space-y-2">
                {(t?.apps || []).slice(0, 6).map((a) => (
                  <li key={a.pkg}>
                    <div className="mb-1 flex justify-between text-sm"><span className="truncate">{a.name}</span><span className="text-xs text-zinc-500">{hm(a.minutes)}</span></div>
                    <Bar value={(a.minutes / t.apps[0].minutes) * 100} />
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="flex h-32 items-end gap-1">
                {st.days.map((d) => (
                  <div key={d} title={`${fmt(d)}: ${hm(st.by[d]?.totalMinutes || 0)}`} className="flex h-full flex-1 flex-col justify-end">
                    <div className="w-full rounded-t bg-indigo-600" style={{ height: `${((st.by[d]?.totalMinutes || 0) / st.max) * 100}%`, minHeight: st.by[d] ? 2 : 0 }} />
                  </div>
                ))}
              </div>
              <div className="mt-1 flex gap-1">{st.days.map((d) => <span key={d} className="flex-1 text-center text-[10px] text-zinc-500">{fmt(d, { weekday: 'short' })}</span>)}</div>
              <h3 className="mb-2 mt-4 text-sm font-medium">Most used apps, last 7 days</h3>
              <ul className="space-y-1 text-sm">
                {st.top.map(([n, m]) => <li key={n} className="flex justify-between"><span className="truncate">{n}</span><span className="text-zinc-500">{hm(m)}</span></li>)}
              </ul>
            </div>
          </div>
        </div>
      )}
      <details className="mt-5 rounded-xl bg-zinc-50 p-3 text-sm dark:bg-zinc-800/50">
        <summary className="cursor-pointer font-medium">Connect your phone</summary>
        <p className="mt-2 text-xs text-zinc-500">Enter these two values in the ScreenSync Android app.</p>
        {[['Website URL', window.location.origin, 'url'], ['Device key', deviceKey, 'key']].map(([l, v, id]) => (
          <div key={id} className="mt-2">
            <p className="text-xs text-zinc-500">{l}</p>
            <div className="flex items-center gap-2"><code className="min-w-0 flex-1 break-all rounded bg-white p-2 text-xs dark:bg-zinc-900">{v}</code>
              <button className={`${btn} py-1 text-xs`} onClick={() => copy(v, id)}><Copy size={12} />{copied === id ? 'Copied' : 'Copy'}</button></div>
          </div>
        ))}
        <button className="mt-3 text-xs text-red-500 hover:underline" onClick={reset}>Create a new key</button>
      </details>
    </Card>
  );
}