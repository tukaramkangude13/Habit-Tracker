export const LIFE_INDEX_VERSION = 'life-index-v1';
export const LIFE_INDEX_TIME_ZONE = 'Asia/Kolkata';
export const LIFE_INDEX_BASE = 100;
export const LIFE_INDEX_MIN_COVERAGE = 4;
export const LIFE_INDEX_TIMEFRAMES = ['15m', '1h', '2h', '1d', '1w'];
export const LIFE_INDEX_EMA_PERIODS = [20, 50, 100, 200];

const IST_OFFSET_MS = 330 * 60 * 1000;
const CATEGORY_DEFINITIONS = [
  { id: 'habits', label: 'Habit consistency', source: 'Day.done + Habit.frequency' },
  { id: 'sleep', label: 'Sleep', source: 'Day.sleep' },
  { id: 'mood', label: 'Mood', source: 'Day.mood' },
  { id: 'nutrition', label: 'Nutrition', source: 'FoodLog + NutritionProfile' },
  { id: 'phone', label: 'Phone use', source: 'ScreenTime.totalMinutes' },
  { id: 'spending', label: 'Spending', source: 'Expense + Setting.budget' },
  { id: 'timeAudit', label: 'Time audit', source: 'TimeLog + Setting.timeLimit' },
  { id: 'productivity', label: 'Plan vs. actual', source: 'Day.priorities' },
];

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const round = (value, places = 4) => Number(value.toFixed(places));
const numeric = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));

export function isDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function dateKeyInTimeZone(value, timeZone = LIFE_INDEX_TIME_ZONE) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid timestamp.');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const part = Object.fromEntries(parts.map(({ type, value: partValue }) => [type, partValue]));
  return `${part.year}-${part.month}-${part.day}`;
}

export function dateKeyToInstant(dateKey) {
  if (!isDateKey(dateKey)) throw new Error('Date must be a valid YYYY-MM-DD value.');
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day) - IST_OFFSET_MS);
}

export function addDateKeyDays(dateKey, amount) {
  if (!isDateKey(dateKey)) throw new Error('Date must be a valid YYYY-MM-DD value.');
  const [year, month, day] = dateKey.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + amount));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

export function weekStartDateKey(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return addDateKeyDays(dateKey, -((date.getUTCDay() + 6) % 7));
}

export function bucketStartForTime(value, timeframe) {
  if (!['15m', '1h', '2h'].includes(timeframe)) throw new Error('Invalid intraday timeframe.');
  const duration = timeframe === '15m' ? 15 * 60_000 : timeframe === '1h' ? 60 * 60_000 : 120 * 60_000;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(time)) throw new Error('Invalid timestamp.');
  return new Date(Math.floor((time + IST_OFFSET_MS) / duration) * duration - IST_OFFSET_MS);
}

export function habitAppliesOn(habit, dateKey) {
  const created = habit.startDate || (habit.createdAt ? dateKeyInTimeZone(habit.createdAt) : dateKey);
  if (dateKey < created || (habit.endDate && dateKey > habit.endDate) || (habit.archivedOn && dateKey >= habit.archivedOn)) return false;
  if (habit.frequency !== 'weekdays') return true;
  const [year, month, day] = dateKey.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday !== 0 && weekday !== 6;
}

function nutritionTargets(profile, dateKey) {
  if (!profile || !['male', 'female'].includes(profile.sex)) return null;
  const weight = Number(profile.weight), height = Number(profile.height), age = Number(profile.age);
  const targetWeight = Number(profile.target);
  if (!(weight > 0 && height > 0 && age > 0 && targetWeight > 0)) return null;
  const activity = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725 }[profile.activity] || 1.375;
  const bmr = 10 * weight + 6.25 * height - 5 * age + (profile.sex === 'male' ? 5 : -161);
  const tdee = Math.round(bmr * activity);
  const gain = targetWeight - weight;
  let rate = 0.35;
  if (profile.targetDate && gain > 0 && isDateKey(profile.targetDate)) {
    const availableWeeks = (dateKeyToInstant(profile.targetDate) - dateKeyToInstant(dateKey)) / (7 * 24 * 60 * 60 * 1000);
    if (availableWeeks > 0) rate = gain / availableWeeks;
  }
  rate = Math.min(0.5, Math.max(0.15, rate));
  return { calories: tdee + Math.round(rate * 1100), protein: Math.round(1.8 * weight) };
}

