import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'node:path';
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url';
import {
  LIFE_INDEX_BASE, LIFE_INDEX_EMA_PERIODS, LIFE_INDEX_MIN_COVERAGE, LIFE_INDEX_TIMEFRAMES, LIFE_INDEX_TIME_ZONE, LIFE_INDEX_VERSION,
  addDateKeyDays, buildDailyIndexHistory, buildLifeCandles, bucketStartForTime,
  calculateEma, dateKeyInTimeZone, dateKeyToInstant, getLifeIndexCategories, isDateKey, scoreLifeIndexDay, weekStartDateKey,
} from './lifeIndex.js';
const JWT_SECRET = process.env.JWT_SECRET;
let databaseConnection;

function explain(e) {
  const m = `${e.message} ${e.cause?.message || ''}`;
  if (/MONGO_URI is missing/i.test(m)) return 'Set MONGO_URI in the Vercel project Environment Variables.';
  if (/bad auth|Authentication failed/i.test(m)) return 'MongoDB rejected the credentials. Check the username, password, and database user permissions.';
  if (/querySrv|ENOTFOUND|ESERVFAIL/i.test(m)) return 'The MongoDB host could not be resolved. Check the Atlas URI and network access.';
  if (/ECONNREFUSED/i.test(m)) return 'MongoDB refused the connection. Check that the cluster is available and network access is allowed.';
  if (/ETIMEDOUT|timed out|MongoServerSelectionError/i.test(m)) return 'MongoDB could not be reached. Check Atlas Network Access and confirm the cluster is running.';
  return 'Check the MongoDB deployment settings and try again.';
}

async function connectDatabase() {
  if (mongoose.connection.readyState === 1) {
    if (databaseConnection) await databaseConnection;
    return;
  }
  if (mongoose.connection.readyState === 0) databaseConnection = null;
  if (!databaseConnection) {
    const uri = process.env.MONGO_URI || (!process.env.VERCEL ? 'mongodb://127.0.0.1:27017/habit-tracker' : '');
    if (!uri) throw new Error('MONGO_URI is missing');
    databaseConnection = mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 }).then(async () => {
      console.log('[db] Connected to database:', mongoose.connection.name);
      await Promise.all([
        Day.syncIndexes(), Setting.syncIndexes(), LifeDailyScore.createIndexes(),
        LifeIndexSnapshot.createIndexes(), LifeIndexState.syncIndexes(), TradingSetup.syncIndexes(),
        TradingTrade.syncIndexes(), WeeklyReview.createIndexes(),
      ]);
    }).catch((error) => {
      databaseConnection = null;
      throw error;
    });
  }
  await databaseConnection;
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '4mb' }));
app.get('/api/health', (req, res) => res.json({
  ok: true,
  databaseConfigured: Boolean(process.env.MONGO_URI || !process.env.VERCEL),
  databaseConnected: mongoose.connection.readyState === 1,
  authenticationConfigured: Boolean(JWT_SECRET),
}));
app.use(async (req, res, next) => {
  try {
    await connectDatabase();
    next();
  } catch (error) {
    console.error('[db] Request connection failed:', error.name, '|', explain(error));
    res.status(503).json({ error: `Database unavailable. ${explain(error)}` });
  }
});
const { Schema } = mongoose;
const owner = { userId: { type: Schema.Types.ObjectId, required: true, index: true } };

const User = mongoose.model('User', new Schema({
  name: { type: String, required: true, trim: true, maxlength: 50 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
}, { timestamps: true }));

const Habit = mongoose.model('Habit', new Schema({
  ...owner,
  name: { type: String, required: true, trim: true, maxlength: 40 },
  icon: { type: String, default: 'target' },
  frequency: { type: String, enum: ['daily', 'weekdays', 'weekly', 'once'], default: 'daily' },
  startDate: { type: String, default: '' },
  endDate: { type: String, default: '' },
  goal: { type: String, default: '' },
  reminder: { type: String, default: '' },
  archivedOn: { type: String, default: '' }, // first date the habit no longer applies; '' = still active
}, { timestamps: true }));

const Goal = mongoose.model('Goal', new Schema({
  ...owner,
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  category: { type: String, default: 'General' },
  target: { type: Number, default: 100, min: 1 },
  current: { type: Number, default: 0, min: 0 },
  unit: { type: String, default: '' },
  startDate: String,
  deadline: String,
  milestones: [{ title: String, done: { type: Boolean, default: false } }],
}, { timestamps: true }));

const daySchema = new Schema({
  ...owner,
  date: { type: String, required: true },
  done: { type: [String], default: [] },
  habitsTracked: { type: Boolean, default: false },
  mood: String,
  sleep: { type: Number, min: 0, max: 24 },
  note: { type: String, default: '' },
  priorities: { type: [{ id: String, title: { type: String, required: true, maxlength: 120 }, status: { type: String, enum: ['planned', 'done', 'moved', 'dropped'], default: 'planned' }, reason: { type: String, default: '', maxlength: 120 } }], default: [], validate: value => value.length <= 3 },
  energy: { type: Number, min: 1, max: 5 },
  focus: { type: Number, min: 1, max: 5 },
  studyOutcome: { type: String, default: '', maxlength: 500 },
  studyNextStep: { type: String, default: '', maxlength: 200 },
});
daySchema.index({ userId: 1, date: 1 }, { unique: true });
daySchema.set('timestamps', true);
const Day = mongoose.model('Day', daySchema);

const weeklyReviewSchema = new Schema({
  ...owner,
  weekStart: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  wins: { type: String, default: '', maxlength: 1000 },
  blockers: { type: String, default: '', maxlength: 1000 },
  experiment: { type: String, default: '', maxlength: 1000 },
}, { timestamps: true });
weeklyReviewSchema.index({ userId: 1, weekStart: 1 }, { unique: true });
const WeeklyReview = mongoose.model('WeeklyReview', weeklyReviewSchema);

const Reflection = mongoose.model('Reflection', new Schema({
  ...owner,
  date: { type: String, required: true },
  hour: { type: Number, min: 0, max: 23 },
  category: { type: String, default: 'Other' },
  trigger: { type: String, default: 'Other' },
  what: { type: String, required: true, trim: true, maxlength: 500 },
  next: { type: String, default: '', maxlength: 300 },
}, { timestamps: true }));

const Expense = mongoose.model('Expense', new Schema({
  ...owner,
  date: { type: String, required: true },
  amount: { type: Number, required: true, min: 0.01, max: 10000000 },
  category: { type: String, default: 'Other' },
  note: { type: String, default: '', maxlength: 100 },
}, { timestamps: true }));

const settingSchema = new Schema({ ...owner, key: { type: String, required: true }, value: Number }, { timestamps: true });
settingSchema.index({ userId: 1, key: 1 }, { unique: true });
const Setting = mongoose.model('Setting', settingSchema);

const lifeIndexSnapshotSchema = new Schema({
  ...owner,
  bucketStart: { type: Date, required: true },
  dateKey: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  value: { type: Number, required: true, min: 0 },
  open: { type: Number, min: 0 },
  high: { type: Number, min: 0 },
  low: { type: Number, min: 0 },
  score: { type: Number, min: 0, max: 100, default: null },
  coverage: { type: Number, min: 0, max: 8, default: 0 },
  coveredCategories: { type: [String], default: [] },
  categoryScores: { type: Schema.Types.Mixed, default: [] },
  carriedForward: { type: Boolean, default: false },
  eventKind: { type: String, default: 'source-change' },
  affectedDate: { type: String, default: null },
  calculationVersion: { type: String, default: 'legacy' },
  observationCount: { type: Number, default: 1, min: 1 },
  mood: { type: String, default: null },
}, { timestamps: true });
lifeIndexSnapshotSchema.index({ userId: 1, bucketStart: 1 }, { unique: true });
lifeIndexSnapshotSchema.index({ userId: 1, calculationVersion: 1, bucketStart: 1 });
const LifeIndexSnapshot = mongoose.model('LifeIndexSnapshot', lifeIndexSnapshotSchema);

const lifeDailyScoreSchema = new Schema({
  ...owner,
  dateKey: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  timestamp: { type: Date, required: true },
  indexBase: { type: Number, required: true, min: 0 },
  indexValue: { type: Number, required: true, min: 0 },
  aggregateScore: { type: Number, min: 0, max: 100, default: null },
  categoryScores: { type: Schema.Types.Mixed, required: true },
  eligibleCategoryCount: { type: Number, required: true, min: 0, max: 8 },
  coverage: { type: [String], default: [] },
  carriedForward: { type: Boolean, default: false },
  status: { type: String, enum: ['valid', 'insufficient-coverage'], required: true },
  calculationVersion: { type: String, required: true },
  sourceUpdatedAt: { type: Date, default: null },
}, { timestamps: true });
lifeDailyScoreSchema.index({ userId: 1, dateKey: 1 }, { unique: true });
lifeDailyScoreSchema.index({ userId: 1, timestamp: 1 });
const LifeDailyScore = mongoose.model('LifeDailyScore', lifeDailyScoreSchema);
const lifeIndexStateSchema = new Schema({
  ...owner,
  userId: { type: Schema.Types.ObjectId, required: true },
  calculationVersion: { type: String, required: true },
  initializedAt: { type: Date, required: true },
  lastRecalculatedAt: { type: Date, required: true },
}, { timestamps: true });
lifeIndexStateSchema.index({ userId: 1 }, { unique: true });
const LifeIndexState = mongoose.model('LifeIndexState', lifeIndexStateSchema);

const seed = [['Workout', 'dumbbell'], ['Coding', 'code'], ['DSA Practice', 'brain'], ['Read 30 Minutes', 'book'],
['Drink Water', 'water'], ['Meditation', 'flower'], ['Sleep 8 Hours', 'moon']];

const wrap = (fn) => async (req, res) => {
  try { res.json(await fn(req, res)); }
  catch (e) { res.status(e.statusCode || 400).json({ error: e.message }); }
};

// ---------- Auth ----------
const sign = (u) => {
  if (!JWT_SECRET) {
    const error = new Error('Set JWT_SECRET in the Vercel project Environment Variables.');
    error.statusCode = 503;
    throw error;
  }
  return jwt.sign({ id: u._id }, JWT_SECRET, { expiresIn: '7d' });
};
const publicUser = (u) => ({ id: u._id, name: u.name, email: u.email });
const auth = (req, res, next) => {
  if (!JWT_SECRET) return res.status(503).json({ error: 'Authentication is not configured. Set JWT_SECRET in the Vercel project Environment Variables.' });
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  try { req.userId = jwt.verify(token, JWT_SECRET).id; next(); }
  catch { res.status(401).json({ error: 'Please log in again.' }); }
};

app.post('/api/auth/signup', wrap(async (req) => {
  if (!JWT_SECRET) {
    const error = new Error('Set JWT_SECRET in the Vercel project Environment Variables.');
    error.statusCode = 503;
    throw error;
  }
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!name) throw new Error('Name is required.');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a valid email address.');
  if (password.length < 8) throw new Error('Password must be at least 8 characters.');
  if (await User.findOne({ email })) throw new Error('An account with this email already exists.');
  const user = await User.create({ name, email, password: await bcrypt.hash(password, 10) });
  await Habit.insertMany(seed.map(([n, icon]) => ({ name: n, icon, userId: user._id })));
  return { token: sign(user), user: publicUser(user) };
}));

