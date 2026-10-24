import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'node:path';
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url';
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) { console.error('[auth] JWT_SECRET is missing in server/.env'); process.exit(1); }

const app = express();
app.use(cors());
app.use(express.json({ limit: '4mb' }));
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
  frequency: { type: String, enum: ['daily', 'weekdays', 'weekly'], default: 'daily' },
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
  mood: String,
  sleep: { type: Number, min: 0, max: 24 },
  note: { type: String, default: '' },
});
daySchema.index({ userId: 1, date: 1 }, { unique: true });
const Day = mongoose.model('Day', daySchema);

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

const settingSchema = new Schema({ ...owner, key: { type: String, required: true }, value: Number });
settingSchema.index({ userId: 1, key: 1 }, { unique: true });
const Setting = mongoose.model('Setting', settingSchema);

const seed = [['Workout', 'dumbbell'], ['Coding', 'code'], ['DSA Practice', 'brain'], ['Read 30 Minutes', 'book'],
  ['Drink Water', 'water'], ['Meditation', 'flower'], ['Sleep 8 Hours', 'moon']];

const wrap = (fn) => async (req, res) => {
  try { res.json(await fn(req, res)); }
  catch (e) { res.status(e.statusCode || 400).json({ error: e.message }); }
};

// ---------- Auth ----------
const sign = (u) => jwt.sign({ id: u._id }, JWT_SECRET, { expiresIn: '7d' });
const publicUser = (u) => ({ id: u._id, name: u.name, email: u.email });
const auth = (req, res, next) => {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  try { req.userId = jwt.verify(token, JWT_SECRET).id; next(); }
  catch { res.status(401).json({ error: 'Please log in again.' }); }
};

app.post('/api/auth/signup', wrap(async (req) => {
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
  await ScreenTime.findOneAndUpdate({ userId: dk.userId, date }, { totalMinutes, apps: clean }, { upsert: true });
  return { ok: true };
}));
// Everything under /api except /api/auth/* requires a valid token.
app.use('/api', (req, res, next) => (req.path.startsWith('/auth/') ? next() : auth(req, res, next)));

// ---------- Per-user data ----------
function crud(path, Model, onDelete) {
  app.get(`/api/${path}`, wrap((req) => Model.find({ userId: req.userId }).sort('createdAt')));
  app.post(`/api/${path}`, wrap((req) => Model.create({ ...req.body, userId: req.userId })));
  app.put(`/api/${path}/:id`, wrap((req) =>
    Model.findOneAndUpdate({ _id: req.params.id, userId: req.userId }, { ...req.body, userId: req.userId }, { new: true, runValidators: true })));
  app.delete(`/api/${path}/:id`, wrap(async (req) => {
    await Model.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (onDelete) await onDelete(req.params.id, req.userId);
    return { ok: true };
  }));
}