const missingCategory = (id, reason) => ({ id, label: CATEGORY_DEFINITIONS.find((item) => item.id === id).label, source: CATEGORY_DEFINITIONS.find((item) => item.id === id).source, eligible: false, score: null, reason, evidence: null });
const scoredCategory = (id, score, reason, evidence) => ({ id, label: CATEGORY_DEFINITIONS.find((item) => item.id === id).label, source: CATEGORY_DEFINITIONS.find((item) => item.id === id).source, eligible: true, score: round(clamp(score)), reason, evidence });

export function scoreLifeIndexDay({ dateKey, day, habits = [], weekDays = [], screen, expenses = [], timeLogs = [], foodLogs = [], profile = null, settings = {} }) {
  const categories = [];
  const dayMap = new Map(weekDays.map((record) => [record.date, record]));
  if (day) dayMap.set(dateKey, day);
  const weekStart = weekStartDateKey(dateKey);
  const currentWeek = [...dayMap.keys()].filter((date) => weekStartDateKey(date) === weekStart).sort();
  const hasTrackedDay = (record) => record?.habitsTracked === true || (record?.done || []).some((id) => habits.some((habit) => String(habit._id) === String(id)));
  const trackedWeek = currentWeek.filter((date) => hasTrackedDay(dayMap.get(date)));
  const weeklyCheckpoint = trackedWeek[trackedWeek.length - 1] === dateKey;
  const dailyDue = habits.filter((habit) => !['weekly', 'once'].includes(habit.frequency) && habitAppliesOn(habit, dateKey));
  const weeklyDue = weeklyCheckpoint ? habits.filter((habit) => habit.frequency === 'weekly' && habitAppliesOn(habit, dateKey)) : [];
  const dueHabits = [...dailyDue, ...weeklyDue];
  if (!day || !hasTrackedDay(day) || !dueHabits.length) {
    const reason = !day || !hasTrackedDay(day) ? 'Habit completion was not marked as tracked for this date.' : 'No recurring habits were scheduled for this date.';
    categories.push(missingCategory('habits', reason));
  } else {
    const doneIds = new Set((day.done || []).map(String));
    const dailyDone = dailyDue.filter((habit) => doneIds.has(String(habit._id))).length;
    const weeklyDone = weeklyDue.filter((habit) => currentWeek.some((date) => dayMap.get(date)?.done?.some((id) => String(id) === String(habit._id)))).length;
    const done = dailyDone + weeklyDone;
    categories.push(scoredCategory('habits', done / dueHabits.length * 100, 'Completed scheduled recurring habits on this recorded date.', { completed: done, due: dueHabits.length, unit: 'scheduled tasks' }));
  }

  if (!day || !numeric(day.sleep) || Number(day.sleep) > 24) categories.push(missingCategory('sleep', 'No valid sleep duration was recorded.'));
  else categories.push(scoredCategory('sleep', Number(day.sleep) / 8 * 100, 'Linear scale: 8 recorded hours maps to 100; 0 hours maps to 0.', { hours: Number(day.sleep), referenceHours: 8 }));

  const moodScore = { bad: 0, low: 25, okay: 50, good: 75, great: 100 }[day?.mood];
  if (moodScore === undefined) categories.push(missingCategory('mood', 'No recognized mood was recorded.'));
  else categories.push(scoredCategory('mood', moodScore, 'Recorded mood mapped from bad (0) through okay (50) to great (100).', { mood: day.mood }));

  const targets = nutritionTargets(profile, dateKey);
  if (!foodLogs.length) categories.push(missingCategory('nutrition', 'No food was logged for this date.'));
  else if (!targets) categories.push(missingCategory('nutrition', 'Complete your nutrition profile to calculate a personal calorie and protein target.'));
  else {
    const calories = foodLogs.reduce((sum, row) => sum + (Number(row.kcal) || 0), 0);
    const protein = foodLogs.reduce((sum, row) => sum + (Number(row.protein) || 0), 0);
    const adherence = (actual, target) => target > 0 ? clamp(100 - Math.abs(actual - target) / target * 100) : null;
    const calorieScore = adherence(calories, targets.calories);
    const proteinScore = adherence(protein, targets.protein);
    categories.push(scoredCategory('nutrition', (calorieScore + proteinScore) / 2, 'Average of calorie and protein target adherence; values closer to the app plan score higher.', { calories, calorieTarget: targets.calories, protein, proteinTarget: targets.protein, foodEntries: foodLogs.length }));
  }

  if (!screen || !numeric(screen.totalMinutes) || Number(screen.totalMinutes) > 1440) categories.push(missingCategory('phone', 'No valid phone-use total was recorded.'));
  else categories.push(scoredCategory('phone', 100 - Number(screen.totalMinutes) / 720 * 100, 'Linear scale: 0 minutes maps to 100; 12 hours maps to 0.', { minutes: Number(screen.totalMinutes), zeroScoreMinutes: 720 }));

  const budget = Number(settings.budget);
  if (!expenses.length) categories.push(missingCategory('spending', 'No expense was logged for this date.'));
  else if (!(budget > 0)) categories.push(missingCategory('spending', 'Set a daily spending budget to score this category.'));
  else {
    const spent = expenses.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    categories.push(scoredCategory('spending', 100 - spent / budget * 100, 'Linear budget adherence: 0 spend maps to 100; spending at or above the daily budget maps to 0.', { spent: round(spent, 2), dailyBudget: budget }));
  }

  const timeLimit = Number(settings.timeLimit);
  if (!timeLogs.length) categories.push(missingCategory('timeAudit', 'No time-audit entry was recorded for this date.'));
  else if (!(timeLimit > 0)) categories.push(missingCategory('timeAudit', 'Set a daily time-audit limit to score this category.'));
  else {
    const minutes = timeLogs.reduce((sum, row) => sum + (Number(row.minutes) || 0), 0);
    categories.push(scoredCategory('timeAudit', 100 - minutes / timeLimit * 100, 'Linear limit adherence: 0 logged minutes maps to 100; reaching the saved daily limit maps to 0.', { minutes, dailyLimitMinutes: timeLimit, entries: timeLogs.length }));
  }

  const priorities = Array.isArray(day?.priorities) ? day.priorities : [];
  const actionable = priorities.filter((item) => !['moved', 'dropped'].includes(item.status));
  if (!actionable.length) categories.push(missingCategory('productivity', 'No priorities remained on the plan for this date.'));
  else {
    const completed = actionable.filter((item) => item.status === 'done').length;
    categories.push(scoredCategory('productivity', completed / actionable.length * 100, 'Completed priorities divided by priorities kept on the plan; moved and dropped items are excluded.', { completed, planned: actionable.length, moved: priorities.filter((item) => item.status === 'moved').length, dropped: priorities.filter((item) => item.status === 'dropped').length }));
  }

  const eligible = categories.filter((category) => category.eligible);
  const aggregateScore = eligible.length >= LIFE_INDEX_MIN_COVERAGE
    ? round(eligible.reduce((sum, category) => sum + category.score, 0) / eligible.length)
    : null;
  return {
    dateKey,
    categories,
    coverage: eligible.map((category) => category.id),
    eligibleCategoryCount: eligible.length,
    aggregateScore,
    status: aggregateScore === null ? 'insufficient-coverage' : 'valid',
  };
}

