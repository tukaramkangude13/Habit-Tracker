import { useEffect, useMemo, useState } from 'react';
import { Download, FileDown, FileSpreadsheet } from 'lucide-react';
import { api } from '../api';
import { addDays, fmt, key, parse } from '../lib';
import { plan } from '../nutrition';
import { downloadBackup } from '../backup';
import { downloadReportCsv, printReport } from '../reportExport';
import { Card, btn, btnP } from './ui';
   import TaskReport from './TaskReport';
   import NutritionReport from './NutritionReport';
import AIProgressAnalyzer from './AIProgressAnalyzer';
const FOLLOW = 0.9; // a day "follows the plan" at 90% or more of both the calorie and the protein target

const MOODS = { great: ['😄', 4], good: ['🙂', 3], okay: ['😐', 2], low: ['😔', 1], bad: ['😫', 0] };
const hm = (m) => { m = Math.round(m); const h = Math.floor(m / 60); return h ? `${h}h ${m % 60}m` : `${m}m`; };
const M = {
  rate: { label: 'Habits done', fmt: (v) => `${Math.round(v)}%` },
  wasted: { label: 'Time wasted', fmt: hm },
  sleep: { label: 'Sleep', fmt: (v) => `${v.toFixed(1)}h` },
  screen: { label: 'Phone time', fmt: hm },
  spend: { label: 'Spending', fmt: (v) => Math.round(v).toLocaleString() },
  mood: { label: 'Mood', fmt: (v) => `${v.toFixed(1)} / 4` },
  kcalPct: { label: 'Calories vs target', fmt: (v) => `${Math.round(v)}%` },
};
const moodGroup = (r) => (r.moodScore === null ? null : r.moodScore >= 3 ? 'good' : r.moodScore === 2 ? 'okay' : 'low');
const MOOD_GROUPS = [
  { label: 'Good mood', test: (r) => moodGroup(r) === 'good' },
  { label: 'Okay mood', test: (r) => moodGroup(r) === 'okay' },
  { label: 'Low mood', test: (r) => moodGroup(r) === 'low' },
];
const SLEEP_GROUPS = [
  { label: 'Slept under 6h', test: (r) => r.sleep !== null && r.sleep < 6 },
  { label: '6 to 7.5h', test: (r) => r.sleep !== null && r.sleep >= 6 && r.sleep < 7.5 },
  { label: '7.5h or more', test: (r) => r.sleep !== null && r.sleep >= 7.5 },
];
const FOOD_GROUPS = [
  { label: 'Followed plan', test: (r) => r.followed === true },
  { label: 'Missed plan', test: (r) => r.followed === false },
];

// Weekly habits are left out of the daily rate. A date with no saved day record is "not tracked" (null).
const dayRate = (d, habits, days) => {
  if (!days[d]) return null;
  const dow = parse(d).getDay();
  const due = habits.filter((h) => h.frequency !== 'weekly' && h.frequency !== 'once' && key(new Date(h.createdAt)) <= d && (!h.archivedOn || d < h.archivedOn) && !(h.frequency === 'weekdays' && (dow === 0 || dow === 6)));
  if (!due.length) return null;
  const done = due.filter((h) => days[d].done?.includes(h._id)).length;
  return { done, due: due.length };
};

const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

// Calculation only. The screen and both downloads use this result.
function analyze(title, rows, groups, metrics) {
  const cols = groups.map((g) => {
    const groupRows = rows.filter(g.test);
    const avg = {};
    const count = {};
    metrics.forEach((id) => {
      // Preserve any real recorded value, even for one day. Sample size affects confidence,
      // not whether the user is allowed to see their own data.
      const values = groupRows.map((row) => row[id]).filter((value) => value !== null && value !== undefined && Number.isFinite(value));
      count[id] = values.length;
      avg[id] = values.length ? mean(values) : null;
    });
    return { ...g, n: groupRows.length, avg, count };
  });
  const [a, b] = [cols[0], cols[cols.length - 1]];
  const notes = metrics.flatMap((id) => {
    // Only infer a group-level difference when both groups have at least 3 actual values.
    if (a.count[id] < 3 || b.count[id] < 3) return [];
    const x = a.avg[id], z = b.avg[id];
    if (x === null || z === null || Math.max(Math.abs(x), Math.abs(z)) === 0) return [];
    if (Math.abs(x - z) / Math.max(Math.abs(x), Math.abs(z)) < 0.2) return [];
    return [`${M[id].label} averaged ${M[id].fmt(x)} across ${a.count[id]} recorded days in "${a.label}" vs ${M[id].fmt(z)} across ${b.count[id]} recorded days in "${b.label}". This is an association, not proof of cause.`];
  });
  return { title, metrics, cols, notes };
}

