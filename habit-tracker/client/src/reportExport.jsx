import { fmt } from './lib';
import { chartsHtml, CHART_CSS } from './pdfCharts';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const q = (c) => `"${String(c ?? '').replace(/"/g, '""')}"`;

// Days before you started tracking are cut off, so the charts and tables only cover real data.
const hasData = (r) => r.mood || r.rate !== null || r.sleep !== null || r.screen !== null || r.kcal !== null || r.note || r.wasted > 0 || r.spend > 0;
const trim = (rows) => { const i = rows.findIndex(hasData); return i < 0 ? [] : rows.slice(i); };
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);

// ---------- Excel (CSV): one row per day with raw numbers, then the patterns ----------
export function downloadReportCsv({ rows: all, analysis, M, label }) {
  const rows = trim(all);
  if (!rows.length) throw new Error('Nothing to export yet.');
  const a = rows[0].d, z = rows[rows.length - 1].d;
  const v = (x) => (x === null || x === undefined ? '' : x);
  const L = [
    [`Daily report - ${label} (${a} to ${z})`],
    ['Date', 'Weekday', 'Mood', 'Habits done', 'Habits due', 'Habit %', 'Sleep (h)', 'Time wasted (min)', 'Phone (min)', 'Spending', 'Calories', 'Protein (g)', 'Calories % of target', 'Followed nutrition', 'Note'],
    ...rows.map((r) => [r.d, fmt(r.d, { weekday: 'short' }), r.mood || '', v(r.done), v(r.due), r.rate === null ? '' : Math.round(r.rate),
      v(r.sleep), v(r.wasted), v(r.screen), v(r.spend), v(r.kcal), v(r.protein), r.kcalPct === null ? '' : Math.round(r.kcalPct),
      r.followed === null ? '' : r.followed ? 'yes' : 'no', r.note.replace(/\s+/g, ' ')]),
  ];
  analysis.forEach((s) => {
    L.push([], [s.title], ['', ...s.cols.map((c) => `${c.label} (${c.n} days)`)]);
    s.metrics.forEach((id) => L.push([M[id].label, ...s.cols.map((c) => (c.avg[id] === null ? '' : M[id].fmt(c.avg[id])))]));
    (s.notes.length ? s.notes : ['No clear difference yet, or not enough days.']).forEach((n) => L.push([n]));
  });
  const csv = '\uFEFF' + L.map((r) => r.map(q).join(',')).join('\r\n');
  const el = document.createElement('a');
  el.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  el.download = `daily-report-${a}_to_${z}.csv`;
  el.click();
  setTimeout(() => URL.revokeObjectURL(el.href), 1000);
}