export function applyIndexMovement(indexBase, aggregateScore) {
  if (!Number.isFinite(indexBase) || indexBase < 0 || !Number.isFinite(aggregateScore) || aggregateScore < 0 || aggregateScore > 100) {
    throw new Error('Index movement needs a non-negative baseline and an aggregate score from 0 to 100.');
  }
  return round(indexBase * (1 + 0.02 * (aggregateScore - 50) / 50));
}

export function buildDailyIndexHistory(observations, initialValue = LIFE_INDEX_BASE) {
  let lastValidValue = initialValue;
  return [...observations].sort((a, b) => a.dateKey.localeCompare(b.dateKey)).map((observation) => {
    const eligible = observation.eligibleCategoryCount >= LIFE_INDEX_MIN_COVERAGE && Number.isFinite(observation.aggregateScore);
    const indexBase = lastValidValue;
    const indexValue = eligible ? applyIndexMovement(indexBase, observation.aggregateScore) : lastValidValue;
    if (eligible) lastValidValue = indexValue;
    return {
      ...observation,
      indexBase: round(indexBase),
      indexValue: round(indexValue),
      carriedForward: !eligible,
      status: eligible ? 'valid' : 'insufficient-coverage',
      calculationVersion: LIFE_INDEX_VERSION,
    };
  });
}

