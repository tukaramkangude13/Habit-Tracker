import { addDays, fmt, key, parse } from './lib';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const q = (c) => `"${String(c ?? '').replace(/"/g, '""')}"`;
const short = (d) => fmt(d, { month: 'short', day: 'numeric' });

// Recurring tasks are due on each applicable date. One-time tasks remain pending
// until their first check-off, then are completed once and no longer appear as pending.
const dueOn = (d, habits) => {
  const dow = parse(d).getDay();
  return habits.filter((h) => h.frequency !== 'weekly' && h.frequency !== 'once' && (!h.createdAt || key(new Date(h.createdAt)) <= d) && (!h.archivedOn || d < h.archivedOn)
    && !(h.frequency === 'weekdays' && (dow === 0 || dow === 6)));
};

export function buildTaskReport(habits, days, today, from, to) {
  const first = Object.keys(days).sort()[0];
  const a = first && first > from ? first : from;
  const z = to > today ? today : to;
  const rows = [], byTask = new Map();
  const onceHabits = habits.filter((h) => h.frequency === 'once');
  const onceDoneDate = new Map();
  onceHabits.forEach((h) => {
    const completed = Object.keys(days).filter((d) => d >= (h.createdAt ? key(new Date(h.createdAt)) : from) && days[d]?.done?.includes(h._id)).sort()[0];
    if (completed) onceDoneDate.set(h._id, completed);
  });
  if (first && a <= z) {
    for (let d = parse(a); key(d) <= z; d = addDays(d, 1)) {
      const k = key(d), done = [], pending = [];
      dueOn(k, habits).forEach((h) => {
        const t = byTask.get(h._id) || { name: h.name, done: 0, pending: 0, frequency: h.frequency };
        if (days[k]?.done?.includes(h._id)) { done.push(h.name); t.done++; } else { pending.push(h.name); t.pending++; }
        byTask.set(h._id, t);
      });
      onceHabits.forEach((h) => {
        const created = h.createdAt ? key(new Date(h.createdAt)) : from;
        if (k < created || (h.archivedOn && k >= h.archivedOn)) return;
        const completedOn = onceDoneDate.get(h._id);
        if (completedOn && k > completedOn) return;
        const t = byTask.get(h._id) || { name: h.name, done: 0, pending: 0, frequency: 'once' };
        if (completedOn === k) { done.push(h.name); t.done = 1; t.pending = 0; }
        else { pending.push(h.name); if (!completedOn) { t.pending = 1; t.done = 0; } }
        byTask.set(h._id, t);
      });
      if (done.length || pending.length) rows.push({ d: k, done, pending, mood: days[k]?.mood || null });
    }
  }
  // Totals/by-task count each one-time task once; recurring tasks count each due day.
  const recurring = [...byTask.values()].filter((t) => t.frequency !== 'once');
  const once = [...byTask.values()].filter((t) => t.frequency === 'once');
  const completed = recurring.reduce((s, t) => s + t.done, 0) + once.reduce((s, t) => s + (t.done ? 1 : 0), 0);
  const pending = recurring.reduce((s, t) => s + t.pending, 0) + once.reduce((s, t) => s + (t.done ? 0 : (t.pending ? 1 : 0)), 0);
  const tasks = [...byTask.values()].map((t) => {
    let done = t.done, pending = t.pending;
    if (t.frequency === 'once') {
      const h = onceHabits.find((item) => item.name === t.name);
      const completedOn = h ? onceDoneDate.get(h._id) : null;
      done = completedOn && completedOn >= a && completedOn <= z ? 1 : 0;
      pending = !completedOn || completedOn > z ? 1 : 0;
      if (completedOn && completedOn < a) pending = 0;
    }
    const due = done + pending;
    return { name: t.name, frequency: t.frequency, done, pending, due, pct: due ? Math.round(done / due * 100) : 0 };
  }).filter((t) => t.due > 0);
  return {
    from: a, to: z, rows, completed, pending,
    rate: completed + pending ? Math.round((completed / (completed + pending)) * 100) : null,
    perfect: rows.filter((r) => !r.pending.length).length,
    tasks,
  };
}