app.post('/api/auth/login', wrap(async (req) => {
  if (!JWT_SECRET) {
    const error = new Error('Set JWT_SECRET in the Vercel project Environment Variables.');
    error.statusCode = 503;
    throw error;
  }
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.password))) throw new Error('Incorrect email or password.');
  return { token: sign(user), user: publicUser(user) };
}));

app.get('/api/auth/me', auth, wrap(async (req) => {
  const user = await User.findById(req.userId);
  if (!user) throw new Error('Account not found.');
  return { user: publicUser(user) };
}));
const DeviceKey = mongoose.model('DeviceKey', new Schema({ ...owner, key: { type: String, unique: true } }));
const stSchema = new Schema({
  ...owner, date: { type: String, required: true },
  totalMinutes: { type: Number, min: 0, max: 1440 },
  apps: [{ name: String, pkg: String, minutes: Number }],
});
stSchema.index({ userId: 1, date: 1 }, { unique: true });
const ScreenTime = mongoose.model('ScreenTime', stSchema);

app.post('/api/device/screentime', wrap(async (req) => {
  const dk = await DeviceKey.findOne({ key: String(req.headers['x-device-key'] || '') });
  if (!dk) throw new Error('Invalid device key.');
  const { date, apps } = req.body;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(apps)) throw new Error('Bad payload.');
  const clean = apps.slice(0, 60).map((a) => ({
    name: String(a.name).slice(0, 40), pkg: String(a.pkg).slice(0, 100), minutes: Math.max(0, Math.round(Number(a.minutes) || 0)),
  })).filter((a) => a.minutes > 0);
  const totalMinutes = Math.min(1440, clean.reduce((s, a) => s + a.minutes, 0));
  const screenRecord = await ScreenTime.findOneAndUpdate({ userId: dk.userId, date }, { totalMinutes, apps: clean }, { upsert: true, new: true, runValidators: true });
  await afterLifeIndexSourceChange(dk.userId, screenRecord, 'device-update', null, 'screentime');
  return { ok: true };
}));
// Everything under /api except /api/auth/* requires a valid token.
app.use('/api', (req, res, next) => (req.path.startsWith('/auth/') ? next() : auth(req, res, next)));

// ---------- Per-user data ----------
function crud(path, Model, onDelete, afterChange) {
  app.get(`/api/${path}`, wrap((req) => Model.find({ userId: req.userId }).sort('createdAt')));
  app.post(`/api/${path}`, wrap(async (req) => {
    const created = await Model.create({ ...req.body, userId: req.userId });
    if (afterChange) await afterChange(req.userId, created, 'create', null, path);
    return created;
  }));
  app.put(`/api/${path}/:id`, wrap(async (req) => {
    const previous = afterChange ? await Model.findOne({ _id: req.params.id, userId: req.userId }).lean() : null;
    const updated = await Model.findOneAndUpdate({ _id: req.params.id, userId: req.userId }, { ...req.body, userId: req.userId }, { new: true, runValidators: true });
    if (updated && afterChange) await afterChange(req.userId, updated, 'update', previous, path);
    return updated;
  }));
  app.delete(`/api/${path}/:id`, wrap(async (req) => {
    const deleted = await Model.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (onDelete) await onDelete(req.params.id, req.userId);
    if (deleted && afterChange) await afterChange(req.userId, deleted, 'delete', null, path);
    return { ok: true };
  }));
}

crud('habits', Habit, (id, userId) => Day.updateMany({ userId }, { $pull: { done: id } }), afterLifeIndexSourceChange);
crud('goals', Goal);
crud('reflections', Reflection);
crud('expenses', Expense, null, afterLifeIndexSourceChange);
app.get('/api/screentime', wrap((req) => ScreenTime.find({ userId: req.userId }).sort('date')));
app.get('/api/device/key', wrap(async (req) => {
  const dk = (await DeviceKey.findOne({ userId: req.userId })) || (await DeviceKey.create({ userId: req.userId, key: crypto.randomBytes(24).toString('hex') }));
  return { key: dk.key };
}));
app.post('/api/device/key/reset', wrap((req) =>
  DeviceKey.findOneAndUpdate({ userId: req.userId }, { key: crypto.randomBytes(24).toString('hex') }, { upsert: true, new: true })));
