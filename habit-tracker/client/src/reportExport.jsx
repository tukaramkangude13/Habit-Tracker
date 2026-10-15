import { fmt } from './lib';
import { chartsHtml, CHART_CSS } from './pdfCharts';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const q = (c) => `"${String(c ?? '').replace(/"/g, '""')}"`;
const range = (rows) => [rows[0].d, rows[rows.length - 1].d];

// ---------- Excel (CSV): one row per day with raw numbers, then the patterns ----------
export function downloadReportCsv({ rows, analysis, M, label }) {
  if (!rows.length) throw new Error('Nothing to export yet.');
  const [a, z] = range(rows);
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
export function printReport({ rows, analysis, M, MOODS, label }) {
  if (!rows.length) throw new Error('Nothing to export yet.');
  const [a, z] = range(rows);
  const tracked = rows.filter((r) => r.rate !== null);
  const avg = tracked.length ? Math.round(tracked.reduce((s, r) => s + r.rate, 0) / tracked.length) : null;
  const f = (id, x) => (x === null || x === undefined ? '-' : esc(M[id].fmt(x)));
  const charts = chartsHtml(rows, M, MOODS);

  const patterns = analysis.map((s) => `<h2>${esc(s.title)}</h2>
<table class="c"><thead><tr><th></th>${s.cols.map((c) => `<th>${esc(c.label)}<br><small>${c.n} days</small></th>`).join('')}</tr></thead>
<tbody>${s.metrics.map((id) => `<tr><td class="l">${esc(M[id].label)}</td>${s.cols.map((c) => `<td>${f(id, c.avg[id])}</td>`).join('')}</tr>`).join('')}</tbody></table>
${s.notes.length ? `<ul>${s.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : '<p>No clear difference yet, or not enough days (a column needs 3 days with data).</p>'}`).join('');

  const days = rows.map((r) => `<tr style="background:rgba(79,70,229,${((r.rate || 0) / 100) * 0.18})">
<td class="l">${esc(fmt(r.d, { weekday: 'short', month: 'short', day: 'numeric' }))}</td><td>${MOODS[r.mood]?.[0] || '-'}</td>
<td class="l"><span class="bar"><i style="width:${r.rate ?? 0}%"></i></span> ${r.due ? `${r.done}/${r.due}` : '-'}</td>
<td>${f('sleep', r.sleep)}</td><td>${f('wasted', r.wasted)}</td><td>${f('screen', r.screen)}</td><td>${f('spend', r.spend)}</td>
<td>${r.followed == null ? '-' : `${r.followed ? 'Yes' : 'No'} (${f('kcalPct', r.kcalPct)})`}</td>
<td class="l note">${esc(r.note.slice(0, 120))}</td></tr>`).join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Daily report ${esc(label)}</title><style>
@page{size:A4;margin:10mm}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:system-ui,Segoe UI,sans-serif;color:#18181b;margin:0;font-size:11px}
h1{font-size:20px;margin:0}h2{font-size:13px;margin:16px 0 6px}p{margin:4px 0 10px;color:#52525b}ul{margin:6px 0;padding-left:18px}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #e4e4e7;padding:3px 6px;text-align:center}th{background:#f4f4f5}
td.l{text-align:left}table.c{width:auto;min-width:360px}td.note{font-size:10px;color:#52525b}
.bar{display:inline-block;width:46px;height:6px;background:#e4e4e7;border-radius:3px;vertical-align:middle}.bar i{display:block;height:6px;background:#4f46e5;border-radius:3px}
${CHART_CSS}
tr{page-break-inside:avoid}</style></head><body>
<h1>Daily report: ${esc(label)}</h1>
<p>${esc(a)} to ${esc(z)} | Days ${rows.length} | Average habits done ${avg === null ? '-' : avg + '%'} | Days with mood ${rows.filter((r) => r.mood).length}</p>
${charts}
${patterns}
<p>These are patterns, not causes. They show what tends to happen together.</p>
<h2>Daily table</h2>
<table><thead><tr><th>Date</th><th>Mood</th><th>Habits</th><th>Sleep</th><th>Wasted</th><th>Phone</th><th>Spend</th><th>Food</th><th>Note</th></tr></thead><tbody>${days}</tbody></table>
</body></html>`;
  const w = window.open('', '_blank');
  if (!w) throw new Error('Allow pop-ups for this site to download the PDF.');
  w.document.write(html);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 400);
}