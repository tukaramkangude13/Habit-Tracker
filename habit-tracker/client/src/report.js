import { key, pct } from './lib';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function build(y, mo, habits, days, today) {
  const ks = Array.from({ length: new Date(y, mo + 1, 0).getDate() }, (_, i) => key(new Date(y, mo, i + 1)));
  // cell: null = future day, true = done, false = missed
  const rows = habits.map((h) => ({ h, cells: ks.map((k) => (k > today ? null : !!days[k]?.done?.includes(h._id))) }));
  const daily = ks.map((k) => (k > today ? null : pct(days[k], habits)));
  const title = new Date(y, mo, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const stat = (r) => { const t = r.cells.filter((c) => c !== null).length, d = r.cells.filter(Boolean).length; return { d, p: t ? Math.round((d / t) * 100) : 0 }; };
  return { ks, rows, daily, title, stat };
}

export function downloadCsv(y, mo, habits, days, today) {
  const { ks, rows, daily, title, stat } = build(y, mo, habits, days, today);
  const lines = [
    [`Habit Report - ${title}`],
    ['Habit', ...ks.map((_, i) => i + 1), 'Done', 'Completion'],
    ...rows.map((r) => [r.h.name, ...r.cells.map((c) => (c === null ? '' : c ? '✓' : '✗')), stat(r).d, `${stat(r).p}%`]),
    ['Daily completion', ...daily.map((v) => (v === null ? '' : `${v}%`))],
  ];
  const csv = '\uFEFF' + lines.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `habit-report-${y}-${String(mo + 1).padStart(2, '0')}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Opens a print-ready page; choose "Save as PDF" in the print dialog.
export function printReport(y, mo, habits, days, today) {
  const { ks, rows, daily, title, stat } = build(y, mo, habits, days, today);
  const tracked = daily.filter((v) => v !== null).length;
  const total = rows.reduce((a, r) => a + stat(r).d, 0);
  const overall = tracked && habits.length ? Math.round((total / (tracked * habits.length)) * 100) : 0;
  const mark = (c) => (c === null ? '' : c ? '<b class="y">✓</b>' : '<b class="n">✗</b>');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Habit Report ${esc(title)}</title><style>
@page{size:A4 landscape;margin:10mm}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:system-ui,Segoe UI,sans-serif;color:#18181b;margin:0}
h1{font-size:22px;margin:0}p{margin:4px 0 14px;color:#52525b;font-size:12px}
table{border-collapse:collapse;width:100%;font-size:10px}th,td{border:1px solid #e4e4e7;text-align:center;padding:3px 0}
th{background:#f4f4f5}td.h,th.h{text-align:left;padding:3px 8px;white-space:nowrap;width:1%}
td.s{padding:3px 6px;font-weight:600}.y{color:#059669}.n{color:#dc2626}tfoot td{background:#f4f4f5;font-weight:600}
</style></head><body>
<h1>${esc(title)}</h1>
<p>Overall completion ${overall}% | Perfect days ${daily.filter((v) => v === 100).length} | Days tracked ${tracked}</p>
<table><thead><tr><th class="h">Habit</th>${ks.map((_, i) => `<th>${i + 1}</th>`).join('')}<th class="s">Done</th><th class="s">%</th></tr></thead>
<tbody>${rows.map((r) => `<tr><td class="h">${esc(r.h.name)}</td>${r.cells.map((c) => `<td>${mark(c)}</td>`).join('')}<td class="s">${stat(r).d}</td><td class="s">${stat(r).p}%</td></tr>`).join('')}</tbody>
<tfoot><tr><td class="h">Daily %</td>${daily.map((v) => `<td>${v === null ? '' : v}</td>`).join('')}<td></td><td></td></tr></tfoot></table>
</body></html>`;
  const w = window.open('', '_blank');
  if (!w) throw new Error('Allow pop-ups for this site to download the PDF.');
  w.document.write(html);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 400);
}