const TimeLog = mongoose.model('TimeLog', new Schema({
  ...owner, date: { type: String, required: true },
  category: { type: String, required: true, maxlength: 40 },
  minutes: { type: Number, required: true, min: 1, max: 720 },
  note: { type: String, default: '', maxlength: 100 },
}, { timestamps: true }));
crud('timelogs', TimeLog, null, afterLifeIndexSourceChange);
const NutritionProfile = mongoose.model('NutritionProfile', new Schema({
  ...owner, age: Number, sex: String, height: Number, weight: Number, target: Number, activity: String, targetDate: String,
}, { timestamps: true }));
const FoodLog = mongoose.model(
  'FoodLog',
  new Schema(
    {
      ...owner,

      date: {
        type: String,
        required: true
      },

      name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 60
      },

      meal: {
        type: String,
        enum: ['Breakfast', 'Lunch', 'Snack', 'Dinner'],
        default: 'Snack'
      },

      qty: {
        type: Number,
        default: 1,
        min: 0.1,
        max: 20
      },

      kcal: {
        type: Number,
        required: true,
        min: 0,
        max: 5000
      },

      protein: {
        type: Number,
        default: 0,
        min: 0,
        max: 300
      },

      carbs: {
        type: Number,
        default: 0,
        min: 0,
        max: 1000
      },

      fat: {
        type: Number,
        default: 0,
        min: 0,
        max: 500
      }
    },
    { timestamps: true }
  )
);
const weightSchema = new Schema({ ...owner, date: { type: String, required: true }, kg: { type: Number, required: true, min: 25, max: 250 } });
weightSchema.index({ userId: 1, date: 1 }, { unique: true });
const WeightLog = mongoose.model('WeightLog', weightSchema);
const Note = mongoose.model('Note', new Schema({
  ...owner,
  title: { type: String, required: true, trim: true, maxlength: 120 },
  type: { type: String, default: 'Personal', trim: true, maxlength: 40 },
  section: { type: String, default: '', trim: true, maxlength: 40 },
  book: { type: String, default: '', maxlength: 120 },
  page: { type: String, default: '', maxlength: 20 },
  content: { type: String, default: '', maxlength: 3500000 },
  format: { type: String, default: 'text' },
  preview: { type: String, default: '', maxlength: 200 },
  summary: { type: String, default: '', maxlength: 1000 },
  pinned: { type: Boolean, default: false },
}, { timestamps: true }));
const Topic = mongoose.model('Topic', new Schema({ ...owner, name: { type: String, required: true, trim: true, maxlength: 40 } }, { timestamps: true }));
app.get('/api/notes', wrap((req) => Note.find({ userId: req.userId }).select('-content').sort('-updatedAt')));
app.get('/api/notes/:id', wrap((req) => Note.findOne({ _id: req.params.id, userId: req.userId })));
crud('notes', Note);
crud('topics', Topic);
crud('foodlogs', FoodLog, null, afterLifeIndexSourceChange);
app.get('/api/nutrition/profile', wrap(async (req) => (await NutritionProfile.findOne({ userId: req.userId })) || null));
app.put('/api/nutrition/profile', wrap((req) =>
  NutritionProfile.findOneAndUpdate({ userId: req.userId }, { ...req.body, userId: req.userId }, { upsert: true, new: true, runValidators: true }).then(async (profile) => {
    await afterLifeIndexSourceChange(req.userId, profile, 'profile-update', null, 'nutrition-profile');
    return profile;
  })));
app.get('/api/weights', wrap((req) => WeightLog.find({ userId: req.userId }).sort('date')));
app.put('/api/weights/:date', wrap((req) =>
  WeightLog.findOneAndUpdate({ userId: req.userId, date: req.params.date }, { kg: Number(req.body.kg) }, { upsert: true, new: true, runValidators: true })));
