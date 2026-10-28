import { useState } from 'react';
import { Activity, AlertCircle, CheckCircle2, RefreshCw, Sparkles } from 'lucide-react';
import { api } from '../api';
import { buildProgressAnalysis } from '../progressAnalysis';
import { Card, btnP } from './ui';

const CONFIDENCE = {
  high: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  moderate: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  low: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
};

const asList = (result) => result.status === 'fulfilled' && Array.isArray(result.value) ? result.value : [];

export default function AIProgressAnalyzer({ habits = [], days = {}, today }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [partialSources, setPartialSources] = useState([]);
  const [error, setError] = useState('');

  const analyze = async () => {
    setLoading(true);
    setError('');
    setPartialSources([]);
    try {
      const sourceNames = ['Phone use', 'Time audit', 'Food logs'];
      const sourceResults = await Promise.allSettled([
        api.get('/screentime'),
        api.get('/timelogs'),
        api.get('/foodlogs'),
      ]);
      const failed = sourceResults.flatMap((source, index) => source.status === 'rejected' ? [sourceNames[index]] : []);
      const data = buildProgressAnalysis({
        habits,
        days,
        today,
        extra: {
          screen: asList(sourceResults[0]),
          time: asList(sourceResults[1]),
          food: asList(sourceResults[2]),
        },
      });
      setResult(data);
      setPartialSources(failed);
    } catch (e) {
      setError(e.message || 'Could not build the review from your saved data.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="Personal Progress Review" action={<Activity size={19} className="text-indigo-600 dark:text-indigo-400" />}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
          <Activity size={13} /> Runs in this app
        </span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">No AI key, usage limit, or external analysis request</span>
      </div>
      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-300">
        Compare the last 30 calendar days with the 30 before them. The review uses scheduled habits, daily priorities and outcomes, mood, sleep, and any phone, time, or food logs you have recorded. Unlogged days stay missing; they are not counted as missed habits.
      </p>
      <button type="button" className={btnP} onClick={analyze} disabled={loading || !today}>
        {loading ? <><RefreshCw size={15} className="animate-spin" /> Building your review...</> : <><Sparkles size={15} /> {result ? 'Refresh review' : 'Build my review'}</>}
      </button>

      {error && (
        <div role="alert" className="mt-4 flex gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
          <AlertCircle size={17} className="mt-0.5 shrink-0" /><p>{error}</p>
        </div>
      )}
      {!!partialSources.length && result && (
        <div role="status" className="mt-4 flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertCircle size={17} className="mt-0.5 shrink-0" />
          <p>{partialSources.join(', ')} could not load. The review still includes your habit and daily-plan records.</p>
        </div>
      )}

      {result && (
        <div className="mt-5 space-y-5 border-t border-zinc-100 pt-5 dark:border-zinc-800">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
            <span>Period: {result.period.from} to {result.period.to}</span>
            <span>{result.trackedDays} of 30 days recorded with scheduled habits</span>
          </div>
          <section className="rounded-xl bg-indigo-50/70 p-4 dark:bg-indigo-500/10">
            <h3 className="mb-1 text-sm font-semibold">What your data says</h3>
            <p className="text-sm leading-6 text-zinc-700 dark:text-zinc-200">{result.analysis.summary}</p>
          </section>

          {!!result.habitPerformance.length && (
            <section>
              <h3 className="mb-3 text-sm font-semibold">Habit and task follow-through · last 30 days</h3>
              <div className="space-y-3">
                {result.habitPerformance.slice(0, 6).map((habit) => (
                  <div key={habit.id}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-zinc-700 dark:text-zinc-200">{habit.name}</span>
                      <span className="shrink-0 text-xs tabular-nums text-zinc-500">{habit.completed}/{habit.due} tracked {habit.unit} · {Math.round(habit.rate)}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                      <div className="h-full rounded-full bg-indigo-500 transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(100, habit.rate))}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <h3 className="mb-3 text-sm font-semibold">Plan vs. actual · last 30 days</h3>
            {result.planVsActual.planned || result.planVsActual.moved || result.planVsActual.dropped ? (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ['Priorities kept', result.planVsActual.planned],
                    ['Completed', result.planVsActual.completed],
                    ['Moved', result.planVsActual.moved],
                    ['Dropped', result.planVsActual.dropped],
                  ].map(([label, value]) => <div key={label} className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900/70"><b className="block text-lg tabular-nums">{value}</b><span className="text-xs text-zinc-500">{label}</span></div>)}
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  {result.planVsActual.completionRate === null ? 'No priorities were recorded.' : `${Math.round(result.planVsActual.completionRate)}% of priorities kept on the plan were completed. Moved and dropped items are shown separately, not treated as failures.`}
                </p>
              </>
            ) : <p className="rounded-xl border border-zinc-200 p-3 text-sm text-zinc-500 dark:border-zinc-800">No daily priorities were recorded in this period. Add a small plan on a few days to compare planned work with what got done.</p>}
          </section>

          {!!result.planVsActual.outcomes.length && (
            <section>
              <h3 className="mb-3 text-sm font-semibold">Recent study / work outcomes</h3>
              <ul className="space-y-2">
                {result.planVsActual.outcomes.map((item) => <li key={item.date} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"><p className="text-xs text-zinc-400">{item.date}</p><p className="mt-1 text-sm text-zinc-700 dark:text-zinc-200">{item.outcome}</p>{item.nextStep && <p className="mt-1 text-xs text-indigo-600 dark:text-indigo-300">Next: {item.nextStep}</p>}</li>)}
              </ul>
            </section>
          )}

          <section>
            <h3 className="mb-3 text-sm font-semibold">Patterns and recommendations</h3>
            {result.analysis.patterns.length ? (
              <div className="space-y-3">
                {result.analysis.patterns.map((item, index) => (
                  <article key={`${item.title}-${index}`} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h4 className="text-sm font-semibold">{item.title}</h4>
                      {item.confidence && <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${CONFIDENCE[item.confidence] || CONFIDENCE.low}`}>{item.confidence} confidence</span>}
                    </div>
                    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300"><b>Evidence:</b> {item.evidence}</p>
                    <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-200"><b>Try this:</b> {item.recommendation}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-zinc-200 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">No strong pattern stands out yet. That can mean your routine is steady, or that there are not enough comparable entries to draw a useful signal.</p>
            )}
          </section>

          {!!result.analysis.nextWeekPlan.length && (
            <section>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><CheckCircle2 size={16} className="text-emerald-600" /> A practical plan for next week</h3>
              <ol className="space-y-2">
                {result.analysis.nextWeekPlan.map((item, index) => <li key={index} className="flex gap-2 text-sm text-zinc-700 dark:text-zinc-300"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">{index + 1}</span><span>{item}</span></li>)}
              </ol>
            </section>
          )}

          <section>
            <h3 className="mb-2 text-sm font-semibold">Data coverage · days with an entry</h3>
            <div className="flex flex-wrap gap-2">
              {result.coverage.map((item) => <span key={item.label} className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{item.count}/30 {item.label}</span>)}
            </div>
            {result.foodSummary.loggedDays > 0 && <p className="mt-2 text-xs text-zinc-500">Food log average on {result.foodSummary.loggedDays} logged days: {Math.round(result.foodSummary.averageCalories).toLocaleString()} kcal and {Math.round(result.foodSummary.averageProtein)} g protein per day.</p>}
          </section>
          <p className="text-xs leading-5 text-zinc-400">This review is a transparent set of rules applied to your saved records. Small samples are labeled cautiously; patterns show associations in your data, not proof of cause. Missing days are excluded from habit completion averages.</p>
        </div>
      )}
    </Card>
  );
}
