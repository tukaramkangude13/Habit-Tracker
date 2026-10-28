import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertCircle, ArrowDownRight, ArrowUpRight, CalendarClock, Check, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { api } from '../api';
import { addDays, key, parse } from '../lib';
import { Card, btn } from './ui';

const TIMEFRAMES = ['15m', '1h', '2h', '1d', '1w'];
const EMA_PERIODS = [20, 50, 100, 200];
const RANGES = [
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 180, label: '180 days' },
  { value: 365, label: '1 year' },
  { value: 'ALL', label: 'All history' },
];
const EMA_COLORS = { 20: '#2563eb', 50: '#d97706', 100: '#9333ea', 200: '#059669' };
const number = (value, places = 1) => Number.isFinite(Number(value)) ? Number(value).toFixed(places) : '—';
const signed = (value) => `${value > 0 ? '+' : ''}${number(value)} pts`;
const dateLabel = (value, timeframe) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Unknown date';
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    month: 'short', day: 'numeric', year: 'numeric',
    ...(timeframe && ['15m', '1h', '2h'].includes(timeframe) ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
};
const makeQuery = (range) => range.from ? `?from=${range.from}&to=${range.to}` : '';

function Metric({ title, value, detail, icon: Icon = Activity, tone = 'indigo' }) {
  const colors = {
    indigo: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300',
    green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
    zinc: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
  };
  return <div className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
    <div className="flex items-center gap-2"><span className={`grid h-8 w-8 place-items-center rounded-lg ${colors[tone]}`}><Icon size={16} /></span><p className="truncate text-xs text-zinc-500">{title}</p></div>
    <p className="mt-3 truncate text-2xl font-semibold tabular-nums">{value}</p>
    <p className="mt-1 min-h-4 text-xs text-zinc-500">{detail}</p>
  </div>;
}