app.post('/api/ai/progress-analysis', wrap(async (req) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const error = new Error('AI analysis is not configured. Add OPENAI_API_KEY to server/.env and restart the server.');
    error.statusCode = 503;
    throw error;
  }

  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const fromDate = new Date(now);
  fromDate.setUTCDate(fromDate.getUTCDate() - 29);
  const from = fromDate.toISOString().slice(0, 10);
  const range = { userId: req.userId, date: { $gte: from, $lte: to } };
  const [habits, days, reflections, screenRows, foodRows, expenses, timeLogs, nutritionProfile] = await Promise.all([
    Habit.find({ userId: req.userId }).select('name frequency createdAt startDate endDate archivedOn').lean(),
    Day.find(range).select('date done mood sleep note').lean(),
    Reflection.find(range).select('date trigger category hour what next').lean(),
    ScreenTime.find(range).select('date totalMinutes apps').lean(),
    FoodLog.find(range).select('date kcal protein').lean(),
    Expense.find(range).select('date amount category').lean(),
    TimeLog.find(range).select('date minutes category').lean(),
    NutritionProfile.findOne({ userId: req.userId }).select('target weight').lean(),
  ]);

  if (!habits.length) {
    const error = new Error('Create at least one habit before requesting an AI progress analysis.');
    error.statusCode = 422;
    throw error;
  }

  const dayMap = Object.fromEntries(days.map((d) => [d.date, d]));
  const byDate = () => ({});
  const nutritionByDate = byDate();
  foodRows.forEach((f) => {
    const row = nutritionByDate[f.date] ||= { kcal: 0, protein: 0, entries: 0 };
    row.kcal += Number(f.kcal) || 0;
    row.protein += Number(f.protein) || 0;
    row.entries += 1;
  });
  const screenByDate = Object.fromEntries(screenRows.map((r) => [r.date, {
    totalMinutes: Number(r.totalMinutes) || 0,
    topApps: [...(r.apps || [])].sort((a, b) => (b.minutes || 0) - (a.minutes || 0)).slice(0, 3).map(a => ({ name: a.name, minutes: a.minutes })),
  }]));
  const spendByDate = {};
  expenses.forEach(e => { spendByDate[e.date] = (spendByDate[e.date] || 0) + (Number(e.amount) || 0); });
  const manualTimeByDate = {};
  timeLogs.forEach(t => { manualTimeByDate[t.date] = (manualTimeByDate[t.date] || 0) + (Number(t.minutes) || 0); });
  const dayKeys = [];
  for (let d = new Date(`${from}T00:00:00.000Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    dayKeys.push(d.toISOString().slice(0, 10));
  }
  const applies = (h, date) => {
    const created = h.createdAt ? new Date(h.createdAt).toISOString().slice(0, 10) : from;
    const start = h.startDate || created;
    if (date < start || (h.endDate && date > h.endDate) || (h.archivedOn && date >= h.archivedOn)) return false;
    const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    return h.frequency !== 'weekdays' || (weekday !== 0 && weekday !== 6);
  };

  const daily = dayKeys.map((date) => {
    const due = habits.filter((h) => h.frequency !== 'weekly' && applies(h, date));
    const doneIds = new Set((dayMap[date]?.done || []).map(String));
    const hit = due.filter((h) => doneIds.has(String(h._id))).length;
    return {
      date,
      completionPercent: due.length ? Math.round((hit / due.length) * 100) : null,
      completed: hit,
      due: due.length,
      mood: dayMap[date]?.mood || null,
      sleepHours: dayMap[date]?.sleep ?? null,
      phoneMinutes: screenByDate[date]?.totalMinutes ?? null,
      topPhoneApps: screenByDate[date]?.topApps ?? [],
      calories: nutritionByDate[date]?.kcal ?? null,
      proteinGrams: nutritionByDate[date]?.protein ?? null,
      foodEntries: nutritionByDate[date]?.entries ?? 0,
      spending: spendByDate[date] ?? null,
      manualTimeMinutes: manualTimeByDate[date] ?? null,
      reflectionTriggers: reflections.filter(r => r.date === date).map(r => r.trigger).filter(Boolean),
      reflectionCategories: reflections.filter(r => r.date === date).map(r => r.category).filter(Boolean),
      reflectionNotes: reflections.filter(r => r.date === date).map(r => ({ what: r.what, next: r.next })),
      dailyNote: dayMap[date]?.note || '',
    };
  });

  const habitPerformance = habits.map((h) => {
    const start = h.createdAt ? new Date(h.createdAt).toISOString().slice(0, 10) : from;
    const relevant = dayKeys.filter((date) => date >= start && applies(h, date));
    const doneIds = (date) => new Set((dayMap[date]?.done || []).map(String));
    if (h.frequency === 'weekly') {
      const weeks = new Map();
      relevant.forEach((date) => {
        const d = new Date(`${date}T00:00:00.000Z`);
        d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
        const week = d.toISOString().slice(0, 10);
        weeks.set(week, (weeks.get(week) || false) || doneIds(date).has(String(h._id)));
      });
      const hit = [...weeks.values()].filter(Boolean).length;
      return { name: h.name, frequency: h.frequency, completed: hit, opportunities: weeks.size, completionPercent: weeks.size ? Math.round(hit / weeks.size * 100) : null };
    }
    const hit = relevant.filter((date) => doneIds(date).has(String(h._id))).length;
    return { name: h.name, frequency: h.frequency, completed: hit, opportunities: relevant.length, completionPercent: relevant.length ? Math.round(hit / relevant.length * 100) : null };
  });

  const validDays = daily.filter((d) => d.completionPercent !== null);
  const average = (values) => values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
  const sleepGroups = { under7: [], sevenOrMore: [] };
  validDays.forEach((d) => {
    if (d.sleepHours == null) return;
    (d.sleepHours < 7 ? sleepGroups.under7 : sleepGroups.sevenOrMore).push(d.completionPercent);
  });
  const moodGroups = { positive: [], low: [] };
  validDays.forEach((d) => {
    if (['great', 'good'].includes(d.mood)) moodGroups.positive.push(d.completionPercent);
    if (['low', 'bad'].includes(d.mood)) moodGroups.low.push(d.completionPercent);
  });
  const counts = (values) => values.reduce((out, value) => { const k = value || 'Other'; out[k] = (out[k] || 0) + 1; return out; }, {});
  const weekly = [];
  for (let i = 0; i < validDays.length; i += 7) {
    const chunk = validDays.slice(i, i + 7);
    if (chunk.length) weekly.push({ from: chunk[0].date, to: chunk[chunk.length - 1].date, averageCompletionPercent: average(chunk.map((d) => d.completionPercent)), daysTracked: chunk.length });
  }

  const evidence = {
    period: { from, to },
    trackedDays: validDays.length,
    averageDailyCompletionPercent: average(validDays.map((d) => d.completionPercent)),
    dailyCompletionByDate: daily,
    habitPerformance,
    weeklyTrend: weekly,
    sleepComparison: { under7HoursAverageCompletionPercent: average(sleepGroups.under7), under7HoursDays: sleepGroups.under7.length, sevenOrMoreHoursAverageCompletionPercent: average(sleepGroups.sevenOrMore), sevenOrMoreHoursDays: sleepGroups.sevenOrMore.length },
    moodComparison: { positiveMoodAverageCompletionPercent: average(moodGroups.positive), positiveMoodDays: moodGroups.positive.length, lowMoodAverageCompletionPercent: average(moodGroups.low), lowMoodDays: moodGroups.low.length },
    reflectionCount: reflections.length,
    reflectionTriggers: counts(reflections.map((r) => r.trigger)),
    reflectionCategories: counts(reflections.map((r) => r.category)),
    screenTime: {
      daysWithData: screenRows.length,
      averageMinutesOnRecordedDays: screenRows.length ? Math.round(screenRows.reduce((s, r) => s + (Number(r.totalMinutes) || 0), 0) / screenRows.length) : null,
      mostUsedApps: Object.entries(screenRows.reduce((out, row) => { (row.apps || []).forEach(app => { out[app.name] = (out[app.name] || 0) + (Number(app.minutes) || 0); }); return out; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, minutes]) => ({ name, minutes })),
    },
    nutrition: {
      daysWithFoodLogged: Object.keys(nutritionByDate).length,
      averageCaloriesOnLoggedDays: Object.keys(nutritionByDate).length ? Math.round(Object.values(nutritionByDate).reduce((s, r) => s + r.kcal, 0) / Object.keys(nutritionByDate).length) : null,
      averageProteinGramsOnLoggedDays: Object.keys(nutritionByDate).length ? Math.round(Object.values(nutritionByDate).reduce((s, r) => s + r.protein, 0) / Object.keys(nutritionByDate).length) : null,
      configuredTargetCalories: nutritionProfile?.target ?? null,
    },
    spending: { total: expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0), entries: expenses.length, categories: counts(expenses.map(e => e.category)) },
    manualTime: { totalMinutes: timeLogs.reduce((s, t) => s + (Number(t.minutes) || 0), 0), entries: timeLogs.length, categories: counts(timeLogs.map(t => t.category)) },
  };

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      temperature: 0.3,
      messages: [
        { role: 'system', content: 'You are a careful habit-progress analyst. Analyze only the supplied data. Connect daily habits, mood, sleep, actual Android screen time and top apps, nutrition, spending, manual time logs, and reflection triggers/notes when the same-date evidence supports a connection. Do not claim correlation proves causation. Do not invent missing evidence or treat missing data as zero. If data is sparse, say so. Include a plain-language explanation of what happened, evidence, confidence, limitations, and a practical recommendation in each pattern. Return valid JSON with keys: summary (string), patterns (array of objects with title, evidence, recommendation, confidence where confidence is low/moderate/high), and nextWeekPlan (array of 3 short actionable strings). Be supportive but direct. Avoid medical diagnoses.' },
        { role: 'user', content: `Analyze this user's habit progress for ${from} through ${to}. Provide a clear, user-friendly progress report. Prioritize meaningful connections across daily records. State sample sizes, explain missing data, and give three actionable next-week steps. Data:\n${JSON.stringify(evidence)}` },
      ],
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('[ai] OpenAI request failed:', response.status, result.error?.message || 'Unknown error');
    const error = new Error(response.status === 429 ? 'AI usage limit reached. Please try again later.' : 'The AI analysis request failed. Check the server configuration and try again.');
    error.statusCode = response.status === 429 ? 429 : 502;
    throw error;
  }
  let analysis;
  try { analysis = JSON.parse(result.choices?.[0]?.message?.content || '{}'); }
  catch { throw new Error('AI returned an invalid analysis. Please try again.'); }
  return { period: { from, to }, trackedDays: validDays.length, analysis };
}));
app.get('/api/days', wrap((req) => Day.find({ userId: req.userId })));
app.put('/api/days/:date', wrap(async (req) => {
  if (!isDateKey(req.params.date)) throw new Error('Invalid date');
  const { done, habitsTracked, mood, sleep, note, priorities, energy, focus, studyOutcome, studyNextStep } = req.body;
  const set = Object.fromEntries(Object.entries({ done, habitsTracked, mood, sleep, note, priorities, energy, focus, studyOutcome, studyNextStep }).filter(([, v]) => v !== undefined));
  const day = await Day.findOneAndUpdate({ userId: req.userId, date: req.params.date }, { $set: set }, { upsert: true, new: true, runValidators: true });
  if (['done', 'habitsTracked', 'mood', 'sleep', 'priorities'].some((field) => set[field] !== undefined)) await afterLifeIndexSourceChange(req.userId, day, 'day-update', null, 'day');
  return day;
}));
app.get('/api/weekly-reviews', wrap((req) => WeeklyReview.find({ userId: req.userId }).sort({ weekStart: -1 }).lean()));
app.put('/api/weekly-reviews/:weekStart', wrap((req) => {
  const { weekStart } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) throw new Error('Week start must be a date in YYYY-MM-DD format.');
  const fields = ['wins', 'blockers', 'experiment'];
  const values = Object.fromEntries(fields.map(field => [field, String(req.body[field] || '').trim().slice(0, 1000)]));
  return WeeklyReview.findOneAndUpdate(
    { userId: req.userId, weekStart },
    { $set: values, $setOnInsert: { userId: req.userId, weekStart } },
    { upsert: true, new: true, runValidators: true }
  ).lean();
}));

