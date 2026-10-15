import { fmt } from './lib';

const MOOD_COLOR = { great: '#10b981', good: '#a3e635', okay: '#fbbf24', low: '#f97316', bad: '#ef4444' };
const cm = (m) => (m >= 60 ? `${+(m / 60).toFixed(1)}h` : `${Math.round(m)}m`);
const MIN_STEPS = [15, 30, 60, 120, 180, 240, 360, 480, 720];
const r1 = (x) => Math.round(x * 10) / 10;

// tick = axis label, val = label above a bar, steps = allowed gridline spacings
const SPEC = {
  rate: { sub: '% of the habits due that day', tick: (v) => `${v}%`, val: (v) => `${Math.round(v)}%`, steps: [25], min: 100 },
  sleep: { sub: 'hours slept', tick: (v) => `${v}h`, val: (v) => `${+v.toFixed(1)}h`, steps: [1, 2, 3, 4], ref: { v: 8, text: '8h goal' } },
  wasted: { sub: 'time wasted per day', tick: cm, val: cm, steps: MIN_STEPS },
  screen: { sub: 'phone screen time per day', tick: cm, val: cm, steps: MIN_STEPS },
  spend: { sub: 'spent per day', tick: (v) => (v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : `${v}`), val: (v) => Math.round(v).toLocaleString(),
    steps: [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000] },
  kcalPct: { sub: 'calories as % of your daily target', tick: (v) => `${v}%`, val: (v) => `${Math.round(v)}%`, steps: [25, 50, 100], ref: { v: 100, text: 'target' } },
};
const IDS = ['rate', 'sleep', 'wasted', 'screen', 'spend', 'kcalPct'];

const scale = (max, steps) => {
  const step = steps.find((s) => max / s <= 5) ?? steps[steps.length - 1];
  return { step, top: Math.max(step, Math.ceil(max / step) * step) };
};

const W = 720, H = 210, L = 42, R = 14, T = 22, B = 50;

function chart(rows, id, M) {
  const sp = SPEC[id], n = rows.length;
  const real = rows.map((r) => r[id]).filter((v) => v != null);
  const { step, top } = scale(Math.max(sp.min ?? 0, sp.ref?.v ?? 0, ...real), sp.steps);
  const pw = W - L - R, ph = H - T - B, slot = pw / n;
  const y = (v) => r1(T + ph - (v / top) * ph);
  const cx = (i) => L + slot * (i + 0.5);
  const bw = Math.min(18, slot * 0.5);
  const base = y(0);
  let s = '';

  for (let v = 0; v <= top + 1e-9; v += step) {
    s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="${v ? '#e4e4e7' : '#a1a1aa'}"/>`;
    s += `<text x="${L - 6}" y="${y(v) + 3}" text-anchor="end" font-size="9" fill="#71717a">${sp.tick(v)}</text>`;
  }

  // Reference line: the goal if there is one, otherwise the average of the days with data.
  const avg = real.length ? real.reduce((a, b) => a + b, 0) / real.length : null;
  const ref = sp.ref ? { v: sp.ref.v, text: sp.ref.text, c: '#059669' } : real.length >= 2 ? { v: avg, text: `avg ${sp.val(avg)}`, c: '#d97706' } : null;
  if (ref) {
    s += `<line x1="${L}" x2="${W - R}" y1="${y(ref.v)}" y2="${y(ref.v)}" stroke="${ref.c}" stroke-dasharray="4 3"/>`;
    s += `<text x="${W - R}" y="${y(ref.v) - 3}" text-anchor="end" font-size="8.5" fill="${ref.c}">${ref.text}</text>`;
  }

  const every = n <= 16 ? 1 : Math.ceil(n / 10);
  rows.forEach((r, i) => {
    const v = r[id], x = cx(i);
    if (v == null) {
      s += `<line x1="${r1(x - bw / 2)}" x2="${r1(x + bw / 2)}" y1="${base}" y2="${base}" stroke="#d4d4d8" stroke-width="3" stroke-linecap="round"/>`;
    } else {
      if (v > 0) {
        const h = Math.max(1.5, base - y(v));
        s += `<rect x="${r1(x - bw / 2)}" y="${r1(base - h)}" width="${r1(bw)}" height="${r1(h)}" rx="2" fill="#6366f1"/>`;
      }
      if (n <= 16) s += `<text x="${r1(x)}" y="${r1(base - Math.max(0, base - y(v)) - 4)}" text-anchor="middle" font-size="9" font-weight="${v > 0 ? 600 : 400}" fill="${v > 0 ? '#3f3f46' : '#a1a1aa'}">${sp.val(v)}</text>`;
    }
    if (i % every === 0) {
      const first = i === 0 || r.d.endsWith('-01');
      s += `<text x="${r1(x)}" y="${base + 12}" text-anchor="middle" font-size="9" fill="#52525b">${fmt(r.d, first ? { month: 'short', day: 'numeric' } : { day: 'numeric' })}</text>`;
      if (n <= 16) s += `<text x="${r1(x)}" y="${base + 22}" text-anchor="middle" font-size="7.5" fill="#a1a1aa">${fmt(r.d, { weekday: 'short' })}</text>`;
    }
    s += `<circle cx="${r1(x)}" cy="${H - 12}" r="${n <= 31 ? 3.5 : 2}" fill="${MOOD_COLOR[r.mood] || '#e4e4e7'}"/>`;
  });
  s += `<text x="${L - 6}" y="${H - 9}" text-anchor="end" font-size="7.5" fill="#71717a">mood</text>`;

  return `<div class="ch"><h3>${M[id].label} <small>${sp.sub}</small></h3><svg viewBox="0 0 ${W} ${H}" width="100%" font-family="system-ui,Segoe UI,sans-serif">${s}</svg></div>`;
}

export function chartsHtml(rows, M, MOODS) {
  const has = (id) => M[id] && rows.some((r) => r[id] != null);
  const shown = IDS.filter(has);
  const empty = IDS.filter((id) => M[id] && !has(id));
  const legend = Object.entries(MOODS).map(([id, [e]]) => `<span><i style="background:${MOOD_COLOR[id]}"></i>${e}</span>`).join('');
  return `<h2>Charts</h2>
<p class="lg">Dots under each chart show your mood that day: ${legend}<span><i style="background:#e4e4e7"></i>not logged</span>. A grey tick on the baseline means no data for that day.</p>
${shown.map((id) => chart(rows, id, M)).join('')}
${empty.length ? `<p>No data in this period for: ${empty.map((id) => M[id].label).join(', ')}.</p>` : ''}`;
}

export const CHART_CSS = `.ch{margin:0 0 6px;page-break-inside:avoid}h3{font-size:11px;margin:8px 0 0}h3 small{font-weight:400;color:#71717a}
.lg span{margin-left:8px;white-space:nowrap}.lg i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:3px}svg{display:block}`;