crud('habits', Habit, (id, userId) => Day.updateMany({ userId }, { $pull: { done: id } }));
crud('goals', Goal);
crud('reflections', Reflection);
crud('expenses', Expense);
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
crud('timelogs', TimeLog);
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
crud('foodlogs', FoodLog);
app.get('/api/nutrition/profile', wrap(async (req) => (await NutritionProfile.findOne({ userId: req.userId })) || null));
app.put('/api/nutrition/profile', wrap((req) =>
  NutritionProfile.findOneAndUpdate({ userId: req.userId }, { ...req.body, userId: req.userId }, { upsert: true, new: true, runValidators: true })));
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
  const [habits, days, reflections] = await Promise.all([
    Habit.find({ userId: req.userId }).select('name frequency createdAt archivedOn').lean(),
    Day.find({ userId: req.userId, date: { $gte: from, $lte: to } }).select('date done mood sleep').lean(),
    Reflection.find({ userId: req.userId, date: { $gte: from, $lte: to } }).select('date trigger category hour').lean(),
  ]);

  if (!habits.length) {
    const error = new Error('Create at least one habit before requesting an AI progress analysis.');
    error.statusCode = 422;
    throw error;
  }

  const dayMap = Object.fromEntries(days.map((d) => [d.date, d]));
  const dayKeys = [];
  for (let d = new Date(`${from}T00:00:00.000Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    dayKeys.push(d.toISOString().slice(0, 10));
  }
  const applies = (h, date) => {
    const created = h.createdAt ? new Date(h.createdAt).toISOString().slice(0, 10) : from;
    if (date < created || (h.archivedOn && date >= h.archivedOn)) return false;
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
        { role: 'system', content: 'You are a careful habit-progress analyst. Analyze only the supplied aggregate data. Do not claim correlation proves causation. Do not invent missing evidence. If data is sparse, say so. Return valid JSON with keys: summary (string), patterns (array of objects with title, evidence, recommendation, confidence where confidence is low/moderate/high), and nextWeekPlan (array of 3 short actionable strings). Be supportive but direct. Avoid medical diagnoses.' },
        { role: 'user', content: `Analyze this user's habit progress for ${from} through ${to}. Provide evidence-based observations and small practical actions. Data:\n${JSON.stringify(evidence)}` },
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
app.put('/api/days/:date', wrap((req) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.date)) throw new Error('Invalid date');
  const { done, mood, sleep, note } = req.body;
  const set = Object.fromEntries(Object.entries({ done, mood, sleep, note }).filter(([, v]) => v !== undefined));
  return Day.findOneAndUpdate({ userId: req.userId, date: req.params.date }, { $set: set }, { upsert: true, new: true, runValidators: true });
}));

app.get('/api/settings', wrap(async (req) => Object.fromEntries((await Setting.find({ userId: req.userId })).map((s) => [s.key, s.value]))));
app.put('/api/settings/:key', wrap(async (req) => {
  const value = Number(req.body.value);
  if (!(value >= 0)) throw new Error('Invalid value');
  await Setting.findOneAndUpdate({ userId: req.userId, key: req.params.key }, { value }, { upsert: true });
  return { ok: true };
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
    'TimeLog', 'NutritionProfile', 'FoodLog', 'WeightLog', 'Note'];
  const user = await User.findById(req.userId).select('name email createdAt').lean();
  const data = {};
  for (const n of names) {
    const Model = mongoose.models[n]; // skips a model you haven't added, e.g. Note
    if (Model) data[n] = await Model.find({ userId: req.userId }).lean();
  }
  return { exportedAt: new Date().toISOString(), user, data };
}));
// ---------- Database connection (with diagnostics) ----------
const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/habit-tracker';
console.log('[db] MONGO_URI found in .env:', Boolean(process.env.MONGO_URI));
console.log('[db] Connecting to:', uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@'));
import dns from 'node:dns';
if (!process.env.VERCEL && !process.env.RENDER) dns.setServers(['8.8.8.8']);function explain(e) {
  const m = `${e.message} ${e.cause?.message || ''}`;
  if (/bad auth|Authentication failed/i.test(m)) return 'Wrong username or password, or the user has no read/write role.';
  if (/ENOTFOUND|querySrv|ESERVFAIL/i.test(m)) return 'Cluster host could not be resolved. Check for typos, or try another network or DNS (8.8.8.8).';
  if (/ECONNREFUSED/i.test(m)) return 'Nothing is listening at that address. MONGO_URI may not have been loaded.';
  if (/ETIMEDOUT|timed out|MongoServerSelectionError/i.test(m)) return 'Server unreachable. Check Atlas Network Access, that the cluster is not paused, and VPN/firewall.';
  return 'Unrecognised error. Copy the full output above when asking for help.';
}

mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 }).then(async () => {
  console.log('[db] Connected to database:', mongoose.connection.name);
  await Promise.all([Day.syncIndexes(), Setting.syncIndexes()]); // replaces old global-unique indexes with per-user ones
  const port = process.env.PORT || 5000;
  app.listen(port, () => console.log(`API on :${port}`));
}).catch((e) => {
  console.error('[db] Connection failed:', e.name, '|', e.message);
  console.error('[db] Likely reason:', explain(e));
  process.exit(1);
});