import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';

const fmt = (n) => Number(n).toFixed(2);
const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const parseDay = (s) => new Date(`${s}T12:00:00`);
const ema = (values, period) => {
  const out = Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a,b)=>a+b,0) / period;
  out[period-1] = prev;
  for (let i=period;i<values.length;i++) { prev = values[i]*k + prev*(1-k); out[i] = prev; }
  return out;
};
const sma = (values, period) => values.map((_,i)=> i+1<period ? null : values.slice(i-period+1,i+1).reduce((a,b)=>a+b,0)/period);
const rsi = (values, period=14) => {
  const out = Array(values.length).fill(null);
  if (values.length <= period) return out;
  let up=0, down=0;
  for(let i=1;i<=period;i++){const d=values[i]-values[i-1];up+=Math.max(0,d);down+=Math.max(0,-d);}
  let avgUp=up/period, avgDown=down/period;
  out[period] = avgDown===0 ? 100 : 100-100/(1+avgUp/avgDown);
  for(let i=period+1;i<values.length;i++){const d=values[i]-values[i-1];avgUp=(avgUp*(period-1)+Math.max(0,d))/period;avgDown=(avgDown*(period-1)+Math.max(0,-d))/period;out[i]=avgDown===0?100:100-100/(1+avgUp/avgDown);}
  return out;
};
const macd = (values) => {
  const fast=ema(values,12), slow=ema(values,26);
  const line=values.map((_,i)=>fast[i]===null||slow[i]===null?null:fast[i]-slow[i]);
  const first=line.findIndex(v=>v!==null);
  const compact=first<0?[]:line.slice(first);
  const signalCompact=ema(compact,9);
  const signal=Array(values.length).fill(null);
  compact.forEach((v,i)=>{signal[first+i]=signalCompact[i]});
  return {line,signal,hist:line.map((v,i)=>v===null||signal[i]===null?null:v-signal[i])};
};

