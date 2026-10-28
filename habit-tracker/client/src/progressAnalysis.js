import { addDays, habitAppliesOn, key, parse } from './lib';

const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const pct = value => value === null ? 'not enough data' : `${Math.round(value)}%`;
const hm = minutes => {
  const value = Math.round(minutes || 0);
  return value >= 60 ? `${Math.floor(value / 60)}h ${value % 60}m` : `${value}m`;
};

export function buildProgressAnalysis({ habits, days, today, extra }) {
  const dates = Array.from({ length: 60 }, (_, index) => key(addDays(parse(today), index - 59)));
  const screen = Object.fromEntries(extra.screen.map(row => [row.date, Number(row.totalMinutes) || 0]));
  const time = {}, food = {};
  extra.time.forEach(row => { time[row.date] = (time[row.date] || 0) + (Number(row.minutes) || 0); });
  extra.food.forEach(row => {
    const daily = food[row.date] ||= { calories: 0, protein: 0, entries: 0 };
    daily.calories += Number(row.kcal) || 0;
    daily.protein += Number(row.protein) || 0;
    daily.entries++;
  });
  const buildRows = range => range.map(date => {
    const record = days[date];
    const due = habits.filter(habit => !['weekly', 'once'].includes(habit.frequency) && habitAppliesOn(habit, date));
    if (!record || !due.length) return null;
    const completed = due.filter(habit => record.done?.includes(habit._id)).length;
    return {
      date, rate: completed / due.length * 100, done: completed, due: due.length,
      mood: record.mood || null,
      moodScore: ({ bad: 1, low: 2, okay: 3, good: 4, great: 5 })[record.mood] ?? null,
      sleep: record.sleep !== null && record.sleep !== undefined && record.sleep !== '' && Number.isFinite(Number(record.sleep)) ? Number(record.sleep) : null,
      wasted: time[date] ?? null,
      screen: Object.hasOwn(screen, date) ? screen[date] : null,
      kcal: food[date]?.entries ? food[date].calories : null,
      priorities: record.priorities || [],
      energy: Number(record.energy) || null,
      focus: Number(record.focus) || null,
      studyOutcome: record.studyOutcome || '',
    };
  }).filter(Boolean);
  const previousRows = buildRows(dates.slice(0, 30));
  const recentRows = buildRows(dates.slice(30));
  const previousAvg = mean(previousRows.map(row => row.rate));
  const recentAvg = mean(recentRows.map(row => row.rate));
  const delta = previousAvg === null || recentAvg === null ? null : recentAvg - previousAvg;
  const patterns = [];
  const recommendations = [];

  if (delta !== null && previousRows.length >= 4 && recentRows.length >= 4 && Math.abs(delta) >= 5) {
    patterns.push({
      title: delta > 0 ? 'Habit completion is trending up' : 'Habit completion is trending down',
      evidence: `Average completion changed from ${pct(previousAvg)} across ${previousRows.length} tracked days to ${pct(recentAvg)} across ${recentRows.length} tracked days.`,
      recommendation: delta > 0 ? 'Keep the routine that has been working and avoid adding too many new commitments at once.' : 'Review the tasks that were moved or left pending. Shorten the list or adjust their scheduled days before adding more.',
      confidence: previousRows.length >= 8 && recentRows.length >= 8 ? 'moderate' : 'low',
    });
  }

  const periodDays = dates.slice(30).filter(date => days[date]).map(date => ({ date, ...days[date] }));
  const habitPerformance = habits.filter(habit => !['weekly', 'once'].includes(habit.frequency)).map(habit => {
    const opportunities = recentRows.filter(row => row.date >= dates[30] && habitAppliesOn(habit, row.date));
    const completed = opportunities.filter(row => days[row.date]?.done?.includes(habit._id)).length;
    return { id: habit._id, name: habit.name, completed, due: opportunities.length, unit: 'days', rate: opportunities.length ? completed / opportunities.length * 100 : null };
  }).filter(row => row.due > 0).sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101));
  const trackedWeeks = new Map();
  periodDays.forEach(row => {
    const weekday = parse(row.date).getDay();
    const start = key(addDays(parse(row.date), -((weekday + 6) % 7)));
    if (!trackedWeeks.has(start)) trackedWeeks.set(start, []);
    trackedWeeks.get(start).push(row.date);
  });
  const weeklyPerformance = habits.filter(habit => habit.frequency === 'weekly').map(habit => {
    const opportunities = [...trackedWeeks.values()].filter(weekDates => weekDates.some(date => habitAppliesOn(habit, date)));
    const completed = opportunities.filter(weekDates => weekDates.some(date => days[date]?.done?.includes(habit._id))).length;
    return { id: habit._id, name: habit.name, completed, due: opportunities.length, unit: 'weeks', rate: opportunities.length ? completed / opportunities.length * 100 : null };
  }).filter(row => row.due > 0);
  const oneTimePerformance = habits.filter(habit => habit.frequency === 'once').map(habit => {
    const completedBeforePeriod = Object.keys(days).some(date => date < dates[30] && habitAppliesOn(habit, date) && days[date]?.done?.includes(habit._id));
    if (completedBeforePeriod) return null;
    const trackedDates = periodDays.filter(row => habitAppliesOn(habit, row.date));
    if (!trackedDates.length) return null;
    const completed = trackedDates.some(row => row.done?.includes(habit._id));
    return { id: habit._id, name: habit.name, completed: completed ? 1 : 0, due: 1, unit: 'task', rate: completed ? 100 : 0 };
  }).filter(Boolean);
  habitPerformance.push(...weeklyPerformance, ...oneTimePerformance);
  habitPerformance.sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101));
  const needsReview = habitPerformance.filter(row => row.due >= 4 && row.rate < 60).slice(0, 3);
  if (needsReview.length) {
    patterns.push({
      title: 'Some scheduled tasks may need a smaller plan',
      evidence: needsReview.map(row => `${row.name}: ${row.completed}/${row.due} tracked ${row.unit} (${Math.round(row.rate)}%).`).join(' '),
      recommendation: 'Decide whether each task still matters on every scheduled day. Shorten its schedule or break it into a smaller action if that fits your goal.',
      confidence: needsReview.every(row => row.due >= 6) ? 'moderate' : 'low',
    });
  }

  const compareGroups = (title, leftLabel, left, rightLabel, right, recommendation) => {
    const a = left.map(row => row.rate), b = right.map(row => row.rate);
    const av = mean(a), bv = mean(b);
    if (a.length < 3 || b.length < 3 || av === null || bv === null || Math.abs(av - bv) < 10) return;
    patterns.push({
      title,
      evidence: `${leftLabel}: ${pct(av)} average completion over ${a.length} recorded days; ${rightLabel}: ${pct(bv)} over ${b.length} recorded days.`,
      recommendation,
      confidence: a.length >= 6 && b.length >= 6 ? 'moderate' : 'low',
    });
  };
  compareGroups('Sleep and completion move together in your records', 'Under 7 hours', recentRows.filter(row => row.sleep !== null && row.sleep < 7), '7 hours or more', recentRows.filter(row => row.sleep !== null && row.sleep >= 7),
    'If sleep is a priority for you, try a consistent wind-down time for one week and compare the next review. This pattern alone does not show cause.');
  compareGroups('Mood and completion differ across recorded days', 'Good mood', recentRows.filter(row => row.moodScore !== null && row.moodScore >= 4), 'Low mood', recentRows.filter(row => row.moodScore !== null && row.moodScore <= 2),
    'On lower-energy days, try planning one small essential task. This is an association in your records, not proof of cause.');
  const screenRows = recentRows.filter(row => row.screen !== null);
  if (screenRows.length >= 6) {
    const sortedScreen = screenRows.map(row => row.screen).sort((a, b) => a - b);
    const midpoint = sortedScreen[Math.floor(sortedScreen.length / 2)];
    compareGroups('Phone use and completion differ in your records', `Below your midpoint (${hm(midpoint)})`, screenRows.filter(row => row.screen < midpoint), `At or above it (${hm(midpoint)}+)`, screenRows.filter(row => row.screen >= midpoint),
      'If you want to experiment, set one small phone-use boundary for a week and compare the result. This pattern alone does not show cause.');
  }
  const highEnergy = recentRows.filter(row => [row.energy, row.focus].some(value => value !== null && value >= 4));
  const lowEnergy = recentRows.filter(row => [row.energy, row.focus].some(value => value !== null && value <= 2) && ![row.energy, row.focus].some(value => value !== null && value >= 4));
  compareGroups('Energy or focus and completion move together in your records', 'Higher ratings', highEnergy, 'Lower ratings', lowEnergy,
    'On lower-energy days, try planning one small essential task. This is an association in your records, not proof of cause.');

  const weekdays = Array.from({ length: 7 }, (_, weekday) => {
    const group = recentRows.filter(row => parse(row.date).getDay() === weekday);
    return { weekday, rows: group, average: mean(group.map(row => row.rate)) };
  }).filter(group => group.rows.length >= 2 && group.average !== null);
  if (weekdays.length >= 2) {
    const best = [...weekdays].sort((a, b) => b.average - a.average)[0];
    const worst = [...weekdays].sort((a, b) => a.average - b.average)[0];
    if (best.weekday !== worst.weekday && best.average - worst.average >= 15) {
      const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayName = weekday => weekdayNames[weekday];
      patterns.push({
        title: 'Your completion varies by weekday',
        evidence: `${dayName(best.weekday)} averaged ${pct(best.average)} (${best.rows.length} tracked days); ${dayName(worst.weekday)} averaged ${pct(worst.average)} (${worst.rows.length} tracked days).`,
        recommendation: `Consider keeping ${dayName(worst.weekday)} lighter or moving flexible tasks away from it.`,
        confidence: 'low',
      });
    }
  }

  const currentTasks = periodDays.flatMap(row => (row.priorities || []).map(item => ({ ...item, date: row.date })));
  const plannedTasks = currentTasks.filter(item => !['moved', 'dropped'].includes(item.status));
  const doneTasks = plannedTasks.filter(item => item.status === 'done').length;
  const outcomes = periodDays
    .filter(row => String(row.studyOutcome || '').trim())
    .map(row => ({ date: row.date, outcome: String(row.studyOutcome).trim(), nextStep: String(row.studyNextStep || '').trim() }))
    .reverse();
  if (recentRows.length < 4) recommendations.push('Log a few more days before comparing trends. A blank day is treated as missing data, not a failure.');
  if (plannedTasks.length < 5) recommendations.push('Plan up to three priorities on more days. Mark moved or dropped items and add a short reason so the review can distinguish a changed plan from a missed task.');
  else if (doneTasks / plannedTasks.length < 0.6) recommendations.push('Try planning fewer priorities next week. Keep the one or two that matter most and compare the result.');
  if (outcomes.length < 3) recommendations.push('Add a short study/work outcome on a few days. Record what you learned or finished, not only time spent.');

  const currentDates = new Set(dates.slice(30));
  const currentTimeLogs = extra.time.filter(row => currentDates.has(row.date));
  const coverage = [
    { label: 'Mood', count: periodDays.filter(row => row.mood).length },
    { label: 'Sleep', count: periodDays.filter(row => row.sleep !== null && row.sleep !== undefined && row.sleep !== '').length },
    { label: 'Time audit', count: new Set(currentTimeLogs.map(row => row.date)).size },
    { label: 'Phone use', count: extra.screen.filter(row => currentDates.has(row.date)).length },
    { label: 'Food', count: new Set(extra.food.filter(row => currentDates.has(row.date)).map(row => row.date)).size },
    { label: 'Energy / focus', count: periodDays.filter(row => (row.energy !== null && row.energy !== undefined) || (row.focus !== null && row.focus !== undefined)).length },
    { label: 'Daily plan', count: periodDays.filter(row => row.priorities?.length).length },
    { label: 'Study/work outcome', count: outcomes.length },
  ];
  const foodDays = dates.slice(30).map(date => food[date]).filter(day => day?.entries);
  const foodSummary = {
    loggedDays: foodDays.length,
    averageCalories: mean(foodDays.map(day => day.calories)),
    averageProtein: mean(foodDays.map(day => day.protein)),
  };
  const wastedTotal = currentTimeLogs.reduce((sum, row) => sum + (Number(row.minutes) || 0), 0);
  if (wastedTotal > 0) {
    const categoryTotals = {};
    currentTimeLogs.forEach(row => { categoryTotals[row.category] = (categoryTotals[row.category] || 0) + (Number(row.minutes) || 0); });
    const top = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0];
    if (top) patterns.push({ title: 'Time you marked as wasted', evidence: `${hm(wastedTotal)} logged across ${new Set(currentTimeLogs.map(row => row.date)).size} days. Largest category: ${top[0]} (${hm(top[1])}).`, recommendation: 'If you want to change this, choose one category and set a small limit for next week. The log reflects your own label for the time, not an objective judgment.', confidence: 'high' });
  }

  if (!recentRows.length) {
    recommendations.unshift('There are no days with both a daily record and scheduled habits in the last 30 days. Start with one task and a short daily plan.');
  }
  const summary = recentRows.length
    ? `You recorded ${recentRows.length} of 30 days with scheduled habits. Average completion was ${pct(recentAvg)}${delta === null ? '' : `, ${delta >= 0 ? 'up' : 'down'} ${Math.abs(Math.round(delta))} percentage points compared with the previous 30 days`}. You completed ${doneTasks} of ${plannedTasks.length} priorities that remained on your plan. ${outcomes.length} study/work outcomes were recorded.`
    : 'There is not enough daily habit data in this 30-day period to calculate a completion trend. Add a daily record and try again.';

  if (!recommendations.length) recommendations.push('Keep the same plan for one more week. Review again after you have enough days to compare.');
  return {
    period: { from: dates[30], to: today },
    trackedDays: recentRows.length,
    analysis: { summary, patterns, nextWeekPlan: recommendations.slice(0, 3) },
    habitPerformance,
    coverage,
    foodSummary,
    planVsActual: {
      planned: plannedTasks.length,
      completed: doneTasks,
      moved: currentTasks.filter(item => item.status === 'moved').length,
      dropped: currentTasks.filter(item => item.status === 'dropped').length,
      completionRate: plannedTasks.length ? doneTasks / plannedTasks.length * 100 : null,
      outcomes: outcomes.slice(0, 4),
    },
  };
}