export function downloadTaskCsv(rep) {
  if (!rep.rows.length) throw new Error('No tracked days in this range.');
  const L = [
    [`Task report ${rep.from} to ${rep.to}`],
    ['Date', 'Weekday', 'Mood', 'Task', 'Status'],
    ...rep.rows.flatMap((r) => [...r.done.map((n) => [r.d, fmt(r.d, { weekday: 'short' }), r.mood || 'Not recorded', n, 'Completed']), ...r.pending.map((n) => [r.d, fmt(r.d, { weekday: 'short' }), r.mood || 'Not recorded', n, 'Pending'])]),
    [], ['Summary by task'], ['Task', 'Type', 'Completed', 'Pending', 'Completion %'],
    ...rep.tasks.map((t) => [t.name, t.frequency === 'once' ? 'One-time' : t.frequency, t.done, t.pending, t.pct]),
    [], ['Total', rep.completed, rep.pending, rep.rate === null ? '' : rep.rate],
  ];
  const el = document.createElement('a');
  el.href = URL.createObjectURL(new Blob(['\uFEFF' + L.map((r) => r.map(q).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  el.download = `task-report-${rep.from}_to_${rep.to}.csv`;
  el.click();
  setTimeout(() => URL.revokeObjectURL(el.href), 1000);
}

export function printTaskReport(rep, today) {
  if (!rep.rows.length) throw new Error('No tracked days in this range.');
  const chips = (list, cls, mark) => (list.length ? list.map((n) => `<span class="chip ${cls}">${mark} ${esc(n)}</span>`).join('') : '<span class="none">-</span>');
  const kpi = (l, v, s) => `<div class="kpi"><small>${l}</small><b>${v}</b><span>${s}</span></div>`;
  const tasks = [...rep.tasks].sort((x, y) => y.pending - x.pending).map((t) => `<tr><td class="l">${esc(t.name)}</td><td>${t.frequency === 'once' ? 'One-time' : esc(t.frequency)}</td><td class="g">${t.done}</td><td class="r">${t.pending}</td>
<td class="l nw"><span class="bar"><i style="width:${t.pct}%"></i></span> ${t.pct}%</td></tr>`).join('');
  const days = rep.rows.map((r) => `<tr class="${r.d === today ? 'today' : ''}"><td class="l nw"><b>${esc(fmt(r.d, { weekday: 'short' }))}</b> ${esc(short(r.d))}${r.d === today ? '<br><small>today</small>' : ''}</td>
<td>${esc(r.mood || '—')}</td><td>${r.done.length}/${r.done.length + r.pending.length}</td><td class="l">${chips(r.done, 'ok', '&#10003;')}</td><td class="l">${chips(r.pending, 'no', '&#9675;')}</td></tr>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Task report ${esc(rep.from)} to ${esc(rep.to)}</title><style>
@page{size:A4;margin:11mm}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:system-ui,Segoe UI,sans-serif;color:#18181b;margin:0;font-size:11px;line-height:1.45}
h1{font-size:22px;margin:0 0 2px}h2{font-size:14px;margin:20px 0 8px;padding-bottom:4px;border-bottom:2px solid #4f46e5}p{margin:3px 0 8px;color:#52525b}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0}.kpi{border:1px solid #e4e4e7;border-radius:8px;padding:8px 10px}
.kpi small{display:block;color:#71717a}.kpi b{display:block;font-size:19px;margin:1px 0}.kpi span{color:#a1a1aa;font-size:10px}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #e4e4e7;padding:4px 7px;text-align:center;vertical-align:top}th{background:#f4f4f5}
td.l{text-align:left}td.nw{white-space:nowrap}td.g{color:#166534;font-weight:600}td.r{color:#991b1b;font-weight:600}
table.days{table-layout:fixed}table.days col.d{width:62px}table.days col.n{width:38px}
.chip{display:inline-block;border-radius:10px;padding:1px 8px;margin:1px 3px 1px 0;font-size:10px}.ok{background:#dcfce7;color:#166534}.no{background:#fee2e2;color:#991b1b}.none{color:#a1a1aa}
tr.today td{background:#eef2ff}thead{display:table-header-group}tr{page-break-inside:avoid}
.bar{display:inline-block;width:70px;height:6px;background:#e4e4e7;border-radius:3px;vertical-align:middle}.bar i{display:block;height:6px;background:#16a34a;border-radius:3px}
.foot{font-size:10px;color:#71717a}.leg{margin:6px 0}</style></head><body>
<h1>Task report</h1>
<p>${esc(fmt(rep.from, { month: 'short', day: 'numeric', year: 'numeric' }))} to ${esc(fmt(rep.to, { month: 'short', day: 'numeric', year: 'numeric' }))} | ${rep.rows.length} tracked ${rep.rows.length === 1 ? 'day' : 'days'}</p>
<div class="kpis">${kpi('Completed', rep.completed, 'task check-offs')}${kpi('Pending', rep.pending, 'not done')}${kpi('Completion', rep.rate === null ? '-' : rep.rate + '%', 'of all due tasks')}${kpi('Perfect days', rep.perfect, 'every task done')}</div>
<p class="leg"><span class="chip ok">&#10003; completed</span> <span class="chip no">&#9675; pending</span></p>
<h2>By task (most pending first)</h2>
<table><thead><tr><th>Task</th><th>Type</th><th>Completed</th><th>Pending</th><th>Completion</th></tr></thead><tbody>${tasks}</tbody></table>
<h2>Day by day</h2>
<table class="days"><colgroup><col class="d"><col class="n"><col class="n"><col><col></colgroup><thead><tr><th>Date</th><th>Mood</th><th>Done</th><th>Completed tasks</th><th>Pending tasks</th></tr></thead><tbody>${days}</tbody></table>
<p class="foot">Days before your first saved record are not counted. Weekly habits are not included. One-time tasks stay pending until completed and count once in the summary. Mood is shown only when recorded.</p>
</body></html>`;
  const w = window.open('', '_blank');
  if (!w) throw new Error('Allow pop-ups for this site to download the PDF.');
  w.document.write(html);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 400);
}