// ---------- PDF: opens a print page, choose "Save as PDF" ----------
export function printReport({ rows: all, analysis, M, MOODS, label }) {
  const rows = trim(all);
  if (!rows.length) throw new Error('Nothing to export yet.');
  const a = rows[0].d, z = rows[rows.length - 1].d;
  const f = (id, x) => (x === null || x === undefined ? '-' : esc(M[id].fmt(x)));
  const col = (k) => rows.map((r) => r[k]).filter((x) => x !== null && x !== undefined);
  const hm = M.wasted.fmt;

  const rate = mean(col('rate')), sleep = mean(col('sleep')), screen = mean(col('screen'));
  const wasted = col('wasted').reduce((s, x) => s + x, 0), spend = col('spend').reduce((s, x) => s + x, 0);
  const food = col('followed'), followed = food.filter(Boolean).length;
  const kpis = [
    ['Habits done', rate === null ? '-' : M.rate.fmt(rate), `average of ${col('rate').length} tracked days`],
    ['Sleep', sleep === null ? '-' : M.sleep.fmt(sleep), `average, ${col('sleep').length} nights logged`],
    ['Time wasted', col('wasted').length ? hm(wasted) : '-', col('wasted').length ? `${hm(wasted / rows.length)} a day` : 'nothing logged'],
    ['Phone screen time', screen === null ? '-' : M.screen.fmt(screen), 'average per day'],
    ['Spending', col('spend').length ? Math.round(spend).toLocaleString() : '-', col('spend').length ? `${Math.round(spend / rows.length).toLocaleString()} a day` : 'nothing logged'],
    ['Nutrition plan', food.length ? `${followed} of ${food.length} days` : '-', food.length ? 'days you followed it' : 'no food logged'],
  ].map(([l, v, s]) => `<div class="kpi"><small>${esc(l)}</small><b>${esc(v)}</b><span>${esc(s)}</span></div>`).join('');

  const stands = analysis.flatMap((s) => s.notes);
  const usable = analysis.filter((s) => s.cols.filter((c) => c.n >= 3).length >= 2);
  const patterns = usable.map((s) => `<h3>${esc(s.title)}</h3>
<table class="c"><thead><tr><th></th>${s.cols.map((c) => `<th>${esc(c.label)}<br><small>${c.n} ${c.n === 1 ? 'day' : 'days'}</small></th>`).join('')}</tr></thead>
<tbody>${s.metrics.map((id) => `<tr><td class="l">${esc(M[id].label)}</td>${s.cols.map((c) => `<td>${f(id, c.avg[id])}</td>`).join('')}</tr>`).join('')}</tbody></table>`).join('');
  const waiting = analysis.filter((s) => !usable.includes(s)).map((s) => s.title.replace('What changes ', '').replace('with your ', 'with ')).join(', ');

  const days = rows.map((r) => `<tr style="background:rgba(79,70,229,${((r.rate || 0) / 100) * 0.14})">
<td class="l nw">${esc(fmt(r.d, { weekday: 'short' }))} ${esc(fmt(r.d, { month: 'short', day: 'numeric' }))}</td><td>${MOODS[r.mood]?.[0] || '-'}</td>
<td class="l nw"><span class="bar"><i style="width:${r.rate ?? 0}%"></i></span> ${r.due ? `${r.done}/${r.due}` : '-'}</td>
<td>${f('sleep', r.sleep)}</td><td>${f('wasted', r.wasted)}</td><td>${f('screen', r.screen)}</td><td>${f('spend', r.spend)}</td>
<td>${r.followed == null ? '-' : `${r.followed ? 'Yes' : 'No'} ${r.kcalPct === null ? '' : Math.round(r.kcalPct) + '%'}`}</td>
<td class="l note">${esc(r.note.slice(0, 140))}</td></tr>`).join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Daily report ${esc(label)}</title><style>
@page{size:A4;margin:11mm}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:system-ui,Segoe UI,sans-serif;color:#18181b;margin:0;font-size:11px;line-height:1.45}
h1{font-size:22px;margin:0 0 2px}h2{font-size:14px;margin:22px 0 8px;padding-bottom:4px;border-bottom:2px solid #4f46e5}h3{font-size:12px;margin:14px 0 6px}
p{margin:3px 0 8px;color:#52525b}.sub{font-size:12px}ul{margin:6px 0;padding-left:18px}li{margin:2px 0}
.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0}.kpi{border:1px solid #e4e4e7;border-radius:8px;padding:8px 10px}
.kpi small{display:block;color:#71717a}.kpi b{display:block;font-size:17px;margin:1px 0}.kpi span{color:#a1a1aa;font-size:10px}
.stand{background:#eef2ff;border-left:4px solid #4f46e5;border-radius:6px;padding:6px 12px}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #e4e4e7;padding:3px 6px;text-align:center}th{background:#f4f4f5}
table.days{table-layout:fixed}table.days col.d{width:64px}table.days col.m{width:34px}table.days col.h{width:78px}table.days col.s{width:40px}table.days col.w{width:46px}table.days col.p{width:52px}table.days col.sp{width:46px}table.days col.f{width:62px}
td.l{text-align:left}td.nw{white-space:nowrap}table.c{width:auto;min-width:340px}td.note{font-size:10px;color:#52525b;word-break:break-word}
thead{display:table-header-group}tr{page-break-inside:avoid}
.bar{display:inline-block;width:34px;height:6px;background:#e4e4e7;border-radius:3px;vertical-align:middle}.bar i{display:block;height:6px;background:#4f46e5;border-radius:3px}
.foot{font-size:10px;color:#71717a}
${CHART_CSS}</style></head><body>
<h1>Daily report: ${esc(label)}</h1>
<p class="sub">${esc(fmt(a, { month: 'short', day: 'numeric', year: 'numeric' }))} to ${esc(fmt(z, { month: 'short', day: 'numeric', year: 'numeric' }))} | ${rows.length} days since you started tracking | ${rows.filter((r) => r.mood).length} days with a mood</p>
<h2>At a glance</h2>
<div class="kpis">${kpis}</div>
<h2>What stands out</h2>
${stands.length ? `<div class="stand"><ul>${stands.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>` : '<p>No strong pattern yet. Keep logging habits, sleep and mood for a few more weeks and differences will show here.</p>'}
${patterns}
${waiting ? `<p class="foot">Not enough days yet to compare: ${esc(waiting)}. Each group needs at least 3 days with data.</p>` : ''}
<p class="foot">These are patterns, not causes. They show what tends to happen together.</p>
<h2>Charts</h2>
${chartsHtml(rows, M, MOODS)}
<h2>Day by day</h2>
<p class="foot">A dash means nothing was recorded that day. The shading behind each row grows with the share of habits you finished.</p>
<table class="days"><colgroup><col class="d"><col class="m"><col class="h"><col class="s"><col class="w"><col class="p"><col class="sp"><col class="f"><col></colgroup>
<thead><tr><th>Date</th><th>Mood</th><th>Habits</th><th>Sleep</th><th>Wasted</th><th>Phone</th><th>Spend</th><th>Food</th><th>Note</th></tr></thead><tbody>${days}</tbody></table>
</body></html>`;
  const w = window.open('', '_blank');
  if (!w) throw new Error('Allow pop-ups for this site to download the PDF.');
  w.document.write(html);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 400);
}