export default function LifeIndex({ habits=[], days={}, today }) {
  const [extra,setExtra] = useState({screen:[],expenses:[],timelogs:[],food:[],profile:null,settings:{}});
  const [err,setErr] = useState('');
  const [tf,setTf] = useState('1D');
  const [indicator,setIndicator] = useState('EMA');
  const [period,setPeriod] = useState(90);
  const [selected,setSelected] = useState(null);
  const [busy,setBusy] = useState(true);
  useEffect(()=>{
    let live=true;
    Promise.all([api.get('/screentime'),api.get('/expenses'),api.get('/timelogs'),api.get('/foodlogs'),api.get('/nutrition/profile'),api.get('/settings')])
      .then(([screen,expenses,timelogs,food,profile,settings])=>{if(live)setExtra({screen,expenses,timelogs,food,profile,settings});})
      .catch(e=>{if(live)setErr(e.message);})
      .finally(()=>{if(live)setBusy(false)});
    return ()=>{live=false};
  },[]);

  const daily = useMemo(()=>{
    const end=parseDay(today || dayKey(new Date()));
    const start=new Date(end);start.setDate(start.getDate()-(period-1));
    const dates=[];for(let d=new Date(start);d<=end;d.setDate(d.getDate()+1))dates.push(dayKey(d));
    const screen=Object.fromEntries(extra.screen.map(x=>[x.date,x]));
    const spend={},waste={},food={};
    extra.expenses.forEach(x=>spend[x.date]=(spend[x.date]||0)+(Number(x.amount)||0));
    extra.timelogs.forEach(x=>waste[x.date]=(waste[x.date]||0)+(Number(x.minutes)||0));
    extra.food.forEach(x=>{const f=food[x.date]||={kcal:0,protein:0,count:0};f.kcal+=Number(x.kcal)||0;f.protein+=Number(x.protein)||0;f.count++});
    const profile=extra.profile||{};
    const calorieTarget=Number(profile.target)||Number(extra.settings.calorieTarget)||3100;
    const proteinTarget=Number(extra.settings.proteinTarget)||113;
    const dailyBudget=Number(extra.settings.dailyBudget)||0;
    let idx=100;
    const rows=[];
    dates.forEach((date,i)=>{
      const day=days[date];const dow=parseDay(date).getDay();
      const due=habits.filter(h=>h.frequency!=='weekly' && (!h.createdAt||dayKey(new Date(h.createdAt))<=date) && (!h.archivedOn||date<h.archivedOn) && !(h.frequency==='weekdays'&&(dow===0||dow===6)));
      const categories=[];
      if(day && due.length) categories.push(due.filter(h=>(day.done||[]).includes(h._id)).length/due.length*100);
      if(day && Number.isFinite(Number(day.sleep)) && day.sleep!=='' && Number(day.sleep)>=0) categories.push(clamp(Number(day.sleep)/8*100));
      if(food[date]?.count){categories.push((clamp(food[date].kcal/calorieTarget*100)+clamp(food[date].protein/proteinTarget*100))/2)}
      if(screen[date] && Number.isFinite(Number(screen[date].totalMinutes))){categories.push(clamp(100-Number(screen[date].totalMinutes)/240*100));}
      if(Object.prototype.hasOwnProperty.call(spend,date) && dailyBudget>0){categories.push(clamp(100-spend[date]/dailyBudget*100));}
      if(Object.prototype.hasOwnProperty.call(waste,date)){categories.push(clamp(100-waste[date]/120*100));}
      const score=categories.length>=4?categories.reduce((a,b)=>a+b,0)/categories.length:null;
      const open=idx;
      if(score!==null) idx=open*(1+0.02*(score-50)/50);
      const mood=day?.mood||null;
      rows.push({date,open,close:idx,high:Math.max(open,idx),low:Math.min(open,idx),score,coverage:categories.length,mood, provisional:date===today});
    });
    return rows;
  },[habits,days,today,period,extra]);

  const candles = useMemo(()=>{
    if(tf==='1D') return daily;
    if(tf==='1W'){
      const groups=[];daily.forEach(c=>{const d=parseDay(c.date);const monday=new Date(d);monday.setDate(d.getDate()-((d.getDay()+6)%7));const key=dayKey(monday);let g=groups[groups.length-1];if(!g||g.date!==key){g={date:key,open:c.open,high:c.high,low:c.low,close:c.close,score:c.score,coverage:c.coverage,mood:c.mood,provisional:c.provisional};groups.push(g)}else{g.high=Math.max(g.high,c.high);g.low=Math.min(g.low,c.low);g.close=c.close;g.score=c.score;g.coverage=c.coverage;g.provisional=c.provisional;}});return groups;
    }
    // Source records in this version are mostly date-granular. Do not fabricate intraday candles.
    return [];
  },[daily,tf]);
  const closes=candles.map(c=>c.close);
  const ema9=ema(closes,9),ema21=ema(closes,21),ema50=ema(closes,50),sma20=sma(closes,20),rsi14=rsi(closes),mac=macd(closes);
  const bbMid=sma(closes,20),bbStd=closes.map((v,i)=>{if(i<19)return null;const slice=closes.slice(i-19,i+1);const mean=slice.reduce((a,b)=>a+b,0)/20;return Math.sqrt(slice.reduce((a,b)=>a+(b-mean)**2,0)/20)});
  const bbUpper=bbMid.map((v,i)=>v===null||bbStd[i]===null?null:v+2*bbStd[i]);
  const bbLower=bbMid.map((v,i)=>v===null||bbStd[i]===null?null:v-2*bbStd[i]);
  const last=candles[candles.length-1];
  const series=indicator==='EMA'?[{name:'EMA 9',values:ema9,color:'#60a5fa'},{name:'EMA 21',values:ema21,color:'#f59e0b'},{name:'EMA 50',values:ema50,color:'#c084fc'}]:indicator==='SMA'?[{name:'SMA 20',values:sma20,color:'#60a5fa'}]:indicator==='Bollinger Bands'?[{name:'Upper band',values:bbUpper,color:'#a78bfa'},{name:'Middle',values:bbMid,color:'#60a5fa'},{name:'Lower band',values:bbLower,color:'#a78bfa'}]:[];
  const chart = useMemo(()=>{
    if(!candles.length)return null;
    const W=900,H=360,pad=36;const vals=candles.flatMap(c=>[c.high,c.low]);series.forEach(s=>s.values.forEach(v=>{if(v!==null)vals.push(v)}));
    const min=Math.min(...vals)-0.4,max=Math.max(...vals)+0.4,range=max-min||1;
    const x=i=>pad+i*(W-pad*2)/Math.max(1,candles.length-1);const y=v=>H-pad-(v-min)/range*(H-pad*2);
    return {W,H,pad,min,max,x,y};
  },[candles,series]);
  const fmtDate=(s)=>{const d=parseDay(s);return d.toLocaleDateString(undefined,{month:'short',day:'numeric'});};

  return <div className="space-y-5">
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Personal analytics · virtual index</p><h1 className="mt-1 text-2xl font-bold">Life Performance Index</h1><p className="mt-1 text-sm text-zinc-500">Starts at 100 · Based on recorded data, not money or a medical measure.</p></div><div className="flex flex-wrap gap-2">{['15m','1h','2h','1D','1W'].map(x=><button key={x} onClick={()=>setTf(x)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${tf===x?'bg-indigo-600 text-white':'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'}`}>{x}</button>)}</div></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800"><p className="text-xs text-zinc-500">Latest index</p><p className="mt-1 text-2xl font-bold">{last?fmt(last.close):'100.00'}</p></div><div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800"><p className="text-xs text-zinc-500">Latest score</p><p className="mt-1 text-2xl font-bold">{last?.score==null?'—':`${last.score.toFixed(1)}/100`}</p></div><div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800"><p className="text-xs text-zinc-500">Data coverage</p><p className="mt-1 text-2xl font-bold">{last?`${last.coverage}/7`:'0/7'}</p></div></div>
      <div className="mt-4 flex flex-wrap items-center gap-2"><label className="text-sm text-zinc-500">Indicators</label><select value={indicator} onChange={e=>setIndicator(e.target.value)} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"><option>EMA</option><option>SMA</option><option>RSI</option><option>MACD</option><option>Bollinger Bands</option></select><label className="ml-auto text-sm text-zinc-500">History</label><select value={period} onChange={e=>setPeriod(Number(e.target.value))} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"><option value={30}>30 days</option><option value={90}>90 days</option><option value={180}>180 days</option><option value={365}>365 days</option></select></div>
      {err&&<p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Some metrics could not load: {err}</p>}
      {tf!=='1D'&&tf!=='1W'?<div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Intraday candles will appear after timestamped event snapshots are recorded. Existing historical records are mostly date-based, so this version does not invent 15-minute or hourly candles.</div>:!candles.length?<p className="py-12 text-center text-sm text-zinc-500">No eligible history in this range yet.</p>:<div className="mt-4 overflow-x-auto"><svg viewBox={`0 0 ${chart.W} ${chart.H}`} className="min-w-[650px] w-full" role="img" aria-label="Life Index candlestick chart">{[0,1,2,3,4].map(i=>{const y=chart.pad+i*(chart.H-chart.pad*2)/4;return <g key={i}><line x1={chart.pad} y1={y} x2={chart.W-chart.pad} y2={y} stroke="currentColor" strokeOpacity=".12" strokeDasharray="4 5"/><text x="4" y={y+4} fontSize="11" fill="currentColor" opacity=".65">{(chart.max-i*(chart.max-chart.min)/4).toFixed(1)}</text></g>})}{candles.map((c,i)=>{const x=chart.x(i),up=c.close>=c.open,color=up?'#16a34a':'#dc2626';return <g key={c.date} onClick={()=>setSelected(c)} className="cursor-pointer"><line x1={x} y1={chart.y(c.high)} x2={x} y2={chart.y(c.low)} stroke={color} strokeWidth="1.5"/><rect x={x- Math.max(2,Math.min(8,260/candles.length))} y={chart.y(Math.max(c.open,c.close))} width={Math.max(4,Math.min(16,520/candles.length))} height={Math.max(2,Math.abs(chart.y(c.open)-chart.y(c.close)))} fill={color} rx="1"/></g>})}{series.map(s=><polyline key={s.name} points={s.values.map((v,i)=>v===null?'':`${chart.x(i)},${chart.y(v)}`).filter(Boolean).join(' ')} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round"/>)}{candles.filter((_,i)=>i===0||i===candles.length-1||i%Math.max(1,Math.floor(candles.length/6))===0).map(c=><text key={c.date} x={chart.x(candles.indexOf(c))} y={chart.H-8} fontSize="11" textAnchor="middle" fill="currentColor" opacity=".65">{fmtDate(c.date)}</text>)}</svg><div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-500"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-green-600"/>Close ≥ open</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-red-600"/>Close &lt; open</span>{series.map(s=><span key={s.name} style={{color:s.color}}>━ {s.name}</span>)}</div></div>}
      {selected&&<div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-950 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-100"><div className="flex items-center justify-between"><strong>{fmtDate(selected.date)}</strong><button onClick={()=>setSelected(null)} aria-label="Close candle details">✕</button></div><p className="mt-2">O {fmt(selected.open)} · H {fmt(selected.high)} · L {fmt(selected.low)} · C {fmt(selected.close)}</p><p className="mt-1">Performance score: {selected.score==null?'Unavailable':selected.score.toFixed(1)} · Coverage: {selected.coverage}/7 · Mood: {selected.mood||'Not recorded'}</p></div>}
    </div>
    {indicator==='RSI'&&<IndicatorPanel title="RSI 14" values={rsi14} candles={candles} formatter={v=>v==null?'—':v.toFixed(1)} note="RSI uses candle closes. Values above 70 or below 30 flag strong recent movement, not a diagnosis."/>}
    {indicator==='MACD'&&<IndicatorPanel title="MACD (12, 26, 9)" values={mac.line} candles={candles} formatter={v=>v==null?'—':v.toFixed(3)} note="MACD needs at least 34 closes before its signal line becomes available."/>}
    <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"><h2 className="font-semibold text-zinc-900 dark:text-zinc-100">How to read this chart</h2><ul className="mt-2 list-disc space-y-1 pl-5"><li>Daily and weekly candles are based on existing saved records.</li><li>Score requires at least four eligible categories; missing data is not treated as zero.</li><li>Mood is contextual only and is not used as a numerical penalty.</li><li>EMA, SMA, RSI, MACD, and Bollinger Bands need sufficient candle history. Short history will show gaps rather than invented indicator values.</li><li>Daily/weekly historical values are provisional until the scoring and reconciliation rules are finalized in backend persistence.</li></ul>{busy&&<p className="mt-2 text-xs">Loading additional metrics…</p>}</div>
  </div>;
}
function IndicatorPanel({title,values,candles,formatter,note}){const valid=values.map((v,i)=>v==null?null:{v,date:candles[i]?.date}).filter(Boolean);return <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><h3 className="font-semibold">{title}</h3><p className="mt-1 text-sm text-zinc-500">{note}</p><div className="mt-3 flex flex-wrap gap-2">{valid.slice(-8).map(x=><span key={x.date} className="rounded-lg bg-zinc-100 px-3 py-2 text-xs dark:bg-zinc-800">{x.date}: <strong>{formatter(x.v)}</strong></span>)}</div>{!valid.length&&<p className="mt-3 text-sm text-zinc-500">Not enough candles yet to calculate this indicator.</p>}</div>}