export default function LifeIndex({ today: todayProp, active = true }) {
  const today = todayProp || key();
  const [current, setCurrent] = useState(null);
  const [history, setHistory] = useState([]);
  const [candles, setCandles] = useState([]);
  const [emaSeries, setEmaSeries] = useState({});
  const [timeframe, setTimeframe] = useState('1d');
  const [rangeDays, setRangeDays] = useState(90);
  const [rangeOffset, setRangeOffset] = useState(0);
  const [emaVisible, setEmaVisible] = useState({ 20: true, 50: true, 100: true, 200: true });
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [error, setError] = useState('');

  const range = useMemo(() => {
    if (rangeDays === 'ALL') return { from: null, to: null, label: 'All saved history' };
    const to = key(addDays(parse(today), -rangeOffset));
    const from = key(addDays(parse(to), -(Number(rangeDays) - 1)));
    return { from, to, label: `${from} to ${to}` };
  }, [today, rangeDays, rangeOffset]);
  const query = useMemo(() => makeQuery(range), [range]);

  useEffect(() => {
    if (!active) return undefined;
    let live = true;
    setLoading(true);
    setError('');
    setSelected(null);
    Promise.all([
      api.get('/life-index/current'),
      api.get(`/life-index/history${query}`),
      api.get(`/life-index/candles?timeframe=${timeframe}${query ? `&${query.slice(1)}` : ''}`),
    ]).then(([summary, rows, candleData]) => {
      if (!live) return;
      setCurrent(summary);
      setHistory(rows);
      setCandles(candleData.candles || []);
    }).catch((cause) => {
      if (live) setError(cause.message || 'Could not load Life Index data.');
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [active, query, timeframe]);

  useEffect(() => {
    if (!active) return undefined;
    let live = true;
    Promise.allSettled(EMA_PERIODS.map((period) => api.get(`/life-index/ema?timeframe=${timeframe}&period=${period}${query ? `&${query.slice(1)}` : ''}`)))
      .then((results) => {
        if (!live) return;
        const values = {};
        results.forEach((result, index) => {
          values[EMA_PERIODS[index]] = result.status === 'fulfilled' ? result.value.points.map((point) => point.value) : [];
        });
        setEmaSeries(values);
      });
    return () => { live = false; };
  }, [active, query, timeframe]);

  const selectedRangeChange = useMemo(() => {
    if (history.length < 2) return null;
    const first = history[0].indexValue, last = history[history.length - 1].indexValue;
    return { points: last - first, percent: first ? (last - first) / first * 100 : null };
  }, [history]);

  const categoryChanges = useMemo(() => {
    if (history.length < 2) return [];
    const last = new Map((history[history.length - 1].categoryScores || []).map((item) => [item.id, item]));
    return [...last.values()].map((item) => {
      const observations = history.map((row) => (row.categoryScores || []).find((category) => category.id === item.id)).filter((category) => category?.eligible && Number.isFinite(category.score));
      const first = observations[0]?.score ?? null;
      const latest = observations.at(-1)?.score ?? null;
      return {
        ...item,
        average: observations.length ? observations.reduce((sum, category) => sum + category.score, 0) / observations.length : null,
        observedDays: observations.length,
        from: first,
        to: latest,
        delta: first == null || latest == null ? null : latest - first,
      };
    });
  }, [history]);

  const series = EMA_PERIODS.filter((period) => emaVisible[period]).map((period) => ({
    name: `EMA ${period}`,
    color: EMA_COLORS[period],
    values: emaSeries[period] || [],
  }));

  const chart = useMemo(() => {
    if (!candles.length) return null;
    const values = candles.flatMap((candle) => [Number(candle.high), Number(candle.low)]);
    series.forEach((line) => line.values.forEach((value) => { if (Number.isFinite(value)) values.push(value); }));
    const low = Math.min(...values), high = Math.max(...values);
    const padding = Math.max((high - low) * 0.08, 0.5);
    const min = low - padding, max = high + padding;
    const width = 1200, height = 390, pad = { left: 62, right: 20, top: 18, bottom: 34 };
    const innerW = width - pad.left - pad.right, innerH = height - pad.top - pad.bottom;
    const x = (index) => pad.left + ((index + 0.5) * innerW) / candles.length;
    const y = (value) => pad.top + ((max - value) / (max - min || 1)) * innerH;
    return { width, height, pad, min, max, x, y, innerW, innerH };
  }, [candles, emaSeries, emaVisible]);

  const refresh = async () => {
    setRecalculating(true);
    setError('');
    try {
      await api.post('/life-index/recalculate', {});
      const [summary, rows, candleData] = await Promise.all([
        api.get('/life-index/current'),
        api.get(`/life-index/history${query}`),
        api.get(`/life-index/candles?timeframe=${timeframe}${query ? `&${query.slice(1)}` : ''}`),
      ]);
      setCurrent(summary); setHistory(rows); setCandles(candleData.candles || []);
      const indicators = await Promise.all(EMA_PERIODS.map((period) => api.get(`/life-index/ema?timeframe=${timeframe}&period=${period}${query ? `&${query.slice(1)}` : ''}`)));
      setEmaSeries(Object.fromEntries(indicators.map((item, index) => [EMA_PERIODS[index], item.points.map((point) => point.value)])));
    } catch (cause) {
      setError(cause.message || 'Could not recalculate Life Index.');
    } finally { setRecalculating(false); }
  };

  const selectedCandle = selected || candles[candles.length - 1] || null;
  const currentValue = Number(current?.indexValue ?? 100);
  const lastUpdated = current?.updatedAt ? dateLabel(current.updatedAt, '15m') : 'No saved activity yet';
  const rangeDelta = selectedRangeChange;
  const trendIcon = !rangeDelta || rangeDelta.points === 0 ? Activity : rangeDelta.points > 0 ? ArrowUpRight : ArrowDownRight;
  const trendTone = !rangeDelta || rangeDelta.points === 0 ? 'zinc' : rangeDelta.points > 0 ? 'green' : 'amber';
  const indexStatus = current?.status === 'no-data'
    ? 'No data yet'
    : current?.carriedForward
      ? `Carried forward · ${current.eligibleCategoryCount}/8 categories; need 4`
      : `Calculated · ${current?.eligibleCategoryCount || 0}/8 categories`;

  return <div className="space-y-5">
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Personal performance index</p>
          <h1 className="mt-1 text-2xl font-bold">Life Index</h1>
          <p className="mt-1 text-sm text-zinc-500">A server-calculated view of your recorded routines. Starts at 100; it is not money, a medical measure, or a prediction.</p>
        </div>
        <button type="button" className={btn} onClick={refresh} disabled={recalculating || loading}>
          <RefreshCw size={15} className={recalculating ? 'animate-spin' : ''} />
          {recalculating ? 'Recalculating…' : 'Recalculate from saved data'}
        </button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric title="Current index" value={number(currentValue, 2)} detail={indexStatus} icon={Activity} />
        <Metric title="Selected range change" value={rangeDelta ? signed(rangeDelta.points) : 'Not enough history'} detail={rangeDelta?.percent === null || !rangeDelta ? range.label : `${number(rangeDelta.percent, 2)}% since first recorded point`} icon={trendIcon} tone={trendTone} />
        <Metric title="Category coverage" value={`${current?.eligibleCategoryCount || 0} / 8`} detail={`${current?.minimumCoverage || 4} categories needed for a new score`} icon={Check} tone={current?.eligibleCategoryCount >= 4 ? 'green' : 'amber'} />
        <Metric title="Latest source update" value={current?.dateKey || '—'} detail={lastUpdated} icon={CalendarClock} tone="zinc" />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-zinc-50 p-3 text-xs text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300">
        <span>{range.label}</span>
        <div className="flex items-center gap-2">
          <button type="button" className={`${btn} px-2 py-1`} aria-label="Previous history range" disabled={rangeDays === 'ALL'} onClick={() => setRangeOffset((offset) => offset + Number(rangeDays))}><ChevronLeft size={15} />Older</button>
          <button type="button" className={`${btn} px-2 py-1`} aria-label="Next history range" disabled={rangeDays === 'ALL' || rangeOffset === 0} onClick={() => setRangeOffset((offset) => Math.max(0, offset - Number(rangeDays)))}>Newer<ChevronRight size={15} /></button>
          <select value={rangeDays} onChange={(event) => { setRangeDays(event.target.value === 'ALL' ? 'ALL' : Number(event.target.value)); setRangeOffset(0); }} className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900">
            {RANGES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </div>
      </div>
      {error && <p role="alert" className="mt-3 flex items-center gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300"><AlertCircle size={16} />{error}</p>}
    </section>

    <Card title="Index history" action={<div className="flex flex-wrap gap-1">{TIMEFRAMES.map((item) => <button key={item} type="button" onClick={() => setTimeframe(item)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${timeframe === item ? 'bg-indigo-600 text-white' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'}`}>{item}</button>)}</div>}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Candles use saved observations only</p>
          <p className="mt-0.5 text-xs text-zinc-500">Intervals use Asia/Kolkata boundaries. Empty periods are left empty.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {EMA_PERIODS.map((period) => <button key={period} type="button" onClick={() => setEmaVisible((visible) => ({ ...visible, [period]: !visible[period] }))} className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${emaVisible[period] ? 'border-zinc-300 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800' : 'border-zinc-200 opacity-50 dark:border-zinc-700'}`}><span style={{ color: EMA_COLORS[period] }}>━</span> EMA {period} {emaVisible[period] ? '✓' : '○'}</button>)}
        </div>
      </div>

      {loading ? <div className="grid min-h-56 place-items-center text-sm text-zinc-500"><span className="flex items-center gap-2"><RefreshCw size={16} className="animate-spin" />Loading Life Index history…</span></div>
        : !candles.length ? <div className="mt-4 rounded-xl border border-dashed border-zinc-300 p-5 text-center dark:border-zinc-700">
          <p className="font-medium">{['15m', '1h', '2h'].includes(timeframe) ? 'No intraday observations yet' : 'No saved observations in this range'}</p>
          <p className="mx-auto mt-2 max-w-xl text-sm text-zinc-500">{['15m', '1h', '2h'].includes(timeframe) ? 'Intraday candles are created when you change a Life Index source record. Existing date-only records cannot be split into invented intraday candles.' : 'A date appears after at least one supported category has a real record. Missing dates are not filled in.'}</p>
        </div>
        : <div className="mt-4 overflow-x-auto">
          <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="min-w-[780px] w-full" role="img" aria-label={`${timeframe} Life Index candle chart`}>
            {[0, 1, 2, 3, 4].map((index) => {
              const value = chart.max - (index * (chart.max - chart.min)) / 4;
              const y = chart.y(value);
              return <g key={index}><line x1={chart.pad.left} y1={y} x2={chart.width - chart.pad.right} y2={y} stroke="currentColor" strokeOpacity=".12" strokeDasharray="4 5" /><text x="4" y={y + 4} fontSize="11" fill="currentColor" opacity=".65">{value.toFixed(1)}</text></g>;
            })}
            {candles.map((candle, index) => {
              const x = chart.x(index), rising = candle.close >= candle.open, color = rising ? '#059669' : '#dc2626';
              const bodyWidth = Math.max(2, Math.min(15, (chart.innerW / candles.length) * 0.64));
              return <g key={`${candle.time}-${index}`} tabIndex="0" role="button" aria-label={`Candle ${dateLabel(candle.time, timeframe)}`} onClick={() => setSelected(candle)} onFocus={() => setSelected(candle)} className="cursor-pointer">
                <title>{`${dateLabel(candle.time, timeframe)} · O ${number(candle.open, 2)} H ${number(candle.high, 2)} L ${number(candle.low, 2)} C ${number(candle.close, 2)} · Coverage ${candle.eligibleCategoryCount}/8${candle.carriedForward ? ' · carried forward' : ''}`}</title>
                <line x1={x} y1={chart.y(candle.high)} x2={x} y2={chart.y(candle.low)} stroke={color} strokeWidth="1.4" />
                <rect x={x - bodyWidth / 2} y={chart.y(Math.max(candle.open, candle.close))} width={bodyWidth} height={Math.max(1.5, Math.abs(chart.y(candle.open) - chart.y(candle.close)))} fill={color} rx="1" />
              </g>;
            })}
            {series.map((line) => <polyline key={line.name} points={line.values.map((value, index) => value === null || value === undefined ? '' : `${chart.x(index)},${chart.y(value)}`).filter(Boolean).join(' ')} fill="none" stroke={line.color} strokeWidth="2" strokeLinejoin="round" />)}
            {candles.filter((_, index) => index === 0 || index === candles.length - 1 || index % Math.max(1, Math.floor(candles.length / 6)) === 0).map((candle) => <text key={`label-${candle.time}`} x={chart.x(candles.indexOf(candle))} y={chart.height - 7} fontSize="11" textAnchor="middle" fill="currentColor" opacity=".7">{dateLabel(candle.time, timeframe)}</text>)}
          </svg>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-500">
            <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-600" />Close ≥ open</span>
            <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-red-600" />Close &lt; open</span>
            {series.map((line) => <span key={line.name} style={{ color: line.color }}>━ {line.name}{line.values.filter((value) => value !== null).length < (Number(line.name.slice(4)) || 1) ? ' · warming up' : ''}</span>)}
          </div>
        </div>}

      {selectedCandle && <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm dark:border-indigo-900 dark:bg-indigo-950/40">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{dateLabel(selectedCandle.time, timeframe)} · {selectedCandle.timeframe || timeframe}</h3><span className="text-xs text-zinc-500">{selectedCandle.observationCount || 1} saved observation{(selectedCandle.observationCount || 1) === 1 ? '' : 's'}</span></div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">{[['Open', selectedCandle.open], ['High', selectedCandle.high], ['Low', selectedCandle.low], ['Close', selectedCandle.close]].map(([label, value]) => <div key={label} className="rounded-lg bg-white/80 p-2 dark:bg-zinc-900/70"><span className="text-zinc-500">{label}</span><strong className="mt-0.5 block tabular-nums">{number(value, 2)}</strong></div>)}</div>
        <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">Aggregate score: {selectedCandle.aggregateScore == null ? 'Unavailable' : `${number(selectedCandle.aggregateScore)} / 100`} · Coverage: {selectedCandle.eligibleCategoryCount}/8{selectedCandle.carriedForward ? ' · carried forward, not a new score' : ''}</p>
        {selectedCandle.eventKind && <p className="mt-1 text-xs text-zinc-500">Saved event: {selectedCandle.eventKind}{selectedCandle.affectedDate ? ` · affected date ${selectedCandle.affectedDate}` : ''}</p>}
        {!!selectedCandle.categories?.length && <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{selectedCandle.categories.map((category) => <div key={category.id} className="rounded-lg bg-white/80 p-2 text-xs dark:bg-zinc-900/70"><div className="flex items-center justify-between gap-2"><strong>{category.label}</strong><span>{category.score == null ? '—' : `${number(category.score)} / 100`}</span></div><p className="mt-1 text-zinc-500">{category.reason}</p></div>)}</div>}
      </div>}
    </Card>

    <Card title="Category breakdown" action={<span className="text-xs text-zinc-500">Equal weights · minimum 4 of 8</span>}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(current?.categories || []).map((category) => <article key={category.id} className={`rounded-xl border p-3 ${category.eligible ? 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900' : 'border-dashed border-zinc-300 bg-zinc-50/70 dark:border-zinc-700 dark:bg-zinc-900/40'}`}>
          <div className="flex items-start justify-between gap-2"><div><h3 className="text-sm font-semibold">{category.label}</h3><p className="mt-0.5 text-[11px] text-zinc-400">{category.source}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${category.eligible ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800'}`}>{category.score == null ? 'No data' : number(category.score, 1)}</span></div>
          <p className="mt-3 text-xs leading-5 text-zinc-600 dark:text-zinc-300">{category.eligible ? category.reason : category.reason || 'No eligible observation.'}</p>
          {category.evidence && <dl className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500">{Object.entries(category.evidence).map(([name, value]) => <div key={name}><dt className="inline capitalize">{name.replace(/([A-Z])/g, ' $1')}: </dt><dd className="inline">{String(value)}</dd></div>)}</dl>}
        </article>)}
      </div>
      {history.length > 1 && <div className="mt-4 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
        <h3 className="text-sm font-semibold">Average category scores in this range</h3>
        <p className="mt-0.5 text-xs text-zinc-500">Averages only dates with an eligible score for that category. Missing dates are excluded, not counted as zero.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {categoryChanges.map((item) => <div key={item.id} className="rounded-lg bg-zinc-50 p-2.5 text-xs dark:bg-zinc-800/60"><div className="flex items-center justify-between gap-2"><strong>{item.label}</strong><span className="font-semibold tabular-nums">{item.average == null ? 'No data' : `${number(item.average)} / 100`}</span></div><p className="mt-1 text-zinc-500">{item.observedDays} eligible {item.observedDays === 1 ? 'day' : 'days'}{item.delta == null ? '' : ` · ${item.from} → ${item.to} (${item.delta > 0 ? '+' : ''}${number(item.delta)} pts)`}</p></div>)}
        </div>
      </div>}
      <p className="mt-4 text-xs leading-5 text-zinc-500">A missing category is excluded from the average, never scored as zero. If fewer than four categories are eligible, the last valid index is carried forward and clearly marked. Each category uses deterministic rules; the index changes by up to ±2% per valid observation relative to its prior valid value.</p>
    </Card>

    <Card title="How this index is calculated">
      <div className="grid gap-4 text-sm text-zinc-600 dark:text-zinc-300 md:grid-cols-2">
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Habit consistency:</strong> completed daily/weekday and weekly habits divided by scheduled opportunities on dates you marked as tracked. A check-off also marks that date as tracked.</li>
          <li><strong>Sleep:</strong> recorded hours ÷ 8, capped at 100.</li>
          <li><strong>Mood:</strong> bad 0, low 25, okay 50, good 75, great 100.</li>
          <li><strong>Nutrition:</strong> average of calorie and protein closeness to the targets calculated by your saved Nutrition profile.</li>
        </ul>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Phone use:</strong> 0 minutes is 100; 12 hours is 0.</li>
          <li><strong>Spending:</strong> requires a saved daily budget; score falls linearly to 0 at the budget.</li>
          <li><strong>Time audit:</strong> requires a saved daily limit; score falls linearly to 0 at that limit.</li>
          <li><strong>Plan vs. actual:</strong> completed priorities ÷ priorities kept on the plan; moved and dropped tasks are excluded.</li>
        </ul>
      </div>
      <div className="mt-4 rounded-xl bg-zinc-50 p-3 text-xs leading-5 text-zinc-500 dark:bg-zinc-800/60">
        Eligible category scores have equal weight. At least four categories are needed. The first baseline is 100; each valid aggregate changes the prior valid index by `1 + 0.02 × (score − 50) ÷ 50`. Daily history is saved only on dates with real source data. Intraday points are saved after source changes; the app does not split old daily data into made-up candles. EMAs use a first-N-close SMA seed and then `alpha = 2 / (N + 1)`.
      </div>
    </Card>
  </div>;
}
