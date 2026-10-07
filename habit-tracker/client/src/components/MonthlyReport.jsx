import { useState } from 'react';
import { ChevronLeft, ChevronRight, FileDown, FileSpreadsheet } from 'lucide-react';
import { parse } from '../lib';
import { downloadCsv, printReport } from '../report';
import { Card, btn, btnP, iconBtn } from './ui';

export default function MonthlyReport({ habits, days, today }) {
  const [m, setM] = useState(() => parse(today).getFullYear() * 12 + parse(today).getMonth());
  const [err, setErr] = useState('');
  const y = Math.floor(m / 12), mo = m % 12;
  const label = new Date(y, mo, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const run = (fn) => { try { setErr(''); fn(y, mo, habits, days, today); } catch (e) { setErr(e.message); } };
  return (
    <Card title="Monthly Report">
      <div className="mb-3 flex items-center justify-between text-sm">
        <button className={iconBtn} aria-label="Previous month" onClick={() => setM(m - 1)}><ChevronLeft size={16} /></button>
        <span className="font-medium">{label}</span>
        <button className={iconBtn} aria-label="Next month" onClick={() => setM(m + 1)}><ChevronRight size={16} /></button>
      </div>
      <p className="mb-3 text-xs text-zinc-500">Habits down the left, days across the top, with a tick for done and a cross for missed.</p>
      <div className="flex flex-wrap gap-2">
        <button disabled={!habits.length} className={`${btnP} disabled:opacity-50`} onClick={() => run(printReport)}><FileDown size={16} />PDF</button>
        <button disabled={!habits.length} className={`${btn} disabled:opacity-50`} onClick={() => run(downloadCsv)}><FileSpreadsheet size={16} />Excel (CSV)</button>
      </div>
      {err && <p role="alert" className="mt-2 text-xs text-red-500">{err}</p>}
    </Card>
  );
}
