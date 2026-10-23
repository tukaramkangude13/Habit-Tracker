import { addDays, fmt, key, parse } from './lib';
import { actualRate, advice, plan } from './nutrition';
import { MEALS } from './nutritionStats';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const q = (c) => `"${String(c ?? '').replace(/"/g, '""')}"`;
const n0 = (v) => Math.round(v).toLocaleString();
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const FOLLOW = 0.9; // a day "follows the plan" at 90% or more of both the calorie and the protein target
const mealOf = (f) => (MEALS.includes(f.meal) ? f.meal : 'Snack');
const item = (it) => `${it.name}${it.qty !== 1 ? ` x${+it.qty.toFixed(1)}` : ''}`;

// Everything the screen, the PDF and the CSV need. Days before your first food entry are not counted.
export function buildNutritionReport({ foods, profile, weights, today, from, to }) {
  const first = foods.reduce((m, f) => (f.date < m ? f.date : m), '9999-99-99');
  const a = first > from ? first : from, z = to > today ? today : to;
  const list = a <= z ? foods.filter((f) => f.date >= a && f.date <= z) : [];

  const byDay = {}, foodMap = {}, mealKcal = Object.fromEntries(MEALS.map((m) => [m, 0]));
  list.forEach((f) => {
    const m = mealOf(f);
    const d = (byDay[f.date] ||= { d: f.date, kcal: 0, protein: 0, carbs: 0, fat: 0, meals: Object.fromEntries(MEALS.map((x) => [x, { kcal: 0, items: new Map() }])) });
    d.kcal += f.kcal; d.protein += f.protein || 0; d.carbs += f.carbs || 0; d.fat += f.fat || 0;
    const ml = d.meals[m]; ml.kcal += f.kcal;
    const it = ml.items.get(f.name) || { name: f.name, qty: 0 };
    it.qty += f.qty || 1; ml.items.set(f.name, it);
    const o = (foodMap[f.name] ||= { name: f.name, times: 0, kcal: 0, protein: 0 });
    o.times++; o.kcal += f.kcal; o.protein += f.protein || 0; mealKcal[m] += f.kcal;
  });
  const logged = Object.values(byDay).sort((x, y) => x.d.localeCompare(y.d));
  const cal = [];
  for (let d = parse(a); key(d) <= z; d = addDays(d, 1)) cal.push(byDay[key(d)] || { d: key(d), kcal: 0, protein: 0, none: true });

  let target = null;
  if (profile) {
    const cur = weights.length ? weights[weights.length - 1].kg : profile.weight;
    const P = plan({ ...profile, weight: cur }, today);
    target = { kcal: P.gain <= 0 ? P.tdee : P.kcal, protein: P.protein, carbs: P.carbs, fat: P.fat, P, goalKg: profile.target, cur };
  }
  const n = logged.length, totalK = logged.reduce((s, d) => s + d.kcal, 0), totalP = logged.reduce((s, d) => s + d.protein, 0);
  const avgK = n ? totalK / n : null, avgP = n ? totalP / n : null;
  const onPlan = target ? logged.filter((d) => d.kcal >= FOLLOW * target.kcal && d.protein >= FOLLOW * target.protein).length : null;
  const wr = weights.filter((w) => w.date >= a && w.date <= z);
  const foodsAgg = Object.values(foodMap);
  const rate = actualRate(weights);

  const stands = [];
  if (n) {
    stands.push(`You logged food on ${n} of ${cal.length} days.`);
    if (target) {
      const pk = Math.round((avgK / target.kcal) * 100), pp = Math.round((avgP / target.protein) * 100);
      stands.push(`Calories averaged ${n0(avgK)} a day, ${pk}% of your ${n0(target.kcal)} target.`);
      if (pk < 90) stands.push(`You are about ${n0(target.kcal - avgK)} kcal short each day. A snack such as peanuts, a banana shake or peanut butter on roti would close most of it.`);
      stands.push(`Protein averaged ${Math.round(avgP)} g a day, ${pp}% of your ${target.protein} g target.${pp < 90 ? ' Paneer, eggs, dal, soya or whey can close the gap.' : ''}`);
      const best = [...logged].sort((x, y) => y.kcal - x.kcal)[0], low = [...logged].sort((x, y) => x.kcal - y.kcal)[0];
      if (n > 2) stands.push(`Your best day was ${fmt(best.d)} (${n0(best.kcal)} kcal) and your lowest was ${fmt(low.d)} (${n0(low.kcal)} kcal).`);
    }
    const top = [...foodsAgg].sort((x, y) => y.times - x.times)[0], pro = [...foodsAgg].sort((x, y) => y.protein - x.protein)[0];
    stands.push(`You ate ${top.name} most often (${top.times} times).`);
    if (pro.protein > 0) stands.push(`Your biggest protein source was ${pro.name}, ${Math.round((pro.protein / totalP) * 100)}% of all your protein.`);
    const mk = Object.entries(mealKcal).sort((x, y) => y[1] - x[1]);
    if (totalK > 0 && mk[0][1] !== mk[3][1]) stands.push(`Most of your calories come from ${mk[0][0].toLowerCase()} (${Math.round((mk[0][1] / totalK) * 100)}%). ${mk[3][0]} gives only ${Math.round((mk[3][1] / totalK) * 100)}%.`);
  }
  if (wr.length >= 2) stands.push(`Weight went from ${wr[0].kg} kg to ${wr[wr.length - 1].kg} kg (${(wr[wr.length - 1].kg - wr[0].kg) >= 0 ? '+' : ''}${(wr[wr.length - 1].kg - wr[0].kg).toFixed(1)} kg).`);
  if (target && target.P.gain > 0 && weights.length) stands.push(advice(target.P.rate, rate));

  return { from: a, to: z, cal, logged, target, n, avgK, avgP, onPlan, wr, rate, foodsAgg, mealKcal, totalK, stands, weights, list };
}