const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

function downloadComparisonCsv({ title, metrics, cols, notes }) {
  const lines = [
    [title],
    ['Group', 'Recorded days', 'Metric', 'Average', 'Days with metric'],
    ...cols.flatMap((col) => metrics.map((id) => [
      col.label,
      col.n,
      M[id].label,
      col.avg[id] == null ? 'No records' : M[id].fmt(col.avg[id]),
      col.count[id] || 0,
    ])),
    [],
    ['Interpretation'],
    ...(notes.length ? notes.map((note) => [note]) : [['Not enough comparable data to identify a reliable pattern.']]),
    ['Note', 'Differences show associations, not proof of cause.'],
  ];
  const csv = '\uFEFF' + lines.map((line) => line.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-report.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function printComparisonReport({ title, metrics, cols, notes }) {
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isMood = title.toLowerCase().includes('mood');
  const palette = isMood
    ? [
        { color: '#059669', tint: '#ECFDF5', label: '#047857' },
        { color: '#D97706', tint: '#FFFBEB', label: '#B45309' },
        { color: '#E11D48', tint: '#FFF1F2', label: '#BE123C' },
      ]
    : [
        { color: '#4F46E5', tint: '#EEF2FF', label: '#4338CA' },
        { color: '#0891B2', tint: '#ECFEFF', label: '#0E7490' },
        { color: '#7C3AED', tint: '#F5F3FF', label: '#6D28D9' },
      ];
  const metricValue = (id, col) => col.avg[id] == null ? 'No records' : M[id].fmt(col.avg[id]);
  const metricPct = (id, col) => {
    const v = col.avg[id];
    if (v == null) return null;
    if (id === 'rate' || id === 'kcalPct') return Math.max(0, Math.min(100, v));
    const all = cols.map((c) => c.avg[id]).filter((x) => x != null && Number.isFinite(x));
    const max = Math.max(0, ...all);
    return max > 0 ? Math.max(0, Math.min(100, v / max * 100)) : 0;
  };
  const totalDays = cols.reduce((n, c) => n + c.n, 0);
  const allMetricCount = (id) => cols.reduce((n, c) => n + (c.count[id] || 0), 0);
  const kpis = [
    { label: 'Groups compared', value: String(cols.length), sub: 'Recorded categories', color: '#4F46E5' },
    { label: 'Recorded days', value: String(totalDays), sub: 'Across all groups', color: '#0891B2' },
    { label: 'Metrics tracked', value: String(metrics.length), sub: 'Habit and lifestyle signals', color: '#059669' },
    { label: 'Data coverage', value: String(metrics.reduce((n, id) => n + allMetricCount(id), 0)), sub: 'Metric-day entries', color: '#D97706' },
  ];
  const kpiHtml = kpis.map((k) => `<div class="kpi" style="--accent:${k.color}"><small>${esc(k.label)}</small><strong>${esc(k.value)}</strong><span>${esc(k.sub)}</span></div>`).join('');
  const body = cols.map((col, i) => {
    const p = palette[i % palette.length];
    const rows = metrics.map((id) => {
      const count = col.count[id] || 0;
      const value = metricValue(id, col);
      const pct = metricPct(id, col);
      const bar = pct == null ? '<div class="track empty"></div>' : `<div class="track"><i style="width:${pct}%;background:${p.color}"></i></div>`;
      const coverage = count === 0 ? 'No entry recorded for this metric' : `${count} day${count === 1 ? '' : 's'} with data`;
      return `<div class="metric"><div class="metric-head"><span>${esc(M[id].label)}</span><strong style="color:${count ? p.label : '#94A3B8'}">${esc(value)}</strong></div>${bar}<small>${esc(coverage)}</small></div>`;
    }).join('');
    const caution = col.n < 3 ? `<div class="caution">Small sample · ${col.n} recorded day${col.n === 1 ? '' : 's'} · treat cautiously</div>` : '';
    return `<section class="mood-card" style="--accent:${p.color};--tint:${p.tint};--label:${p.label}"><header><div><h2>${esc(col.label)}</h2><p>${col.n} recorded day${col.n === 1 ? '' : 's'}</p></div><span class="count">${col.n} ${col.n === 1 ? 'day' : 'days'}</span></header>${caution}<div class="metrics">${rows}</div></section>`;
  }).join('');
  const interpretation = notes.length
    ? `<div class="insight-list">${notes.map((note, i) => `<div class="insight"><span class="insight-num">${String(i + 1).padStart(2, '0')}</span><p>${esc(note)}</p></div>`).join('')}</div>`
    : `<div class="insight empty-insight"><strong>Not enough comparable data yet</strong><p>Keep recording these metrics across more days. Values are still shown above, but we avoid claiming a reliable pattern until there are enough comparable observations.</p></div>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@page{size:A4;margin:12mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{font:10px/1.45 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:#1F2937;margin:0;background:#fff} .hero{background:linear-gradient(125deg,#172554,#4338CA 65%,#6366F1);color:#fff;border-radius:14px;padding:22px 24px;margin-bottom:16px}.eyebrow{font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:#C7D2FE;font-weight:700}.hero h1{font-size:24px;line-height:1.15;margin:7px 0 5px;color:#fff}.hero p{margin:0;color:#E0E7FF;font-size:10px}.section-title{font-size:14px;color:#172554;margin:18px 0 9px;padding-bottom:6px;border-bottom:1px solid #E2E8F0}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0 15px}.kpi{border:1px solid #E2E8F0;border-top:3px solid var(--accent);border-radius:9px;padding:10px;background:#fff;min-height:73px}.kpi small,.kpi span{display:block;color:#64748B;font-size:8px}.kpi strong{display:block;font-size:20px;color:#172554;margin:4px 0}.groups{display:grid;grid-template-columns:repeat(${Math.min(3, Math.max(1, cols.length))},minmax(0,1fr));gap:8px;align-items:stretch}.mood-card{background:var(--tint);border:1px solid var(--accent);border-radius:11px;padding:11px;break-inside:avoid}.mood-card header{display:flex;align-items:flex-start;justify-content:space-between;gap:5px;padding-bottom:8px;border-bottom:1px solid #FFFFFFB8}.mood-card h2{font-size:12px;margin:0;color:#172554}.mood-card header p{margin:2px 0 0;color:#64748B;font-size:8px}.count{white-space:nowrap;border-radius:99px;background:#fff;padding:3px 7px;font-size:8px;color:var(--label);font-weight:700}.caution{font-size:7.5px;color:var(--label);font-weight:700;padding:6px 0 2px}.metrics{padding-top:4px}.metric{padding:7px 0;border-bottom:1px solid #FFFFFFC9;break-inside:avoid}.metric:last-child{border-bottom:0}.metric-head{display:flex;justify-content:space-between;align-items:baseline;gap:6px}.metric-head span{font-size:8.5px;color:#475569}.metric-head strong{font-size:10px;text-align:right;overflow-wrap:anywhere}.track{height:5px;background:#E2E8F0;border-radius:99px;overflow:hidden;margin-top:5px}.track i{height:100%;display:block;border-radius:99px}.track.empty{background:#E2E8F0}.metric small{display:block;margin-top:4px;color:#64748B;font-size:7px}.banner{border:1px solid #C7D2FE;background:#EEF2FF;border-radius:10px;padding:10px 12px;margin:12px 0 15px}.banner strong{display:block;color:#312E81;font-size:10px;margin-bottom:3px}.banner p{margin:0;color:#4338CA;font-size:8.5px}.insight-list{display:grid;gap:7px}.insight{display:flex;gap:9px;border:1px solid #E2E8F0;border-radius:8px;padding:9px;background:#fff;break-inside:avoid}.insight-num{display:flex;flex:0 0 25px;height:25px;border-radius:7px;background:#EEF2FF;color:#4338CA;align-items:center;justify-content:center;font-weight:800}.insight p{margin:0;font-size:9px;color:#334155}.empty-insight{display:block;background:#F8FAFC}.empty-insight p{margin-top:4px}.action{margin-top:13px;padding:12px;border-radius:10px;background:#F8FAFC;border:1px solid #E2E8F0}.action h3{margin:0 0 6px;color:#172554;font-size:11px}.action p{margin:0;color:#475569;font-size:8.5px}.footer{border-top:1px solid #E2E8F0;margin-top:16px;padding-top:7px;color:#64748B;font-size:7.5px;display:flex;justify-content:space-between}.no-break{break-inside:avoid}h2,h3{break-after:avoid}@media print{body{background:#fff}.hero,.mood-card,.kpi,.banner,.action{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<div class="hero"><div class="eyebrow">Habit Tracker · Personal analytics</div><h1>${esc(title)}</h1><p>Generated from your recorded data · Values show what is known; missing entries are never treated as zero.</p></div>
<h2 class="section-title">At a glance</h2><div class="kpis">${kpiHtml}</div>
<div class="banner"><strong>Look for patterns, not causes</strong><p>These groups describe what happened on recorded days. Differences do not prove that mood caused a behavior. Small samples should be treated cautiously.</p></div>
<h2 class="section-title">Compare your recorded days</h2><div class="groups">${body}</div>
<h2 class="section-title">What this means</h2>${interpretation}
<div class="action"><h3>Make the next week more useful</h3><p>Keep logging mood, habits, sleep, phone time, spending, nutrition and wasted time on the same dates. Repeated records make comparisons more reliable and help identify which changes are worth testing.</p></div>
<div class="footer"><span>Habit Tracker · Mood & behavior report</span><span>${esc(title)} · Private report</span></div>
<script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script></body></html>`;
  const win = window.open('', '_blank');
  if (!win) throw new Error('Allow pop-ups to export this report as PDF.');
  win.document.open();
  win.document.write(html);
  win.document.close();
}

// Display a readable comparison with context, sample-size warnings, and explicit missing-data states.
function Compare({ a: { title, metrics, cols, notes } }) {
  const isMood = title.toLowerCase().includes('mood');
  const enoughData = cols.some((c) => c.n >= 3);
  const hasComparisons = notes.length > 0;
  const metricDescriptions = {
    rate: 'Share of scheduled habits completed on recorded days.',
    wasted: 'Time marked as wasted in your logs.',
    sleep: 'Average sleep duration on days where it was recorded.',
    screen: 'Average phone usage from synced screen-time records.',
    spend: 'Average spending recorded for those days.',
    kcalPct: 'Average calorie intake as a percentage of your configured target.',
    mood: 'Average mood score on a 0–4 scale.',
  };
  return (
    <Card title={title} action={<div className="flex flex-wrap gap-2"><button type="button" className={`${btn} text-xs`} onClick={() => downloadComparisonCsv({ title, metrics, cols, notes })}><FileSpreadsheet size={14} />CSV</button><button type="button" className={`${btn} text-xs`} onClick={() => printComparisonReport({ title, metrics, cols, notes })}><FileDown size={14} />PDF</button></div>}>
      <div className="mb-4 flex items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 dark:border-indigo-900/60 dark:bg-indigo-950/30">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-indigo-600 shadow-sm dark:bg-zinc-900 dark:text-indigo-300">
          {isMood ? '☁️' : '📊'}
        </span>
        <div>
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{isMood ? 'Look for patterns, not causes' : 'Compare your recorded days'}</p>
          <p className="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
            {isMood
              ? 'These groups show what tends to happen on different mood days. A difference does not prove that mood caused the behavior.'
              : 'Compare the averages below. Missing values mean the metric was not recorded often enough to calculate a useful average.'}
          </p>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {cols.map((c, i) => {
          const moodStyle = i === 0
            ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20'
            : i === 1
              ? 'border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20'
              : 'border-rose-200 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/20';
          return (
            <div key={c.label} className={`min-w-0 rounded-xl border p-3 ${isMood ? moodStyle : 'border-zinc-200 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-900/50'}`}>
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{c.label}</h4>
                <span className="shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">{c.n} {c.n === 1 ? 'day' : 'days'}</span>
              </div>
              {c.n < 3 && <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">Small sample · treat carefully</p>}
              <div className="mt-3 space-y-3">
                {metrics.map((id) => {
                  const value = c.avg[id];
                  const metricCount = c.count[id] || 0;
                  const top = Math.max(...cols.map((x) => x.avg[id] ?? 0), 0.0001);
                  const width = value === null ? 0 : Math.max(3, (value / top) * 100);
                  return (
                    <div key={id}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">{M[id].label}</span>
                        <span className={`text-sm font-semibold tabular-nums ${value === null ? 'text-zinc-400' : 'text-zinc-900 dark:text-zinc-100'}`}>
                          {value === null ? 'No records' : M[id].fmt(value)}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-zinc-800">
                        <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${width}%` }} />
                      </div>
                      {value === null
                        ? <p className="mt-1 text-[10px] text-zinc-400">No {M[id].label.toLowerCase()} entry in this mood group</p>
                        : metricCount < 3
                          ? <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-300">{metricCount} recorded {metricCount === 1 ? 'day' : 'days'} · small sample, not enough to infer a pattern</p>
                          : <p className="mt-1 text-[10px] text-zinc-400">Average across {metricCount} recorded days</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">✦</span>
          <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">What this means</h4>
        </div>
        {hasComparisons ? (
          <ul className="mt-2 space-y-2">
            {notes.map((note) => <li key={note} className="flex gap-2 text-sm leading-5 text-zinc-600 dark:text-zinc-300"><span className="mt-0.5 text-indigo-500">•</span><span>{note}</span></li>)}
          </ul>
        ) : (
          <p className="mt-2 text-sm leading-5 text-zinc-600 dark:text-zinc-300">
            {enoughData
              ? 'There is not yet a clear difference in the recorded averages. Keep logging consistently; avoid drawing conclusions from small changes.'
              : 'There are not enough recorded days to compare these groups reliably. Continue logging mood and daily metrics; this section will become more useful as the sample grows.'}
          </p>
        )}
        {isMood && <p className="mt-2 text-xs leading-5 text-zinc-500">Next step: check whether the same pattern appears across more days before changing your routine.</p>}
      </div>
      <details className="mt-3 rounded-lg px-1 py-1">
        <summary className="cursor-pointer text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">How to read these metrics</summary>
        <ul className="mt-2 space-y-1 pl-4 text-xs leading-5 text-zinc-500">
          {metrics.map((id) => <li key={id}><strong>{M[id].label}:</strong> {metricDescriptions[id] || 'Average of available recorded values.'}</li>)}
        </ul>
      </details>
    </Card>
  );
}

const Kpi = ({ label, value, sub }) => (
  <div className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
    <p className="truncate text-xs text-zinc-500">{label}</p>
    <p className="mt-1 text-xl font-semibold">{value}</p>
    <p className="truncate text-xs text-zinc-400">{sub}</p>
  </div>
);

export default function Report({ habits, days, today }) {
  const [span, setSpan] = useState('month'); // month | 30 | 90 | custom
  const [customFrom, setCustomFrom] = useState(() => `${today.slice(0, 7)}-01`);
  const [customTo, setCustomTo] = useState(today);
  const [extra, setExtra] = useState(null);
  const [goal, setGoal] = useState(null); // { kcal, protein } from the Nutrition plan, or null if no plan is set up
  const [err, setErr] = useState('');

  const from = span === 'custom' ? customFrom : span === 'month' ? `${today.slice(0, 7)}-01` : key(addDays(parse(today), 1 - Number(span)));
  const to = span === 'custom' ? customTo : today;
  const validRange = from <= to && to <= today && (parse(to) - parse(from)) / 86400000 <= 365;
  const n = validRange ? Math.round((parse(to) - parse(from)) / 86400000) + 1 : 0;
  const label = span === 'month' ? fmt(today, { month: 'long', year: 'numeric' }) : `${from} to ${to}`;

  useEffect(() => {
    let live = true;
    setExtra(null); setErr('');
    if (!validRange) { setErr('Choose a valid date range of up to 366 days, ending today or earlier.'); return; }
    api.get(`/report?from=${from}&to=${to}`).then((d) => live && setExtra(d)).catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [from, to, validRange]);

  // Same calculation as the Nutrition tab: profile + latest logged weight.
  useEffect(() => {
    let live = true;
    Promise.all([api.get('/nutrition/profile'), api.get('/weights')]).then(([p, w]) => {
      if (!live || !p) return;
      const P = plan({ ...p, weight: w.length ? w[w.length - 1].kg : p.weight }, today);
      setGoal({ kcal: P.gain <= 0 ? P.tdee : P.kcal, protein: P.protein });
    }).catch(() => {});
    return () => { live = false; };
  }, [today]);

  const rows = useMemo(() => {
    if (!extra) return [];
    const any = (f) => Object.values(extra).some((x) => x[f] !== undefined);
    const tw = any('wasted'), ts = any('spend'); // never logged in this range = "no data", not 0
    return Array.from({ length: n }, (_, i) => key(addDays(parse(from), i))).map((d) => {
      const day = days[d], x = extra[d] || {}, r = dayRate(d, habits, days);
      const ate = goal && x.kcal !== undefined; // a day with no food logged is "not tracked", not a missed day
      return {
        d, mood: day?.mood || null, moodScore: MOODS[day?.mood]?.[1] ?? null,
        sleep: typeof day?.sleep === 'number' ? day.sleep : null,
        rate: r ? (r.done / r.due) * 100 : null, done: r?.done ?? null, due: r?.due ?? null,
        wasted: tw ? (x.wasted ?? null) : null, spend: ts ? (x.spend ?? null) : null, screen: x.screen ?? null,
        kcal: x.kcal ?? null, protein: x.protein ?? null,
        kcalPct: ate ? (x.kcal / goal.kcal) * 100 : null,
        followed: ate ? x.kcal >= FOLLOW * goal.kcal && (x.protein || 0) >= FOLLOW * goal.protein : null,
        note: day?.note || '',
      };
    });
  }, [extra, habits, days, from, n, goal]);

  const analysis = useMemo(() => {
    if (!extra) return [];
    const sc = rows.map((r) => ({ ...r, mood: r.moodScore }));
    const out = [
      analyze('What changes with your mood', sc.filter((r) => r.moodScore !== null), MOOD_GROUPS, ['rate', 'wasted', 'sleep', 'screen', 'spend', 'kcalPct']),
      analyze('What changes with your sleep', sc, SLEEP_GROUPS, ['mood', 'rate', 'wasted', 'screen', 'spend']),
    ];
    if (sc.some((r) => r.followed !== null)) {
      out.push(analyze('What changes when you follow your nutrition plan', sc.filter((r) => r.followed !== null), FOOD_GROUPS, ['mood', 'rate', 'wasted', 'sleep', 'screen']));
    }
    return out;
  }, [rows, extra]);

  const run = (fn) => { try { setErr(''); fn({ rows, analysis, M, MOODS, label, from, to }); } catch (e) { setErr(e.message); } };

  const col = (k) => rows.map((r) => r[k]).filter((v) => v !== null);
  const avgOf = (k) => (col(k).length ? mean(col(k)) : null);
  const wastedTotal = col('wasted').reduce((s, v) => s + v, 0);
  const moodAvg = col('moodScore').length ? mean(col('moodScore')) : null;
  const moodEmoji = moodAvg === null ? '' : Object.values(MOODS).find(([, s]) => s === Math.round(moodAvg))?.[0];
  const foodDays = col('followed');
  const followedDays = foodDays.filter(Boolean).length;

  return (
    <div className="space-y-6">
      <Card title="Report"
        action={<div className="flex flex-wrap justify-end gap-1">{[['month', 'This month'], [30, '30 days'], [90, '90 days'], ['custom', 'Custom range']].map(([v, l]) => (
          <button key={v} onClick={() => setSpan(v)} className={`rounded-full px-3 py-1 text-xs ${span === v ? 'bg-indigo-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800'}`}>{l}</button>
        ))}</div>}>
        {span === 'custom' && <div className="mb-4 grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900 sm:grid-cols-2"><label className="text-sm font-medium">From date<input type="date" max={customTo} value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="mt-2 block w-full rounded-lg border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white" /></label><label className="text-sm font-medium">To date<input type="date" min={customFrom} max={today} value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="mt-2 block w-full rounded-lg border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white" /></label></div>}
        {err && <p role="alert" className="mb-3 text-xs text-red-500">{err}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm capitalize text-zinc-500">{label}</p>
          <div className="flex flex-wrap gap-2">
            <button disabled={!extra} className={`${btnP} disabled:opacity-50`} onClick={() => run(printReport)}><FileDown size={16} />PDF</button>
            <button disabled={!extra} className={`${btn} disabled:opacity-50`} onClick={() => run(downloadReportCsv)}><FileSpreadsheet size={16} />Excel (CSV)</button>
            <button className={btn} onClick={() => downloadBackup().catch((e) => setErr(e.message))}><Download size={16} />Backup (JSON)</button>
          </div>
        </div>
      </Card>
      <TaskReport
  habits={habits}
  days={days}
  today={today}
/>

{/* Detailed nutrition report */}
<NutritionReport today={today} />

{!extra && !err && (
  <p className="py-10 text-center text-sm text-zinc-500">
    Loading...
  </p>
)}

      {extra && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi label="Habits done (avg)" value={avgOf('rate') === null ? '-' : M.rate.fmt(avgOf('rate'))} sub={`${col('rate').length} tracked days`} />
            <Kpi label="Sleep (avg)" value={avgOf('sleep') === null ? '-' : M.sleep.fmt(avgOf('sleep'))} sub={`${col('sleep').length} nights logged`} />
            <Kpi label="Time wasted" value={col('wasted').length ? hm(wastedTotal) : '-'} sub={col('wasted').length ? `${hm(wastedTotal / col('wasted').length)} per logged day · ${col('wasted').length} logged` : 'nothing logged'} />
            <Kpi label="Average mood" value={moodAvg === null ? '-' : `${moodEmoji} ${moodAvg.toFixed(1)}`} sub={`${col('moodScore').length} days with mood`} />
            <Kpi label="Nutrition plan" value={foodDays.length ? `${followedDays} / ${foodDays.length} days` : '-'} sub={goal ? (foodDays.length ? 'days you followed it' : 'no food logged') : 'set up a plan first'} />
          </div>

          {analysis.map((a) => <Compare key={a.title} a={{ ...a, title: `${a.title} · ${label}` }} />)}
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">AI analysis currently uses its own rolling 30-day window; the selected report date range applies to the statistics and downloads below, not yet to the AI response.</div>
          <AIProgressAnalyzer />
          <Card title="Daily review">
            <p className="mb-3 text-sm text-zinc-500">A day-by-day view of habit completion, mood, nutrition, screen time, sleep, and your note about what you did. Missing values mean that data was not logged.</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[930px] text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800">
                    <th className="px-2 py-2 font-medium">Date</th>
                    <th className="px-2 py-2 font-medium">Tasks</th>
                    <th className="px-2 py-2 font-medium">Mood</th>
                    <th className="px-2 py-2 font-medium">Sleep</th>
                    <th className="px-2 py-2 font-medium">Calories</th>
                    <th className="px-2 py-2 font-medium">Protein</th>
                    <th className="px-2 py-2 font-medium">Screen time</th>
                    <th className="px-2 py-2 font-medium">Time wasted</th>
                    <th className="px-2 py-2 font-medium">What I did / daily note</th>
                  </tr>
                </thead>
                <tbody>
                  {[...rows].reverse().map((r) => (
                    <tr key={r.d} className="border-b border-zinc-100 align-top dark:border-zinc-800">
                      <td className="whitespace-nowrap px-2 py-2">{fmt(r.d, { month: 'short', day: 'numeric' })}</td>
                      <td className="px-2 py-2">{r.rate === null ? '—' : `${Math.round(r.rate)}% (${r.done}/${r.due})`}</td>
                      <td className="px-2 py-2">{r.mood ? `${MOODS[r.mood][0]} ${r.mood}` : '—'}</td>
                      <td className="whitespace-nowrap px-2 py-2">{r.sleep === null ? '—' : `${r.sleep}h`}</td>
                      <td className="whitespace-nowrap px-2 py-2">{r.kcal === null ? '—' : Math.round(r.kcal).toLocaleString()}</td>
                      <td className="whitespace-nowrap px-2 py-2">{r.protein === null ? '—' : `${Math.round(r.protein)} g`}</td>
                      <td className="whitespace-nowrap px-2 py-2">{r.screen === null ? '—' : hm(r.screen)}</td>
                      <td className="whitespace-nowrap px-2 py-2">{r.wasted === null ? <span className="text-zinc-400">Not logged</span> : hm(r.wasted)}</td>
                      <td className="max-w-[260px] px-2 py-2 text-zinc-600 dark:text-zinc-300">{r.note ? r.note : <span className="text-zinc-400">Not recorded</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <p className="px-1 text-xs text-zinc-500">These are patterns, not causes. Low mood might make you waste time, or wasting time might lower your mood. The tables only show what tends to happen together.</p>
        </>
      )}
    </div>
  );
}