export function buildDailyCandles(scores, timeframe = '1d') {
  if (!['1d', '1w'].includes(timeframe)) throw new Error('Daily candle timeframe must be 1d or 1w.');
  const daily = [...scores].sort((a, b) => a.dateKey.localeCompare(b.dateKey)).map((score) => ({
    timeframe: '1d', dateKey: score.dateKey, time: dateKeyToInstant(score.dateKey),
    open: Number(score.indexBase), high: Math.max(Number(score.indexBase), Number(score.indexValue)),
    low: Math.min(Number(score.indexBase), Number(score.indexValue)), close: Number(score.indexValue),
    aggregateScore: numeric(score.aggregateScore) ? Number(score.aggregateScore) : null,
    eligibleCategoryCount: Number(score.eligibleCategoryCount) || 0,
    coverage: score.coverage || [], carriedForward: Boolean(score.carriedForward),
    categories: score.categoryScores || [], updatedAt: score.sourceUpdatedAt || score.updatedAt || null, observationCount: 1,
  }));
  if (timeframe === '1d') return daily;
  const grouped = new Map();
  daily.forEach((candle) => {
    const weekStart = weekStartDateKey(candle.dateKey);
    if (!grouped.has(weekStart)) grouped.set(weekStart, []);
    grouped.get(weekStart).push(candle);
  });
  return [...grouped.entries()].map(([dateKey, children]) => ({
    timeframe: '1w', dateKey, time: dateKeyToInstant(dateKey),
    open: children[0].open, high: Math.max(...children.map((candle) => candle.high)),
    low: Math.min(...children.map((candle) => candle.low)), close: children[children.length - 1].close,
    aggregateScore: children[children.length - 1].aggregateScore,
    eligibleCategoryCount: children[children.length - 1].eligibleCategoryCount,
    coverage: children[children.length - 1].coverage, categories: children[children.length - 1].categories,
    carriedForward: children[children.length - 1].carriedForward, updatedAt: children[children.length - 1].updatedAt, observationCount: children.length,
  }));
}

function aggregateSnapshotCandles(snapshots, timeframe) {
  const sorted = [...snapshots].sort((a, b) => new Date(a.bucketStart) - new Date(b.bucketStart));
  if (timeframe === '15m') return sorted.map((snapshot) => ({
    timeframe, time: new Date(snapshot.bucketStart), dateKey: snapshot.dateKey,
    open: Number(snapshot.open ?? snapshot.value), high: Number(snapshot.high ?? snapshot.value),
    low: Number(snapshot.low ?? snapshot.value), close: Number(snapshot.value),
    aggregateScore: numeric(snapshot.score) ? Number(snapshot.score) : null,
    eligibleCategoryCount: Number(snapshot.coverage) || 0, coverage: snapshot.coveredCategories || [],
    categories: snapshot.categoryScores || [], carriedForward: Boolean(snapshot.carriedForward), eventKind: snapshot.eventKind, affectedDate: snapshot.affectedDate, observationCount: Number(snapshot.observationCount) || 1,
  }));
  const grouped = new Map();
  sorted.forEach((snapshot) => {
    const start = bucketStartForTime(snapshot.bucketStart, timeframe);
    const key = start.toISOString();
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(snapshot);
  });
  return [...grouped.entries()].map(([key, children]) => ({
    timeframe, time: new Date(key), dateKey: children[children.length - 1].dateKey,
    open: Number(children[0].open ?? children[0].value),
    high: Math.max(...children.map((child) => Number(child.high ?? child.value))),
    low: Math.min(...children.map((child) => Number(child.low ?? child.value))),
    close: Number(children[children.length - 1].value),
    aggregateScore: numeric(children[children.length - 1].score) ? Number(children[children.length - 1].score) : null,
    eligibleCategoryCount: Number(children[children.length - 1].coverage) || 0,
    coverage: children[children.length - 1].coveredCategories || [],
    categories: children[children.length - 1].categoryScores || [],
    carriedForward: Boolean(children[children.length - 1].carriedForward),
    eventKind: children[children.length - 1].eventKind,
    affectedDate: children[children.length - 1].affectedDate,
    observationCount: children.reduce((sum, child) => sum + (Number(child.observationCount) || 1), 0),
  }));
}

export function buildLifeCandles({ timeframe, dailyScores = [], snapshots = [] }) {
  if (!LIFE_INDEX_TIMEFRAMES.includes(timeframe)) throw new Error('Invalid timeframe.');
  return ['1d', '1w'].includes(timeframe)
    ? buildDailyCandles(dailyScores, timeframe)
    : aggregateSnapshotCandles(snapshots, timeframe);
}

export function calculateEma(candles, period) {
  if (!LIFE_INDEX_EMA_PERIODS.includes(Number(period))) throw new Error('EMA period must be 20, 50, 100, or 200.');
  const size = Number(period);
  const values = Array(candles.length).fill(null);
  if (candles.length < size) return values;
  let previous = candles.slice(0, size).reduce((sum, candle) => sum + Number(candle.close), 0) / size;
  values[size - 1] = round(previous);
  const alpha = 2 / (size + 1);
  for (let index = size; index < candles.length; index += 1) {
    previous = alpha * Number(candles[index].close) + (1 - alpha) * previous;
    values[index] = round(previous);
  }
  return values;
}

export function getLifeIndexCategories() {
  return CATEGORY_DEFINITIONS.map((category) => ({ ...category, weight: 'equal' }));
}