app.get('/api/settings', wrap(async (req) => Object.fromEntries((await Setting.find({ userId: req.userId })).map((s) => [s.key, s.value]))));
app.put('/api/settings/:key', wrap(async (req) => {
  const value = Number(req.body.value);
  if (!(value >= 0)) throw new Error('Invalid value');
  const setting = await Setting.findOneAndUpdate({ userId: req.userId, key: req.params.key }, { value }, { upsert: true, new: true, runValidators: true });
  if (['budget', 'timeLimit'].includes(req.params.key)) await afterLifeIndexSourceChange(req.userId, setting, 'setting-update', null, 'setting');
  return { ok: true };
}));

const lifeIndexQueues = new Map();
const lifeIndexBackfills = new Map();

async function afterLifeIndexSourceChange(userId, record, operation = 'update', previous = null, source = 'source') {
  const todayKey = dateKeyInTimeZone(new Date(), LIFE_INDEX_TIME_ZONE);
  const createdDates = [record?.createdAt, previous?.createdAt].filter(Boolean).map((value) => dateKeyInTimeZone(value, LIFE_INDEX_TIME_ZONE));
  const candidates = [record?.date, record?.startDate, record?.endDate, record?.archivedOn, previous?.startDate, previous?.endDate, previous?.archivedOn, ...createdDates]
    .filter(isDateKey)
    .sort();
  const affectedDate = candidates[0] || todayKey;
  const globalRecalculation = ['nutrition-profile', 'setting'].includes(source);
  const eventKind = affectedDate < todayKey || globalRecalculation ? 'historical-correction' : `${source}-${operation}`;
  return enqueueLifeIndexRebuild(String(userId), { eventKind, affectedDate, fromDate: globalRecalculation ? '0000-01-01' : weekStartDateKey(affectedDate) });
}

function enqueueLifeIndexRebuild(userId, event, options = {}) {
  const previous = lifeIndexQueues.get(userId) || Promise.resolve();
  const current = previous.catch(() => {}).then(() => rebuildLifeIndexForUser(userId, event, options));
  lifeIndexQueues.set(userId, current);
  return current.finally(() => {
    if (lifeIndexQueues.get(userId) === current) lifeIndexQueues.delete(userId);
  });
}

async function rebuildLifeIndexForUser(userId, event, { recordSnapshot = true } = {}) {
  const ownerQuery = { userId };
  const fromDate = event.fromDate || '0000-01-01';
  const sourceQuery = { ...ownerQuery, date: { $gte: fromDate } };
  const [habits, days, screenRows, expenses, timeLogs, foodLogs, profile, settingRows] = await Promise.all([
    Habit.find(ownerQuery).select('_id frequency createdAt startDate endDate archivedOn').lean(),
    Day.find(sourceQuery).select('date done habitsTracked mood sleep priorities updatedAt').sort({ date: 1 }).lean(),
    ScreenTime.find(sourceQuery).select('date totalMinutes updatedAt').lean(),
    Expense.find(sourceQuery).select('date amount updatedAt').lean(),
    TimeLog.find(sourceQuery).select('date minutes category updatedAt').lean(),
    FoodLog.find(sourceQuery).select('date kcal protein updatedAt').lean(),
    NutritionProfile.findOne(ownerQuery).select('age sex height weight target activity targetDate updatedAt').lean(),
    Setting.find({ ...ownerQuery, key: { $in: ['budget', 'timeLimit'] } }).select('key value updatedAt').lean(),
  ]);

  const daysByDate = new Map(days.map((row) => [row.date, row]));
  const settings = Object.fromEntries(settingRows.map((row) => [row.key, Number(row.value)]));
  const grouped = (rows) => rows.reduce((map, row) => {
    if (!isDateKey(row.date)) return map;
    if (!map.has(row.date)) map.set(row.date, []);
    map.get(row.date).push(row);
    return map;
  }, new Map());
  const screenByDate = new Map(screenRows.filter((row) => isDateKey(row.date)).map((row) => [row.date, row]));
  const expensesByDate = grouped(expenses);
  const timeByDate = grouped(timeLogs);
  const foodByDate = grouped(foodLogs);
  const observedDates = new Set([
    ...days.map((row) => row.date), ...screenRows.map((row) => row.date),
    ...expenses.map((row) => row.date), ...timeLogs.map((row) => row.date), ...foodLogs.map((row) => row.date),
  ].filter(isDateKey));

  const rawHistory = [...observedDates].sort().flatMap((dateKey) => {
    const weekStart = weekStartDateKey(dateKey);
    const weekDays = days.filter((row) => isDateKey(row.date) && weekStartDateKey(row.date) === weekStart);
    const observation = scoreLifeIndexDay({
      dateKey,
      day: daysByDate.get(dateKey),
      habits,
      weekDays,
      screen: screenByDate.get(dateKey),
      expenses: expensesByDate.get(dateKey) || [],
      timeLogs: timeByDate.get(dateKey) || [],
      foodLogs: foodByDate.get(dateKey) || [],
      profile,
      settings,
    });
    if (!observation.eligibleCategoryCount) return [];
    const daySources = [daysByDate.get(dateKey), screenByDate.get(dateKey), ...(expensesByDate.get(dateKey) || []), ...(timeByDate.get(dateKey) || []), ...(foodByDate.get(dateKey) || [])].filter(Boolean);
    const sourceUpdatedAt = [...daySources, profile, ...settingRows].filter(Boolean).map((row) => row.updatedAt).filter(Boolean).sort((a, b) => new Date(b) - new Date(a))[0] || null;
    return [{ ...observation, sourceUpdatedAt }];
  });
  const previousScore = fromDate > '0000-01-01'
    ? await LifeDailyScore.findOne({ userId, calculationVersion: LIFE_INDEX_VERSION, dateKey: { $lt: fromDate } }).sort({ dateKey: -1 }).lean()
    : null;
  const history = buildDailyIndexHistory(rawHistory, previousScore?.indexValue ?? LIFE_INDEX_BASE);
  const keys = history.map((row) => row.dateKey);
  if (history.length) {
    await LifeDailyScore.bulkWrite(history.map((row) => ({
      updateOne: {
        filter: { userId, dateKey: row.dateKey },
        update: { $set: {
          userId,
          dateKey: row.dateKey,
          timestamp: dateKeyToInstant(row.dateKey),
          indexBase: row.indexBase,
          indexValue: row.indexValue,
          aggregateScore: row.aggregateScore,
          categoryScores: row.categories,
          eligibleCategoryCount: row.eligibleCategoryCount,
          coverage: row.coverage,
          carriedForward: row.carriedForward,
          status: row.status,
          calculationVersion: LIFE_INDEX_VERSION,
          sourceUpdatedAt: row.sourceUpdatedAt,
        } },
        upsert: true,
      },
    })), { ordered: true });
  }
  await LifeDailyScore.deleteMany({ userId, dateKey: { $gte: fromDate, ...(keys.length ? { $nin: keys } : {}) } });

  const now = new Date();
  if (!recordSnapshot) {
    await LifeIndexState.findOneAndUpdate(
      { userId },
      { $set: { calculationVersion: LIFE_INDEX_VERSION, lastRecalculatedAt: now }, $setOnInsert: { userId, initializedAt: now } },
      { upsert: true, new: true, runValidators: true }
    );
    return { observations: history.length, current: history[history.length - 1] || previousScore || null };
  }

  const latest = history[history.length - 1] || previousScore || await LifeDailyScore.findOne({ userId, calculationVersion: LIFE_INDEX_VERSION }).sort({ dateKey: -1 }).lean();
  const bucketStart = bucketStartForTime(now, '15m');
  const dateKey = dateKeyInTimeZone(now, LIFE_INDEX_TIME_ZONE);
  const value = latest?.indexValue ?? LIFE_INDEX_BASE;
  const latestCategories = latest?.categories ?? latest?.categoryScores ?? [];
  const latestCoverage = latest?.coverage ?? [];
  const priorBucket = await LifeIndexSnapshot.findOne({ userId, bucketStart, calculationVersion: LIFE_INDEX_VERSION }).lean();
  // Remove a legacy client-authored bucket on collision; its values were not backend-calculated.
  await LifeIndexSnapshot.deleteMany({ userId, bucketStart, calculationVersion: { $ne: LIFE_INDEX_VERSION } });
  await LifeIndexSnapshot.findOneAndUpdate(
    { userId, bucketStart, calculationVersion: LIFE_INDEX_VERSION },
    {
      $set: {
        dateKey, value, score: latest?.aggregateScore ?? null,
        coverage: latest?.eligibleCategoryCount ?? 0, coveredCategories: latestCoverage,
        categoryScores: latestCategories, carriedForward: latest?.carriedForward ?? true,
        eventKind: event.eventKind, affectedDate: event.affectedDate, calculationVersion: LIFE_INDEX_VERSION,
        observationCount: (priorBucket?.observationCount || 0) + 1,
      },
      $setOnInsert: { userId, bucketStart, open: priorBucket?.open ?? value },
      $max: { high: value },
      $min: { low: value },
    },
    { upsert: true, new: true, runValidators: true }
  );
  await LifeIndexState.findOneAndUpdate(
    { userId },
    { $set: { calculationVersion: LIFE_INDEX_VERSION, lastRecalculatedAt: now }, $setOnInsert: { userId, initializedAt: now } },
    { upsert: true, new: true, runValidators: true }
  );
  return { current: latest, snapshotAt: bucketStart };
}

