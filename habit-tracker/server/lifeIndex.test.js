import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyIndexMovement, buildDailyCandles, buildDailyIndexHistory, buildLifeCandles,
  bucketStartForTime, calculateEma, dateKeyInTimeZone, scoreLifeIndexDay,
} from './lifeIndex.js';

const day = { date: '2026-10-26', done: ['daily-1'], mood: 'okay', sleep: 8, priorities: [{ status: 'done' }] };
const dailyHabit = { _id: 'daily-1', frequency: 'daily', startDate: '2026-10-01' };
const baseInput = { dateKey: day.date, day, habits: [dailyHabit], weekDays: [day], screen: { totalMinutes: 0 } };

test('eight eligible categories use equal weight and preserve their evidence', () => {
  const scored = scoreLifeIndexDay({
    ...baseInput,
    habits: [...baseInput.habits, { _id: 'weekly-1', frequency: 'weekly', startDate: '2026-10-01' }],
    expenses: [{ amount: 50 }],
    timeLogs: [{ minutes: 30, category: 'Social media' }],
    foodLogs: [{ kcal: 2200, protein: 90 }],
    profile: { age: 30, sex: 'female', height: 165, weight: 60, target: 62, activity: 'light' },
    settings: { budget: 100, timeLimit: 60 },
  });
  assert.equal(scored.categories.length, 8);
  assert.equal(scored.eligibleCategoryCount, 8);
  assert.equal(scored.status, 'valid');
  assert.ok(Math.abs(scored.aggregateScore - scored.categories.reduce((sum, category) => sum + category.score, 0) / 8) < 0.0001);
  assert.equal(scored.categories.find((category) => category.id === 'spending').score, 50);
  assert.equal(scored.categories.find((category) => category.id === 'timeAudit').score, 50);
  assert.equal(scored.categories.find((category) => category.id === 'mood').score, 50);
});

test('three eligible categories are insufficient while a real zero remains eligible', () => {
  const scored = scoreLifeIndexDay({ ...baseInput, screen: null, day: { ...day, mood: 'bad', priorities: [] } });
  assert.equal(scored.eligibleCategoryCount, 3);
  assert.equal(scored.aggregateScore, null);
  assert.equal(scored.status, 'insufficient-coverage');
  assert.equal(scored.categories.find((category) => category.id === 'mood').score, 0);
  assert.equal(scored.categories.find((category) => category.id === 'mood').eligible, true);
});

test('an absent category is distinct from a neutral score', () => {
  const scored = scoreLifeIndexDay({ ...baseInput, screen: null });
  assert.equal(scored.categories.find((category) => category.id === 'mood').score, 50);
  assert.equal(scored.categories.find((category) => category.id === 'phone').score, null);
  assert.equal(scored.categories.find((category) => category.id === 'phone').eligible, false);
});

test('an unreviewed day is missing habit data, while a confirmed empty day is a real zero', () => {
  const unreviewed = scoreLifeIndexDay({
    ...baseInput,
    day: { date: day.date, done: [], mood: 'good', sleep: 8, priorities: [] },
    weekDays: [{ date: day.date, done: [], mood: 'good', sleep: 8, priorities: [] }],
  });
  assert.equal(unreviewed.categories.find((category) => category.id === 'habits').eligible, false);

  const confirmed = scoreLifeIndexDay({
    ...baseInput,
    day: { date: day.date, done: [], habitsTracked: true, mood: 'good', sleep: 8, priorities: [] },
    weekDays: [{ date: day.date, done: [], habitsTracked: true, mood: 'good', sleep: 8, priorities: [] }],
  });
  assert.equal(confirmed.categories.find((category) => category.id === 'habits').eligible, true);
  assert.equal(confirmed.categories.find((category) => category.id === 'habits').score, 0);
});

