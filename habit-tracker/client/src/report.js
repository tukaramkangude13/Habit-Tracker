import { habitAppliesOn, key } from './lib';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hm = (m) => { m = Math.round(m); const h = Math.floor(m / 60); return h ? `${h}h ${m % 60}m` : `${m}m`; };

// time = { logs: [...timelogs], limit: daily limit in minutes }
function build(y, mo, habits, days, today, time = { logs: [], limit: 60 }) {
  const ks = Array.from({ length: new Date(y, mo + 1, 0).getDate() }, (_, i) => key(new Date(y, mo, i + 1)));
  const rows = habits.map((h) => ({ h, cells: ks.map((k) => (k > today || !habitAppliesOn(h, k) ? null : !!days[k]?.done?.includes(h._id))) }));
  const daily = ks.map((k) => {
    if (k > today || !days[k]) return null;
    const due = habits.filter((h) => h.frequency !== 'weekly' && h.frequency !== 'once' && habitAppliesOn(h, k));
    return due.length ? Math.round(due.filter((h) => days[k].done?.includes(h._id)).length / due.length * 100) : null;
  });
  const title = new Date(y, mo, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const stat = (r) => { const t = r.cells.filter((c) => c !== null).length, d = r.cells.filter(Boolean).length; return { d, p: t ? Math.round((d / t) * 100) : 0 }; };

  // Time wasted: minutes per day, month total, average since the first entry, and totals per category.
  const byDate = {}, byCat = {}, prefix = `${y}-${String(mo + 1).padStart(2, '0')}`;
  time.logs.forEach((l) => {
    byDate[l.date] = (byDate[l.date] || 0) + l.minutes;
    if (l.date.startsWith(prefix)) byCat[l.category] = (byCat[l.category] || 0) + l.minutes;
  });
  const mins = ks.map((k) => (k > today ? null : byDate[k] || 0));
  const first = time.logs.reduce((m, l) => (l.date < m ? l.date : m), '9999');
  const counted = ks.filter((k) => k <= today && k >= first).length;
  const total = mins.reduce((a, v) => a + (v || 0), 0);
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  return { ks, rows, daily, title, stat, mins, total, avg: counted ? total / counted : 0, cats, limit: time.limit };
}

export function downloadCsv(y, mo, habits, days, today, time) {
  const { ks, rows, daily, title, stat, mins, total, avg, cats } = build(y, mo, habits, days, today, time);
  const lines = [
    [`Habit Report - ${title}`],
    ['Habit', ...ks.map((_, i) => i + 1), 'Done', 'Completion'],
    ...rows.map((r) => [r.h.name, ...r.cells.map((c) => (c === null ? '' : c ? '✓' : '✗')), stat(r).d, `${stat(r).p}%`]),
    ['Daily completion', ...daily.map((v) => (v === null ? '' : `${v}%`))],
    ['Time wasted (min)', ...mins.map((v) => (v === null ? '' : v)), total, ''],
    [],
    ['Time wasted summary'], ['Total', hm(total)], ['Daily average', hm(avg)],
    ...cats.map(([c, v]) => [c, hm(v), total ? `${Math.round((v / total) * 100)}%` : '']),
  ];
  const csv = '\uFEFF' + lines.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `habit-report-${y}-${String(mo + 1).padStart(2, '0')}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Opens a print-ready page; choose "Save as PDF" in the print dialog.
export function printReport(y, mo, habits, days, today, time) {
  const { ks, rows, daily, title, stat, mins, total, avg, cats, limit } = build(y, mo, habits, days, today, time);
  const tracked = daily.filter((v) => v !== null).length;
  const done = rows.reduce((a, r) => a + stat(r).d, 0);
  const scheduled = rows.reduce((sum, row) => sum + row.cells.filter((cell) => cell !== null).length, 0);
  const overall = scheduled ? Math.round((done / scheduled) * 100) : 0;
  const mark = (c) => (c === null ? '' : c ? '<b class="y">✓</b>' : '<b class="n">✗</b>');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Habit Report ${esc(title)}</title><style>
@page{size:A4 landscape;margin:10mm}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:system-ui,Segoe UI,sans-serif;color:#18181b;margin:0}
h1{font-size:22px;margin:0}h2{font-size:14px;margin:18px 0 6px}p{margin:4px 0 14px;color:#52525b;font-size:12px}
table{border-collapse:collapse;width:100%;font-size:10px}th,td{border:1px solid #e4e4e7;text-align:center;padding:3px 0}
th{background:#f4f4f5}td.h,th.h{text-align:left;padding:3px 8px;white-space:nowrap;width:1%}
td.s{padding:3px 6px;font-weight:600}.y{color:#059669}.n{color:#dc2626}tfoot td{background:#f4f4f5;font-weight:600}
table.c{width:auto;min-width:320px}table.c td{text-align:left;padding:3px 10px}
</style></head><body>
<h1>${esc(title)}</h1>
<p>Overall completion ${overall}% | Perfect days ${daily.filter((v) => v === 100).length} | Days tracked ${tracked} | Time wasted ${hm(total)} (average ${hm(avg)} a day${cats.length ? `, biggest: ${esc(cats[0][0])}` : ''})</p>
<table><thead><tr><th class="h">Habit</th>${ks.map((_, i) => `<th>${i + 1}</th>`).join('')}<th class="s">Done</th><th class="s">%</th></tr></thead>
<tbody>${rows.map((r) => `<tr><td class="h">${esc(r.h.name)}</td>${r.cells.map((c) => `<td>${mark(c)}</td>`).join('')}<td class="s">${stat(r).d}</td><td class="s">${stat(r).p}%</td></tr>`).join('')}</tbody>
<tfoot><tr><td class="h">Daily %</td>${daily.map((v) => `<td>${v === null ? '' : v}</td>`).join('')}<td></td><td></td></tr>
<tr><td class="h">Time wasted (min)</td>${mins.map((v) => `<td class="${v > limit ? 'n' : ''}">${v === null ? '' : v || '-'}</td>`).join('')}<td class="s" colspan="2">${hm(total)}</td></tr></tfoot></table>
${cats.length ? `<h2>Time wasted by category</h2><table class="c">${cats.map(([c, v]) => `<tr><td>${esc(c)}</td><td>${hm(v)}</td><td>${total ? Math.round((v / total) * 100) : 0}%</td></tr>`).join('')}</table>` : ''}
</body></html>`;
  const w = window.open('', '_blank');
  if (!w) throw new Error('Allow pop-ups for this site to download the PDF.');
  w.document.write(html);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 400);
}
