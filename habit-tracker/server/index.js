import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) { console.error('[auth] JWT_SECRET is missing in server/.env'); process.exit(1); }

const app = express();
app.use(cors());
app.use(express.json());

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
  catch (e) { res.status(400).json({ error: e.message }); }
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
const NutritionProfile = mongoose.model('NutritionProfile', new Schema({
  ...owner, age: Number, sex: String, height: Number, weight: Number, target: Number, activity: String, targetDate: String,
}, { timestamps: true }));
const FoodLog = mongoose.model('FoodLog', new Schema({
  ...owner, date: { type: String, required: true },
  name: { type: String, required: true, trim: true, maxlength: 60 },
  meal: { type: String, enum: ['Breakfast', 'Lunch', 'Snack', 'Dinner'], default: 'Snack' },
  qty: { type: Number, default: 1, min: 0.1, max: 20 },
  kcal: { type: Number, required: true, min: 0, max: 5000 }, protein: { type: Number, default: 0, min: 0, max: 300 },
}, { timestamps: true }));
const weightSchema = new Schema({ ...owner, date: { type: String, required: true }, kg: { type: Number, required: true, min: 25, max: 250 } });
weightSchema.index({ userId: 1, date: 1 }, { unique: true });
const WeightLog = mongoose.model('WeightLog', weightSchema);

crud('foodlogs', FoodLog);
app.get('/api/nutrition/profile', wrap(async (req) => (await NutritionProfile.findOne({ userId: req.userId })) || null));
app.put('/api/nutrition/profile', wrap((req) =>
  NutritionProfile.findOneAndUpdate({ userId: req.userId }, { ...req.body, userId: req.userId }, { upsert: true, new: true, runValidators: true })));
app.get('/api/weights', wrap((req) => WeightLog.find({ userId: req.userId }).sort('date')));
app.put('/api/weights/:date', wrap((req) =>
  WeightLog.findOneAndUpdate({ userId: req.userId, date: req.params.date }, { kg: Number(req.body.kg) }, { upsert: true, new: true, runValidators: true })));
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

// ---------- Database connection (with diagnostics) ----------
const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/habit-tracker';
console.log('[db] MONGO_URI found in .env:', Boolean(process.env.MONGO_URI));
console.log('[db] Connecting to:', uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@'));
import dns from 'node:dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);
function explain(e) {
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