test('relative index movement uses the agreed neutral and extreme values', () => {
  assert.equal(applyIndexMovement(100, 0), 98);
  assert.equal(applyIndexMovement(100, 25), 99);
  assert.equal(applyIndexMovement(100, 50), 100);
  assert.equal(applyIndexMovement(100, 75), 101);
  assert.equal(applyIndexMovement(100, 100), 102);
});

test('daily history carries insufficient observations and replays deterministically', () => {
  const observations = [
    { dateKey: '2026-10-25', aggregateScore: null, eligibleCategoryCount: 3, coverage: ['mood'] },
    { dateKey: '2026-10-26', aggregateScore: 75, eligibleCategoryCount: 4, coverage: ['habits', 'sleep', 'mood', 'phone'] },
    { dateKey: '2026-10-29', aggregateScore: null, eligibleCategoryCount: 2, coverage: ['sleep', 'mood'] },
  ];
  const history = buildDailyIndexHistory(observations);
  assert.deepEqual(history.map((row) => row.indexValue), [100, 101, 101]);
  assert.deepEqual(history.map((row) => row.carriedForward), [true, false, true]);
  assert.deepEqual(buildDailyIndexHistory(observations), history);
  assert.equal(buildDailyCandles(history).length, 3); // no candles for the two missing dates
});

test('weekly candles aggregate child OHLC, never average it', () => {
  const scores = [
    { dateKey: '2026-10-26', indexBase: 100, indexValue: 103, aggregateScore: 75, eligibleCategoryCount: 4, coverage: [], categoryScores: [] },
    { dateKey: '2026-10-28', indexBase: 103, indexValue: 99, aggregateScore: 25, eligibleCategoryCount: 4, coverage: [], categoryScores: [] },
    { dateKey: '2026-11-02', indexBase: 99, indexValue: 101, aggregateScore: 75, eligibleCategoryCount: 4, coverage: [], categoryScores: [] },
  ];
  const weekly = buildDailyCandles(scores, '1w');
  assert.equal(weekly.length, 2);
  assert.deepEqual([weekly[0].open, weekly[0].high, weekly[0].low, weekly[0].close], [100, 103, 99, 99]);
});

test('intraday candles use real buckets and aggregate child OHLC', () => {
  const snapshots = [
    { bucketStart: new Date('2026-10-26T03:30:00.000Z'), dateKey: '2026-10-26', open: 100, high: 101, low: 99, value: 101, coverage: 4 },
    { bucketStart: new Date('2026-10-26T03:45:00.000Z'), dateKey: '2026-10-26', open: 101, high: 104, low: 100, value: 103, coverage: 5 },
    { bucketStart: new Date('2026-10-26T04:30:00.000Z'), dateKey: '2026-10-26', open: 103, high: 103, low: 102, value: 102, coverage: 4 },
  ];
  const hourly = buildLifeCandles({ timeframe: '1h', snapshots });
  assert.equal(hourly.length, 2);
  assert.deepEqual([hourly[0].open, hourly[0].high, hourly[0].low, hourly[0].close], [100, 104, 99, 103]);
  assert.equal(buildLifeCandles({ timeframe: '15m', snapshots }).length, 3);
});

test('EMA seeds from the first N-close simple average and warms up honestly', () => {
  const candles = Array.from({ length: 21 }, (_, index) => ({ close: 100 + index }));
  const values = calculateEma(candles, 20);
  assert.equal(values.slice(0, 19).every((value) => value === null), true);
  assert.equal(values[19], 109.5);
  assert.equal(values.length, 21);
  assert.throws(() => calculateEma(candles, 14), /period must be/);
});

test('Asia/Kolkata boundaries are applied consistently for dates and intraday buckets', () => {
  assert.equal(dateKeyInTimeZone('2026-10-26T18:30:00.000Z'), '2026-10-27');
  assert.equal(bucketStartForTime('2026-10-26T04:00:00.000Z', '1h').toISOString(), '2026-10-26T03:30:00.000Z');
});
