import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, RefreshCw } from 'lucide-react';
import { api } from '../api';
import { addDays, fmt, key, parse } from '../lib';
import { Bar, Card, btn, iconBtn } from './ui';

const hm = (m) => { m = Math.round(m); const h = Math.floor(m / 60); return h ? `${h}h ${m % 60}m` : `${m}m`; };
const short = (m) => (m >= 60 ? `${(m / 60).toFixed(1).replace('.0', '')}h` : `${m}m`);
const LEVELS = ['bg-zinc-50 dark:bg-zinc-800/50', 'bg-indigo-100 dark:bg-indigo-950', 'bg-indigo-300 dark:bg-indigo-800', 'bg-indigo-500 text-white'];

export default function PhoneUsage({ today }) {
  const [rows, setRows] = useState([]);
  const [logs, setLogs] = useState([]);
  const [deviceKey, setDeviceKey] = useState('');
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState('');
  const [m, setM] = useState(() => parse(today).getFullYear() * 12 + parse(today).getMonth());
  const [sel, setSel] = useState(today);

  const load = () => Promise.all([api.get('/screentime'), api.get('/device/key'), api.get('/timelogs')])
    .then(([r, k, l]) => { setRows(r); setDeviceKey(k.key); setLogs(l); }).catch((x) => setErr(x.message));
  useEffect(() => { load(); }, []);

  const by = useMemo(() => Object.fromEntries(rows.map((r) => [r.date, r])), [rows]);
  const st = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => key(addDays(parse(today), i - 6)));
    const apps = {};
    days.forEach((d) => (by[d]?.apps || []).forEach((a) => { apps[a.name] = (apps[a.name] || 0) + a.minutes; }));
    const logged = days.filter((d) => by[d]);
    const total = logged.reduce((a, d) => a + by[d].totalMinutes, 0);
    return { days, top: Object.entries(apps).sort((a, b) => b[1] - a[1]).slice(0, 8), avg: logged.length ? total / logged.length : 0,
      max: Math.max(60, ...days.map((d) => by[d]?.totalMinutes || 0)) };
  }, [by, today]);

  // Month calendar
  const y = Math.floor(m / 12), mo = m % 12, prefix = `${y}-${String(mo + 1).padStart(2, '0')}`;
  const first = new Date(y, mo, 1), n = new Date(y, mo + 1, 0).getDate(), lead = (first.getDay() + 6) % 7;
  const cells = [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => key(new Date(y, mo, i + 1)))];
  const monthRows = rows.filter((r) => r.date.startsWith(prefix));
  const monthMax = Math.max(1, ...monthRows.map((r) => r.totalMinutes));
  const monthAvg = monthRows.length ? monthRows.reduce((a, r) => a + r.totalMinutes, 0) / monthRows.length : 0;
  const level = (k) => { const v = by[k]?.totalMinutes || 0; if (!v) return 0; const r = v / monthMax; return r < 0.34 ? 1 : r < 0.67 ? 2 : 3; };
  const d = by[sel];
  const manual = logs.filter((l) => l.date === sel);

  const copy = (text, what) => { navigator.clipboard?.writeText(text); setCopied(what); setTimeout(() => setCopied(''), 1500); };
  const reset = async () => {
    if (!window.confirm('Create a new key? The phone app will stop syncing until you paste the new one.')) return;
    try { setDeviceKey((await api.post('/device/key/reset', {})).key); } catch (x) { setErr(x.message); }
  };
  const t = by[today];

  return (
    <Card title="Phone screen time" action={<button className={iconBtn} aria-label="Refresh" onClick={load}><RefreshCw size={15} /></button>}>
      {err && <p role="alert" className="mb-3 text-xs text-red-500">{err}</p>}
      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-zinc-500">No phone data yet. Connect your phone using the steps below.</p>
      ) : (
        <div className="space-y-8">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="min-w-0">
              <p className="text-3xl font-semibold">{t ? hm(t.totalMinutes) : '0m'}</p>
              <p className="mb-3 text-sm text-zinc-500">today, from your phone. 7-day average {hm(st.avg)}</p>
              <ul className="space-y-2">
                {(t?.apps || []).slice(0, 6).map((a) => (
                  <li key={a.pkg}>
                    <div className="mb-1 flex justify-between gap-2 text-sm"><span className="truncate">{a.name}</span><span className="shrink-0 text-xs text-zinc-500">{hm(a.minutes)}</span></div>
                    <Bar value={(a.minutes / t.apps[0].minutes) * 100} />
                  </li>
                ))}
              </ul>
            </div>
            <div className="min-w-0">
              <div className="flex h-32 items-end gap-1">
                {st.days.map((x) => (
                  <div key={x} title={`${fmt(x)}: ${hm(by[x]?.totalMinutes || 0)}`} className="flex h-full flex-1 flex-col justify-end">
                    <div className="w-full rounded-t bg-indigo-600" style={{ height: `${((by[x]?.totalMinutes || 0) / st.max) * 100}%`, minHeight: by[x] ? 2 : 0 }} />
                  </div>
                ))}
              </div>
              <div className="mt-1 flex gap-1">{st.days.map((x) => <span key={x} className="flex-1 text-center text-[10px] text-zinc-500">{fmt(x, { weekday: 'short' })}</span>)}</div>
              <h3 className="mb-2 mt-4 text-sm font-medium">Most used apps, last 7 days</h3>
              <ul className="space-y-1 text-sm">
                {st.top.map(([name, mins]) => <li key={name} className="flex justify-between gap-2"><span className="truncate">{name}</span><span className="shrink-0 text-zinc-500">{hm(mins)}</span></li>)}
              </ul>
            </div>
          </div>

          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium">Calendar: tap a day to see where your time went</h3>
              <div className="flex items-center gap-1 text-sm">
                <button className={iconBtn} aria-label="Previous month" onClick={() => setM(m - 1)}><ChevronLeft size={16} /></button>
                <span className="w-32 text-center">{first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
                <button className={iconBtn} aria-label="Next month" onClick={() => setM(m + 1)}><ChevronRight size={16} /></button>
              </div>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="min-w-0">
                <div className="grid grid-cols-7 gap-1">
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x, i) => <span key={i} className="text-center text-[11px] text-zinc-400">{x}</span>)}
                  {cells.map((k, i) => {
                    if (!k) return <span key={i} />;
                    const v = by[k]?.totalMinutes || 0, future = k > today;
                    return (
                      <button key={k} disabled={future} onClick={() => setSel(k)} aria-label={`${fmt(k)}: ${v ? hm(v) : 'no data'}`}
                        className={`flex aspect-square flex-col items-center justify-center rounded-md text-[11px] transition ${LEVELS[level(k)]} ${future ? 'opacity-30' : 'hover:ring-2 hover:ring-indigo-400'} ${k === sel ? 'ring-2 ring-indigo-600' : ''} ${k === today ? 'font-semibold' : ''}`}>
                        <span>{parse(k).getDate()}</span>
                        {v > 0 && <span className="text-[9px] leading-none opacity-80">{short(v)}</span>}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-zinc-500">{monthRows.length} days with data{monthRows.length > 0 && `, average ${hm(monthAvg)} a day`}</p>
              </div>
              <div className="min-w-0 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-800/50">
                <h4 className="font-medium">{fmt(sel, { weekday: 'long', month: 'long', day: 'numeric' })}</h4>
                {!d ? <p className="mt-2 text-sm text-zinc-500">No phone data for this day.</p> : (
                  <>
                    <p className="mt-1 text-2xl font-semibold">{hm(d.totalMinutes)}</p>
                    <ul className="mt-3 space-y-2">
                      {d.apps.slice(0, 12).map((a) => (
                        <li key={a.pkg}>
                          <div className="mb-1 flex justify-between gap-2 text-sm"><span className="truncate">{a.name}</span><span className="shrink-0 text-xs text-zinc-500">{hm(a.minutes)}</span></div>
                          <Bar value={(a.minutes / d.apps[0].minutes) * 100} />
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {manual.length > 0 && (
                  <div className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-700">
                    <p className="mb-1 text-xs font-medium text-zinc-500">Logged by hand in Time Audit</p>
                    <ul className="space-y-1 text-sm">
                      {manual.map((l) => <li key={l._id} className="flex justify-between gap-2"><span className="truncate">{l.category}</span><span className="shrink-0 text-zinc-500">{hm(l.minutes)}</span></li>)}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      <details className="mt-6 rounded-xl bg-zinc-50 p-3 text-sm dark:bg-zinc-800/50">
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