async function ensureLifeIndexInitialized(userId) {
  const userKey = String(userId);
  const pending = lifeIndexBackfills.get(userKey);
  if (pending) return pending;
  const state = await LifeIndexState.findOne({ userId }).select('calculationVersion').lean();
  if (!state || state.calculationVersion !== LIFE_INDEX_VERSION) {
    const queuedBackfill = lifeIndexBackfills.get(userKey);
    if (queuedBackfill) return queuedBackfill;
    const backfill = enqueueLifeIndexRebuild(userKey, { eventKind: 'initial-backfill', affectedDate: null, fromDate: '0000-01-01' }, { recordSnapshot: false });
    lifeIndexBackfills.set(userKey, backfill);
    try { await backfill; }
    finally { if (lifeIndexBackfills.get(userKey) === backfill) lifeIndexBackfills.delete(userKey); }
  }
}

function parseLifeIndexRange(query) {
  const from = query.from === undefined ? null : String(query.from);
  const to = query.to === undefined ? null : String(query.to);
  if ((from && !isDateKey(from)) || (to && !isDateKey(to))) throw new Error('from and to must be valid YYYY-MM-DD dates.');
  if (from && to && from > to) throw new Error('from must be on or before to.');
  return { from, to };
}

async function loadLifeIndexCandles(userId, timeframe, range) {
  if (!LIFE_INDEX_TIMEFRAMES.includes(timeframe)) throw new Error(`timeframe must be one of ${LIFE_INDEX_TIMEFRAMES.join(', ')}.`);
  if (['1d', '1w'].includes(timeframe)) {
    const query = { userId, calculationVersion: LIFE_INDEX_VERSION };
    if (range.from || range.to) query.dateKey = { ...(range.from ? { $gte: range.from } : {}), ...(range.to ? { $lte: range.to } : {}) };
    const dailyScores = await LifeDailyScore.find(query).sort({ dateKey: 1 }).lean();
    return buildLifeCandles({ timeframe, dailyScores });
  }
  const query = { userId, calculationVersion: LIFE_INDEX_VERSION };
  if (range.from || range.to) {
    query.bucketStart = {
      ...(range.from ? { $gte: dateKeyToInstant(range.from) } : {}),
      ...(range.to ? { $lt: dateKeyToInstant(addDateKeyDays(range.to, 1)) } : {}),
    };
  }
  const snapshots = await LifeIndexSnapshot.find(query).sort({ bucketStart: 1 }).lean();
  return buildLifeCandles({ timeframe, snapshots });
}

app.get('/api/life-index/current', wrap(async (req) => {
  await ensureLifeIndexInitialized(req.userId);
  const latest = await LifeDailyScore.findOne({ userId: req.userId, calculationVersion: LIFE_INDEX_VERSION }).sort({ dateKey: -1 }).lean();
  const latestValid = await LifeDailyScore.findOne({ userId: req.userId, calculationVersion: LIFE_INDEX_VERSION, status: 'valid' }).sort({ dateKey: -1 }).select('dateKey indexValue aggregateScore updatedAt').lean();
  return {
    indexValue: latest?.indexValue ?? LIFE_INDEX_BASE,
    indexBase: latest?.indexBase ?? LIFE_INDEX_BASE,
    dateKey: latest?.dateKey ?? null,
    aggregateScore: latest?.aggregateScore ?? null,
    eligibleCategoryCount: latest?.eligibleCategoryCount ?? 0,
    minimumCoverage: LIFE_INDEX_MIN_COVERAGE,
    coverage: latest?.coverage ?? [],
    categories: latest?.categoryScores ?? getLifeIndexCategories().map((category) => ({ ...category, eligible: false, score: null, reason: 'No recorded observation yet.', evidence: null })),
    carriedForward: latest?.carriedForward ?? false,
    status: latest?.status ?? 'no-data',
    latestValid: latestValid ? { ...latestValid, indexValue: latestValid.indexValue, aggregateScore: latestValid.aggregateScore } : null,
    updatedAt: latest?.sourceUpdatedAt ?? latest?.updatedAt ?? latest?.timestamp ?? null,
    timeZone: LIFE_INDEX_TIME_ZONE,
  };
}));

app.get('/api/life-index/history', wrap(async (req) => {
  await ensureLifeIndexInitialized(req.userId);
  const range = parseLifeIndexRange(req.query);
  const query = { userId: req.userId, calculationVersion: LIFE_INDEX_VERSION };
  if (range.from || range.to) query.dateKey = { ...(range.from ? { $gte: range.from } : {}), ...(range.to ? { $lte: range.to } : {}) };
  return LifeDailyScore.find(query).sort({ dateKey: 1 }).lean();
}));

