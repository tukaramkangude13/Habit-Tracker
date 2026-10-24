import { useState } from 'react';
import { BrainCircuit, RefreshCw, Sparkles, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api } from '../api';
import { Card, btnP } from './ui';

const CONFIDENCE = {
  high: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  moderate: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  low: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
};

export default function AIProgressAnalyzer() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const analyze = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.post('/ai/progress-analysis', {});
      setResult(data);
    } catch (e) {
      setError(e.message || 'Could not generate the analysis.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="AI Progress Analyzer" action={<BrainCircuit size={19} className="text-indigo-600 dark:text-indigo-400" />}>
      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-300">
        Get a personalized review of your last 30 days, including habit consistency, possible patterns, and a practical plan for next week.
      </p>
      <button type="button" className={btnP} onClick={analyze} disabled={loading}>
        {loading ? <><RefreshCw size={15} className="animate-spin" /> Analyzing your progress...</> : <><Sparkles size={15} /> {result ? 'Refresh analysis' : 'Analyze my progress'}</>}
      </button>

      {error && (
        <div role="alert" className="mt-4 flex gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
          <AlertCircle size={17} className="mt-0.5 shrink-0" /><p>{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-5 space-y-5 border-t border-zinc-100 pt-5 dark:border-zinc-800">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
            <span>Period: {result.period.from} to {result.period.to}</span>
            <span>{result.trackedDays} days with scheduled habits</span>
          </div>
          <section>
            <h3 className="mb-2 text-sm font-semibold">Overall summary</h3>
            <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-700 dark:text-zinc-300">{result.analysis?.summary || 'No summary was returned.'}</p>
          </section>

          {!!result.analysis?.patterns?.length && (
            <section>
              <h3 className="mb-3 text-sm font-semibold">Patterns and recommendations</h3>
              <div className="space-y-3">
                {result.analysis.patterns.map((item, index) => (
                  <article key={`${item.title || 'pattern'}-${index}`} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h4 className="text-sm font-semibold">{item.title || `Pattern ${index + 1}`}</h4>
                      {item.confidence && <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${CONFIDENCE[item.confidence] || CONFIDENCE.low}`}>{item.confidence} confidence</span>}
                    </div>
                    {item.evidence && <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300"><b>Evidence:</b> {item.evidence}</p>}
                    {item.recommendation && <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-200"><b>Try this:</b> {item.recommendation}</p>}
                  </article>
                ))}
              </div>
            </section>
          )}

          {!!result.analysis?.nextWeekPlan?.length && (
            <section>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><CheckCircle2 size={16} className="text-emerald-600" /> Your next-week plan</h3>
              <ol className="space-y-2">
                {result.analysis.nextWeekPlan.map((item, index) => <li key={index} className="flex gap-2 text-sm text-zinc-700 dark:text-zinc-300"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">{index + 1}</span><span>{item}</span></li>)}
              </ol>
            </section>
          )}
          <p className="text-xs leading-5 text-zinc-400">AI-generated guidance can be wrong. Patterns are observations, not proof of cause. Your reflection notes are not sent to the AI; only aggregate trigger and category counts are included.</p>
        </div>
      )}
    </Card>
  );
}