// ---------- Excel (CSV): every food entry, then daily totals, then top foods ----------
export function downloadNutritionCsv(rep) {
  if (!rep.n) throw new Error('No food logged in this range.');
  const t = rep.target;
  const L = [
    [`Nutrition report ${rep.from} to ${rep.to}`],
    ['Date', 'Weekday', 'Meal', 'Food', 'Servings', 'Calories', 'Protein (g)', 'Carbs (g)', 'Fat (g)'],
    ...[...rep.list].sort((x, y) => x.date.localeCompare(y.date) || MEALS.indexOf(mealOf(x)) - MEALS.indexOf(mealOf(y)))
      .map((f) => [f.date, fmt(f.date, { weekday: 'short' }), mealOf(f), f.name, f.qty || 1, f.kcal, f.protein || 0, f.carbs || 0, f.fat || 0]),
    [], ['Daily totals'], ['Date', 'Calories', 'Protein (g)', 'Carbs (g)', 'Fat (g)', 'Calories % of target', 'Protein % of target', 'Followed plan'],
    ...rep.logged.map((d) => [d.d, Math.round(d.kcal), Math.round(d.protein), Math.round(d.carbs), Math.round(d.fat),
      t ? Math.round((d.kcal / t.kcal) * 100) : '', t ? Math.round((d.protein / t.protein) * 100) : '', t ? (d.kcal >= FOLLOW * t.kcal && d.protein >= FOLLOW * t.protein ? 'yes' : 'no') : '']),
    [], ['Most eaten foods'], ['Food', 'Times', 'Calories', 'Protein (g)'],
    ...[...rep.foodsAgg].sort((x, y) => y.times - x.times).map((f) => [f.name, f.times, Math.round(f.kcal), Math.round(f.protein)]),
  ];
  const el = document.createElement('a');
  el.href = URL.createObjectURL(new Blob(['\uFEFF' + L.map((r) => r.map(q).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  el.download = `nutrition-report-${rep.from}_to_${rep.to}.csv`;
  el.click();
  setTimeout(() => URL.revokeObjectURL(el.href), 1000);
}

// Small bar chart as SVG. Bars are green when the day reached 90% of the target.
function barsSvg(days, k, target, color) {
  const W = 700, H = 150, L = 42, R = 8, T = 14, B = 22, iw = W - L - R, ih = H - T - B, n = days.length;
  const max = Math.max(target || 0, ...days.map((d) => d[k] || 0), 1) * 1.12, y = (v) => T + ih - (v / max) * ih, bw = Math.max(2, (iw / n) * 0.72);
  let s = '';
  [0, 0.5, 1].forEach((f) => { const v = (max / 1.12) * f; s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#e4e4e7"/><text x="${L - 5}" y="${y(v) + 3}" text-anchor="end" font-size="9" fill="#71717a">${n0(v)}</text>`; });
  days.forEach((d, i) => {
    const x = L + ((i + 0.5) * iw) / n;
    s += d.none ? `<line x1="${x - bw / 2}" x2="${x + bw / 2}" y1="${T + ih}" y2="${T + ih}" stroke="#d4d4d8" stroke-width="2"/>`
      : `<rect x="${x - bw / 2}" y="${y(d[k])}" width="${bw}" height="${T + ih - y(d[k])}" rx="1.5" fill="${target && d[k] >= FOLLOW * target ? '#16a34a' : color}"/>`;
    if (i % Math.max(1, Math.ceil(n / 10)) === 0) s += `<text x="${x}" y="${H - 6}" text-anchor="middle" font-size="9" fill="#71717a">${esc(fmt(d.d, { month: 'short', day: 'numeric' }))}</text>`;
  });
  if (target) s += `<line x1="${L}" x2="${W - R}" y1="${y(target)}" y2="${y(target)}" stroke="#f59e0b" stroke-dasharray="5 3"/><text x="${W - R}" y="${y(target) - 3}" text-anchor="end" font-size="9" fill="#b45309">target ${n0(target)}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Arial,sans-serif">${s}</svg>`;
}

function weightSvg(wr, goal) {
  const W = 700, H = 130, L = 42, R = 8, T = 12, B = 20, iw = W - L - R, ih = H - T - B;
  const lo = Math.min(...wr.map((w) => w.kg), goal ?? Infinity) - 1, hi = Math.max(...wr.map((w) => w.kg), goal ?? -Infinity) + 1;
  const t0 = parse(wr[0].date), span = parse(wr[wr.length - 1].date) - t0 || 1;
  const x = (d) => L + ((parse(d) - t0) / span) * iw, y = (v) => T + ih - ((v - lo) / (hi - lo)) * ih;
  let s = [lo, (lo + hi) / 2, hi].map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#e4e4e7"/><text x="${L - 5}" y="${y(v) + 3}" text-anchor="end" font-size="9" fill="#71717a">${v.toFixed(1)}</text>`).join('');
  if (goal) s += `<line x1="${L}" x2="${W - R}" y1="${y(goal)}" y2="${y(goal)}" stroke="#16a34a" stroke-dasharray="5 3"/><text x="${W - R}" y="${y(goal) - 3}" text-anchor="end" font-size="9" fill="#166534">goal ${goal} kg</text>`;
  s += `<polyline points="${wr.map((w) => `${x(w.date)},${y(w.kg)}`).join(' ')}" fill="none" stroke="#4f46e5" stroke-width="2.5"/>` + wr.map((w) => `<circle cx="${x(w.date)}" cy="${y(w.kg)}" r="3" fill="#4f46e5"/>`).join('');
  s += `<text x="${L}" y="${H - 4}" font-size="9" fill="#71717a">${esc(fmt(wr[0].date, { month: 'short', day: 'numeric' }))}</text><text x="${W - R}" y="${H - 4}" text-anchor="end" font-size="9" fill="#71717a">${esc(fmt(wr[wr.length - 1].date, { month: 'short', day: 'numeric' }))}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Arial,sans-serif">${s}</svg>`;
}

// ---------- PDF: opens a print page, choose "Save as PDF" ----------
export function printNutritionReport(rep) {
  if (!rep.n) throw new Error('No food logged in this range.');
  const t = rep.target, last = rep.wr[rep.wr.length - 1];
  const kpi = (l, v, s) => `<div class="kpi"><small>${esc(l)}</small><b>${esc(v)}</b><span>${esc(s)}</span></div>`;
  const kpis = [
    kpi('Days logged', `${rep.n} of ${rep.cal.length}`, 'days with food entries'),
    kpi('Average calories', n0(rep.avgK), t ? `${Math.round((rep.avgK / t.kcal) * 100)}% of ${n0(t.kcal)} target` : 'a day'),
    kpi('Average protein', `${Math.round(rep.avgP)} g`, t ? `${Math.round((rep.avgP / t.protein) * 100)}% of ${t.protein} g target` : 'a day'),
    kpi('Days on plan', rep.onPlan === null ? '-' : `${rep.onPlan} of ${rep.n}`, 'calories and protein both at 90%+'),
    kpi('Latest weight', last ? `${last.kg} kg` : '-', rep.wr.length > 1 ? `${(last.kg - rep.wr[0].kg) >= 0 ? '+' : ''}${(last.kg - rep.wr[0].kg).toFixed(1)} kg in this period` : t ? `goal ${t.goalKg} kg` : ''),
    kpi('Weight pace', rep.rate === null ? '-' : `${rep.rate >= 0 ? '+' : ''}${rep.rate.toFixed(2)} kg/wk`, t && t.P.gain > 0 ? `plan ${t.P.rate.toFixed(2)} kg/wk` : 'needs 10+ days of weigh-ins'),
  ].join('');

  const meals = MEALS.map((m) => {
    const k = rep.mealKcal[m], share = rep.totalK ? Math.round((k / rep.totalK) * 100) : 0;
    return `<tr><td class="l">${m}</td><td>${n0(k)}</td><td>${n0(k / rep.n)}</td><td class="l nw"><span class="bar"><i style="width:${share}%"></i></span> ${share}%</td></tr>`;
  }).join('');
  const topRows = (arr, f) => arr.map((x) => `<tr><td class="l">${esc(x.name)}</td>${f(x)}</tr>`).join('');
  const most = topRows([...rep.foodsAgg].sort((x, y) => y.times - x.times).slice(0, 10), (x) => `<td>${x.times}</td><td>${n0(x.kcal)}</td><td>${Math.round(x.protein)} g</td>`);
  const pro = topRows([...rep.foodsAgg].sort((x, y) => y.protein - x.protein).filter((x) => x.protein > 0).slice(0, 8), (x) => `<td>${Math.round(x.protein)} g</td><td>${n0(x.kcal)}</td>`);

  const cell = (ml) => (ml.items.size
    ? `<b>${n0(ml.kcal)} kcal</b>${[...ml.items.values()].map((it) => `<div>${esc(item(it))}</div>`).join('')}` : '<span class="none">-</span>');
  const diary = rep.logged.map((d) => {
    const pk = t ? Math.round((d.kcal / t.kcal) * 100) : null;
    return `<tr><td class="l nw"><b>${esc(fmt(d.d, { weekday: 'short' }))} ${esc(fmt(d.d, { month: 'short', day: 'numeric' }))}</b><br>${n0(d.kcal)} kcal${pk === null ? '' : ` (${pk}%)`}<br>${Math.round(d.protein)} g protein</td>${MEALS.map((m) => `<td class="l meal">${cell(d.meals[m])}</td>`).join('')}</tr>`;
  }).join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Nutrition report ${esc(rep.from)} to ${esc(rep.to)}</title><style>
@page{size:A4;margin:11mm}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:system-ui,Segoe UI,sans-serif;color:#18181b;margin:0;font-size:11px;line-height:1.45}
h1{font-size:22px;margin:0 0 2px}h2{font-size:14px;margin:22px 0 8px;padding-bottom:4px;border-bottom:2px solid #4f46e5}h3{font-size:12px;margin:12px 0 4px}
p{margin:3px 0 8px;color:#52525b}.sub{font-size:12px}ul{margin:6px 0;padding-left:18px}li{margin:2px 0}
.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0}.kpi{border:1px solid #e4e4e7;border-radius:8px;padding:8px 10px}
.kpi small{display:block;color:#71717a}.kpi b{display:block;font-size:17px;margin:1px 0}.kpi span{color:#a1a1aa;font-size:10px}
.stand{background:#eef2ff;border-left:4px solid #4f46e5;border-radius:6px;padding:6px 12px}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #e4e4e7;padding:3px 7px;text-align:center}th{background:#f4f4f5}td.l{text-align:left}td.nw{white-space:nowrap}
.two{display:grid;grid-template-columns:1fr 1fr;gap:14px}table.diary{table-layout:fixed}table.diary col.d{width:92px}td.meal{vertical-align:top;font-size:9.5px}td.meal div{color:#3f3f46}td.meal b{display:block;color:#4f46e5}
.none{color:#a1a1aa}thead{display:table-header-group}tr{page-break-inside:avoid}.chart{page-break-inside:avoid;margin:6px 0 10px}
.bar{display:inline-block;width:60px;height:6px;background:#e4e4e7;border-radius:3px;vertical-align:middle}.bar i{display:block;height:6px;background:#4f46e5;border-radius:3px}
.foot{font-size:10px;color:#71717a}</style></head><body>
<h1>Nutrition report</h1>
<p class="sub">${esc(fmt(rep.from, { month: 'short', day: 'numeric', year: 'numeric' }))} to ${esc(fmt(rep.to, { month: 'short', day: 'numeric', year: 'numeric' }))}${t ? ` | Goal ${t.cur} kg to ${t.goalKg} kg | Plan ${n0(t.kcal)} kcal and ${t.protein} g protein a day` : ''}</p>
<h2>At a glance</h2><div class="kpis">${kpis}</div>
<h2>What stands out</h2><div class="stand"><ul>${rep.stands.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>
<h2>Daily intake</h2>
<div class="chart"><h3>Calories ${t ? '(green = reached 90% of target)' : ''}</h3>${barsSvg(rep.cal, 'kcal', t?.kcal, '#4f46e5')}</div>
<div class="chart"><h3>Protein, grams</h3>${barsSvg(rep.cal, 'protein', t?.protein, '#7c3aed')}</div>
${rep.wr.length >= 2 ? `<div class="chart"><h3>Weight, kg</h3>${weightSvg(rep.wr, t?.goalKg)}</div>` : ''}
<h2>Where your calories come from</h2>
<table><thead><tr><th>Meal</th><th>Total kcal</th><th>Average a day</th><th>Share</th></tr></thead><tbody>${meals}</tbody></table>
<h2>What you eat most</h2>
<div class="two"><div><h3>Most eaten</h3><table><thead><tr><th>Food</th><th>Times</th><th>kcal</th><th>Protein</th></tr></thead><tbody>${most}</tbody></table></div>
<div><h3>Biggest protein sources</h3><table><thead><tr><th>Food</th><th>Protein</th><th>kcal</th></tr></thead><tbody>${pro}</tbody></table></div></div>
<h2>Food diary, day by day</h2>
<p class="foot">Days with no food logged are skipped. Servings show as x2, x3 and so on.</p>
<table class="diary"><colgroup><col class="d"><col><col><col><col></colgroup><thead><tr><th>Day</th>${MEALS.map((m) => `<th>${m}</th>`).join('')}</tr></thead><tbody>${diary}</tbody></table>
<p class="foot">Calorie and protein values for quick-add foods are approximate. Targets come from your Nutrition plan and update as your weight changes.</p>
</body></html>`;
  const w = window.open('', '_blank');
  if (!w) throw new Error('Allow pop-ups for this site to download the PDF.');
  w.document.write(html);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 400);
}