app.get('/api/life-index/categories', wrap(async (req) => {
  await ensureLifeIndexInitialized(req.userId);
  const dateKey = req.query.date === undefined ? dateKeyInTimeZone(new Date(), LIFE_INDEX_TIME_ZONE) : String(req.query.date);
  if (!isDateKey(dateKey)) throw new Error('date must be a valid YYYY-MM-DD value.');
  const score = await LifeDailyScore.findOne({ userId: req.userId, dateKey, calculationVersion: LIFE_INDEX_VERSION }).lean();
  const categories = score?.categoryScores || getLifeIndexCategories().map((category) => ({ ...category, eligible: false, score: null, reason: 'No recorded observation for this date.', evidence: null }));
  return { dateKey, indexValue: score?.indexValue ?? null, aggregateScore: score?.aggregateScore ?? null, eligibleCategoryCount: score?.eligibleCategoryCount ?? 0, minimumCoverage: LIFE_INDEX_MIN_COVERAGE, carriedForward: score?.carriedForward ?? false, categories };
}));

app.get('/api/life-index/candles', wrap(async (req) => {
  await ensureLifeIndexInitialized(req.userId);
  const timeframe = String(req.query.timeframe || '1d');
  const candles = await loadLifeIndexCandles(req.userId, timeframe, parseLifeIndexRange(req.query));
  return { timeframe, timeZone: LIFE_INDEX_TIME_ZONE, candles };
}));

app.get('/api/life-index/ema', wrap(async (req) => {
  await ensureLifeIndexInitialized(req.userId);
  const timeframe = String(req.query.timeframe || '1d');
  const period = Number(req.query.period);
  if (!LIFE_INDEX_EMA_PERIODS.includes(period)) throw new Error(`period must be one of ${LIFE_INDEX_EMA_PERIODS.join(', ')}.`);
  const candles = await loadLifeIndexCandles(req.userId, timeframe, parseLifeIndexRange(req.query));
  const values = calculateEma(candles, period);
  return {
    timeframe, period, timeZone: LIFE_INDEX_TIME_ZONE,
    initialization: 'Simple average of the first N closes, then recursive EMA with alpha 2/(N+1).',
    points: candles.map((candle, index) => ({ time: candle.time, dateKey: candle.dateKey, close: candle.close, value: values[index] })),
  };
}));

app.get('/api/life-index/snapshots', wrap(async (req) => {
  await ensureLifeIndexInitialized(req.userId);
  return LifeIndexSnapshot.find({ userId: req.userId, calculationVersion: LIFE_INDEX_VERSION }).sort({ bucketStart: 1 }).lean();
}));
app.post('/api/life-index/recalculate', wrap(async (req) => {
  const result = await enqueueLifeIndexRebuild(String(req.userId), { eventKind: 'manual-recalculation', affectedDate: null, fromDate: '0000-01-01' });
  return { ok: true, observations: result.current ? (await LifeDailyScore.countDocuments({ userId: req.userId, calculationVersion: LIFE_INDEX_VERSION })) : 0, current: result.current ? { dateKey: result.current.dateKey, indexValue: result.current.indexValue, status: result.current.status } : { dateKey: null, indexValue: LIFE_INDEX_BASE, status: 'no-data' } };
}));

app.get('/api/report', wrap(async (req) => {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const { from, to } = req.query;
  if (!re.test(from) || !re.test(to)) throw new Error('from and to must be YYYY-MM-DD');
  const q = { userId: req.userId, date: { $gte: from, $lte: to } };
  const [exp, logs, scr, food] = await Promise.all([
    Expense.find(q).select('date amount').lean(),
    TimeLog.find(q).select('date minutes').lean(),
    ScreenTime.find(q).select('date totalMinutes').lean(),
    FoodLog.find(q).select('date kcal protein').lean(),
  ]);
  const out = {};
  const row = (d) => (out[d] ||= {});
  exp.forEach((e) => { const r = row(e.date); r.spend = (r.spend || 0) + e.amount; });
  logs.forEach((l) => { const r = row(l.date); r.wasted = (r.wasted || 0) + l.minutes; });
  scr.forEach((s) => { row(s.date).screen = s.totalMinutes; });
  food.forEach((f) => { const r = row(f.date); r.kcal = (r.kcal || 0) + f.kcal; r.protein = (r.protein || 0) + (f.protein || 0); });
  return out;
}));
app.get('/api/export', wrap(async (req) => {
  const names = ['Habit', 'Goal', 'Day', 'Reflection', 'Expense', 'Setting', 'ScreenTime',
    'TimeLog', 'NutritionProfile', 'FoodLog', 'WeightLog', 'Note', 'WeeklyReview', 'LifeDailyScore', 'LifeIndexSnapshot', 'TradingSetup', 'TradingTrade'];
  const user = await User.findById(req.userId).select('name email createdAt').lean();
  const data = {};
  for (const n of names) {
    const Model = mongoose.models[n]; // skips a model you haven't added, e.g. Note
    if (Model) data[n] = await Model.find({ userId: req.userId }).lean();
  }
  return { exportedAt: new Date().toISOString(), user, data };
}));

// ---------- Trading journal ----------
const tradingSetupSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    required: true,
  },
  pairs: {
    type: [String],
    default: [],
  },
}, { timestamps: true });

tradingSetupSchema.index({ userId: 1 }, { unique: true });

const TradingSetup = mongoose.model(
  'TradingSetup',
  tradingSetupSchema
);
const tradeSchema = new Schema({
  ...owner,
  pair: { type: String, required: true, trim: true, uppercase: true, maxlength: 30 },
  direction: { type: String, enum: ['Long', 'Short'], default: 'Long' },
  entry: { type: Number, required: true, min: 0 }, exit: { type: Number, default: null, min: 0 },
  stopLoss: { type: Number, default: null }, takeProfit: { type: Number, default: null },
  capitalUsed: { type: Number, default: 0, min: 0 }, riskAmount: { type: Number, default: 0, min: 0 },
  quantity: { type: Number, default: 0, min: 0 }, leverage: { type: Number, default: 1, min: 1 }, fees: { type: Number, default: 0, min: 0 },
  contractMultiplier: { type: Number, default: null, min: 0 },
  brokerPnl: { type: Number, default: null },
  pnl: { type: Number, default: null },
  pnlStatus: { type: String, enum: ['broker', 'calculated', 'unverified'], default: 'unverified' },
  result: { type: String, enum: ['Open', 'Win', 'Loss', 'Break-even'], default: 'Open' },
  setup: { type: String, default: '' }, emotionBefore: { type: String, default: 'Calm' }, emotionAfter: { type: String, default: 'Calm' },
  mistake: { type: String, default: '' }, lesson: { type: String, default: '' }, notes: { type: String, default: '' },
  openedAt: { type: String, default: '' }, closedAt: { type: String, default: '' },
}, { timestamps: true });
tradeSchema.index({ userId: 1, openedAt: -1 });
const TradingTrade = mongoose.model('TradingTrade', tradeSchema);
const TRADE_FIELDS = ['pair', 'direction', 'entry', 'exit', 'stopLoss', 'takeProfit', 'capitalUsed', 'riskAmount', 'quantity', 'leverage', 'fees', 'contractMultiplier', 'brokerPnl', 'result', 'setup', 'emotionBefore', 'emotionAfter', 'mistake', 'lesson', 'notes', 'openedAt', 'closedAt'];
const NUMERIC = ['entry', 'exit', 'stopLoss', 'takeProfit', 'capitalUsed', 'riskAmount', 'quantity', 'leverage', 'fees', 'contractMultiplier', 'brokerPnl'];
const toNum = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const fail = (msg) => { const e = new Error(msg); e.statusCode = 400; throw e; };

function pickTrade(body) {
  const t = {};
  for (const k of TRADE_FIELDS) if (body[k] !== undefined) t[k] = NUMERIC.includes(k) ? toNum(body[k]) : body[k];
  for (const k of ['capitalUsed', 'riskAmount', 'quantity', 'fees']) if (t[k] === null) t[k] = 0;
  if (t.leverage === null) t.leverage = 1;
  return t;
}

function validateTrade(t) {
  const short = t.direction === 'Short';
  if (!(t.entry > 0)) fail('Entry price must be greater than 0.');
  if (t.exit != null && !(t.exit > 0)) fail('Exit price must be greater than 0.');
  if (t.contractMultiplier != null && !(t.contractMultiplier > 0)) fail('Contract multiplier must be greater than 0, or left blank.');
  if (t.leverage < 1) fail('Leverage must be at least 1.');
  if (t.stopLoss != null && (short ? t.stopLoss <= t.entry : t.stopLoss >= t.entry))
    fail(`For a ${t.direction} trade the stop-loss must be ${short ? 'above' : 'below'} the entry price.`);
  if (t.takeProfit != null && (short ? t.takeProfit >= t.entry : t.takeProfit <= t.entry))
    fail(`For a ${t.direction} trade the target must be ${short ? 'below' : 'above'} the entry price.`);
  if (t.openedAt && t.closedAt && new Date(t.closedAt) < new Date(t.openedAt)) fail('Exit time cannot be before entry time.');
}

// Net P/L after fees. Broker P/L wins; otherwise calculate only with a verified multiplier. Never guess.
function derivePnl(t) {
  const exit = toNum(t.exit), qty = toNum(t.quantity), mult = toNum(t.contractMultiplier);
  const broker = toNum(t.brokerPnl), fees = toNum(t.fees) ?? 0;
  const closed = exit !== null || !!t.closedAt;
  if (!closed) return { pnl: null, pnlStatus: 'unverified', result: 'Open' };

  let net = null, pnlStatus = 'unverified';
  if (broker !== null) { net = broker; pnlStatus = 'broker'; }
  else if (exit !== null && qty > 0 && mult > 0) {
    const gross = (t.direction === 'Short' ? t.entry - exit : exit - t.entry) * qty * mult;
    net = gross - fees; pnlStatus = 'calculated';
  }
  if (net === null) return { pnl: null, pnlStatus, result: t.result && t.result !== 'Open' ? t.result : 'Open' };

  const r = Math.round(net * 100) / 100;
  return { pnl: r, pnlStatus, result: r > 0 ? 'Win' : r < 0 ? 'Loss' : 'Break-even' };
}
app.get('/api/trading/setup', wrap(async (req) => {
  const row = await TradingSetup.findOne({ userId: req.userId }).lean();
  return { pairs: row?.pairs || [] };
}));
app.put('/api/trading/setup', wrap(async (req) => {
  const pairs = [...new Set((Array.isArray(req.body.pairs) ? req.body.pairs : []).map(p => String(p).trim().toUpperCase()).filter(Boolean))].slice(0, 100);
  return TradingSetup.findOneAndUpdate({ userId: req.userId }, { $set: { pairs }, $setOnInsert: { userId: req.userId } }, { upsert: true, new: true, runValidators: true }).lean();
}));
app.get('/api/trading/trades', wrap((req) => TradingTrade.find({ userId: req.userId }).sort({ openedAt: -1, createdAt: -1 }).lean()));
app.post('/api/trading/trades', wrap(async (req) => {
  const t = pickTrade(req.body);
  t.pair = String(t.pair || '').trim().toUpperCase();
  if (!t.pair) fail('Select a trading pair first.');
  validateTrade(t);
  Object.assign(t, derivePnl(t));
  await TradingSetup.updateOne({ userId: req.userId }, { $addToSet: { pairs: t.pair } }, { upsert: true });
  return TradingTrade.create({ ...t, userId: req.userId });
}));
app.put('/api/trading/trades/:id', wrap(async (req) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) fail('Invalid trade ID.');

  const existing = await TradingTrade.findOne({ _id: id, userId: req.userId }).lean();
  if (!existing) { const err = new Error('Trade not found.'); err.statusCode = 404; throw err; }

  const updates = pickTrade(req.body);
  if (updates.pair !== undefined) {
    updates.pair = String(updates.pair).trim().toUpperCase();
    if (!updates.pair) fail('Trading pair is required.');
  }
  const merged = { ...existing, ...updates };
  validateTrade(merged);
  Object.assign(updates, derivePnl(merged));

  const trade = await TradingTrade.findOneAndUpdate(
    { _id: id, userId: req.userId }, { $set: updates }, { new: true, runValidators: true }
  ).lean();
  if (updates.pair) await TradingSetup.updateOne({ userId: req.userId }, { $addToSet: { pairs: updates.pair } }, { upsert: true });
  return trade;
}));

app.delete('/api/trading/trades/:id', wrap(async (req) => {
  const r = await TradingTrade.findOneAndDelete({ _id: req.params.id, userId: req.userId });
  if (!r) { const e = new Error('Trade not found.'); e.statusCode = 404; throw e; }
  return { ok: true };
}));
app.post('/api/trading/ai-analysis', wrap(async (req) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) { const e = new Error('AI analysis is not configured. Add OPENAI_API_KEY to server/.env.'); e.statusCode = 503; throw e; }
  const tradeQuery = { userId: req.userId };
  if (req.body.pair && req.body.pair !== 'All') tradeQuery.pair = String(req.body.pair).toUpperCase();
  const trades = await TradingTrade.find(tradeQuery).sort({ openedAt: -1 }).limit(500).lean();
  if (trades.length < 3) { const e = new Error('Log at least 3 trades before requesting an AI review. More trades produce more useful patterns.'); e.statusCode = 422; throw e; }
  const evidence = trades.map(t => ({ pair: t.pair, direction: t.direction, entry: t.entry, exit: t.exit, stopLoss: t.stopLoss, takeProfit: t.takeProfit, capitalUsed: t.capitalUsed, riskAmount: t.riskAmount, leverage: t.leverage, fees: t.fees, pnl: t.pnlStatus === 'unverified' ? null : t.pnl, pnlStatus: t.pnlStatus, contractMultiplier: t.contractMultiplier, result: t.result, setup: t.setup, emotionBefore: t.emotionBefore, emotionAfter: t.emotionAfter, mistake: t.mistake, lesson: t.lesson, notes: t.notes, openedAt: t.openedAt, closedAt: t.closedAt })); const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini', response_format: { type: 'json_object' }, temperature: 0.2, messages: [
        { role: 'system', content: 'You are a careful trading-process coach, not a signal provider. Analyze only the supplied journal entries. Identify repeated process mistakes, pair/setup performance differences, risk-management issues, emotional patterns and actionable process improvements. Do not invent data, predict prices, promise returns, or tell the user which asset to buy/sell. Explain small sample limitations and distinguish recorded facts from hypotheses. Return JSON keys: summary (string), patterns (array of {title,evidence,recommendation,confidence}), nextSteps (array of 3 strings). If P/L calculation conventions may not fit the instrument, explicitly warn that broker P/L is authoritative.' },
        { role: 'user', content: `Review these ${evidence.length} journal trades. Compare results by pair, setup, emotion, mistakes, and risk where data permits. Do not claim a pattern unless sample size supports it. Data: ${JSON.stringify(evidence)}` }
      ]
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) { const e = new Error(response.status === 429 ? 'AI usage limit reached. Try again later.' : 'AI analysis request failed. Check server configuration.'); e.statusCode = response.status === 429 ? 429 : 502; throw e; }
  try { return JSON.parse(result.choices?.[0]?.message?.content || '{}'); } catch { throw new Error('AI returned an invalid analysis. Please retry.'); }
}));

export default app;

const isDirectExecution = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution && !process.env.VERCEL) {
  const port = process.env.PORT || 5000;
  app.listen(port, () => console.log(`API on :${port}`));
}
