import { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Trash2
} from 'lucide-react';

import { api } from '../api';
import { addDays, fmt, key, parse } from '../lib';
import {
  ACTIVITY,
  FOODS,
  actualRate,
    FRUITS,

  advice,
  ideas,
  plan
} from '../nutrition';
import { MEALS, mealNow } from '../nutritionStats';
import FoodAnalysis from './FoodAnalysis';
import {
  Bar,
  Card,
  Field,
  btn,
  btnP,
  iconBtn,
  inp
} from './ui';

const blank = {
  age: '',
  sex: 'male',
  height: '',
  weight: '',
  target: '',
  activity: 'light',
  targetDate: ''
};

const on =
  'border-indigo-600 bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10';

function ProfileForm({ init, onSave, onCancel }) {
  const [f, setF] = useState(init || blank);
  const [err, setErr] = useState('');

  const set = (k) => (e) =>
    setF({ ...f, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();

    const n = {
      age: +f.age,
      height: +f.height,
      weight: +f.weight,
      target: +f.target
    };

    if (!(n.age >= 16 && n.age <= 60)) {
      return setErr('This planner is for ages 16 to 60.');
    }

    if (!(n.height >= 120 && n.height <= 220)) {
      return setErr('Height must be 120 to 220 cm.');
    }

    if (!(n.weight >= 25 && n.weight <= 200)) {
      return setErr('Enter your current weight in kg.');
    }

    if (!(n.target > n.weight && n.target <= 200)) {
      return setErr(
        'Target weight must be higher than your current weight.'
      );
    }

    onSave({ ...f, ...n });
  };

  return (
    <Card
      title="Set up your weight-gain plan"
      className="mx-auto max-w-lg"
    >
      <form
        onSubmit={submit}
        className="grid gap-3 sm:grid-cols-2"
      >
        <Field label="Age">
          <input
            type="number"
            className={inp}
            value={f.age}
            onChange={set('age')}
            required
          />
        </Field>

        <Field label="Sex">
          <select
            className={inp}
            value={f.sex}
            onChange={set('sex')}
          >
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </Field>

        <Field label="Height (cm)">
          <input
            type="number"
            className={inp}
            value={f.height}
            onChange={set('height')}
            required
          />
        </Field>

        <Field label="Current weight (kg)">
          <input
            type="number"
            step="0.1"
            className={inp}
            value={f.weight}
            onChange={set('weight')}
            required
          />
        </Field>

        <Field label="Target weight (kg)">
          <input
            type="number"
            step="0.1"
            className={inp}
            value={f.target}
            onChange={set('target')}
            required
          />
        </Field>

        <Field label="Target date (optional)">
          <input
            type="date"
            className={inp}
            value={f.targetDate || ''}
            onChange={set('targetDate')}
          />
        </Field>

        <div className="sm:col-span-2">
          <Field label="Activity level">
            <select
              className={inp}
              value={f.activity}
              onChange={set('activity')}
            >
              {ACTIVITY.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {err && (
          <p
            role="alert"
            className="text-sm text-red-500 sm:col-span-2"
          >
            {err}
          </p>
        )}

        <div className="flex gap-2 sm:col-span-2">
          <button className={btnP}>Save plan</button>

          {onCancel && (
            <button
              type="button"
              className={btn}
              onClick={onCancel}
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </Card>
  );
}

function WeightChart({ weights, target }) {
  if (weights.length < 2) {
    return (
      <p className="text-xs text-zinc-500">
        Log at least two weigh-ins to see your trend.
      </p>
    );
  }

  const W = 300;
  const H = 100;
  const t0 = parse(weights[0].date);
  const span =
    parse(weights[weights.length - 1].date) - t0 || 1;

  const lo =
    Math.min(...weights.map((w) => w.kg), target) - 1;

  const hi =
    Math.max(...weights.map((w) => w.kg), target) + 1;

  const y = (v) =>
    H - ((v - lo) / (hi - lo)) * H;

  const pts = weights
    .map(
      (w) =>
        `${((parse(w.date) - t0) / span) * W},${y(w.kg)}`
    )
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="h-28 w-full"
      role="img"
      aria-label="Weight over time"
    >
      <line
        x1="0"
        x2={W}
        y1={y(target)}
        y2={y(target)}
        strokeDasharray="4 4"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
        className="stroke-emerald-500"
      />

      <polyline
        points={pts}
        fill="none"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        className="stroke-indigo-600"
      />
    </svg>
  );
}

export default function Nutrition({ today }) {
  const [profile, setProfile] = useState(undefined);
  const [foods, setFoods] = useState([]);
  const [weights, setWeights] = useState([]);
  const [view, setView] = useState('diary');
  const [edit, setEdit] = useState(false);
  const [err, setErr] = useState('');
  const [kg, setKg] = useState('');
  const [date, setDate] = useState(today);
  const [meal, setMeal] = useState(mealNow());
  const [qty, setQty] = useState(1);

  const [custom, setCustom] = useState({
    name: '',
    kcal: '',
    protein: '',
    carbs: '',
    fat: ''
  });

  useEffect(() => {
    Promise.all([
      api.get('/nutrition/profile'),
      api.get('/foodlogs'),
      api.get('/weights')
    ])
      .then(([p, f, w]) => {
        setProfile(p);
        setFoods(f);
        setWeights(w);
      })
      .catch((x) => {
        setErr(x.message);
        setProfile(null);
      });
  }, []);

  const guard = (fn) => async (...args) => {
    try {
      setErr('');
      await fn(...args);
    } catch (x) {
      setErr(x.message);
    }
  };

  const saveProfile = guard(async (p) => {
    setProfile(await api.put('/nutrition/profile', p));
    setEdit(false);
  });

  // Each macro value is per serving.
  const post = async (
    name,
    kcal,
    protein,
    carbs = 0,
    fat = 0
  ) => {
    const q = Number(qty);

    if (!(q >= 0.1 && q <= 20)) {
      throw new Error(
        'Servings must be between 0.1 and 20.'
      );
    }

    const values = [kcal, protein, carbs, fat].map(Number);

    if (
      values.some((v) => !Number.isFinite(v) || v < 0) ||
      values[0] <= 0
    ) {
      throw new Error('Enter valid nutrition values.');
    }

    const r = await api.post('/foodlogs', {
      date,
      meal,
      qty: q,
      name,
      kcal: Math.round(kcal * q),
      protein: Math.round(protein * q * 10) / 10,
      carbs: Math.round(carbs * q * 10) / 10,
      fat: Math.round(fat * q * 10) / 10
    });

    setFoods((list) => [...list, r]);
  };

  const addFood = guard(post);

  const delFood = guard(async (id) => {
    await api.del('/foodlogs/' + id);

    setFoods((list) =>
      list.filter((x) => x._id !== id)
    );
  });

  const addCustom = guard(async (e) => {
    e.preventDefault();

    if (!custom.name.trim() || !(+custom.kcal > 0)) {
      throw new Error(
        'Enter a food name and its calories per serving.'
      );
    }

    await post(
      custom.name.trim(),
      +custom.kcal,
      +custom.protein || 0,
      +custom.carbs || 0,
      +custom.fat || 0
    );

    setCustom({
      name: '',
      kcal: '',
      protein: '',
      carbs: '',
      fat: ''
    });
  });

  const addWeight = guard(async (e) => {
    e.preventDefault();

    if (!(+kg >= 25 && +kg <= 250)) {
      throw new Error(
        'Enter a weight between 25 and 250 kg.'
      );
    }

    const r = await api.put('/weights/' + date, {
      kg: +kg
    });

    setWeights((list) =>
      [
        ...list.filter((x) => x.date !== date),
        r
      ].sort((a, b) => a.date.localeCompare(b.date))
    );

    setKg('');
  });

  const cur = weights.length
    ? weights[weights.length - 1].kg
    : profile?.weight;

  const P = useMemo(
    () =>
      profile
        ? plan({ ...profile, weight: cur }, today)
        : null,
    [profile, cur, today]
  );

  if (profile === undefined) {
    return (
      <p className="py-10 text-center text-zinc-500">
        Loading...
      </p>
    );
  }

  const day = foods.filter((x) => x.date === date);

  const eaten = day.reduce(
    (sum, x) => sum + (x.kcal || 0),
    0
  );

  const prot = day.reduce(
    (sum, x) => sum + (x.protein || 0),
    0
  );

  const carbs = day.reduce(
    (sum, x) => sum + (x.carbs || 0),
    0
  );

  const fat = day.reduce(
    (sum, x) => sum + (x.fat || 0),
    0
  );

  const isToday = date === today;

  const step = (n) =>
    setDate(key(addDays(parse(date), n)));

  const nav = (
    <div className="flex gap-2">
      {[
        ['diary', 'Daily diary'],
        ['analysis', 'Analysis']
      ].map(([k, label]) => (
        <button
          key={k}
          aria-pressed={view === k}
          onClick={() => setView(k)}
          className={`${btn} ${view === k ? on : ''}`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  const error = err && (
    <p
      role="alert"
      className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-500/10"
    >
      {err}
    </p>
  );

  if (view === 'analysis') {
    return (
      <div className="space-y-6">
        {nav}
        {error}

        <FoodAnalysis
          foods={foods}
          today={today}
          target={P}
          onOpen={(d) => {
            setDate(d);
            setView('diary');
          }}
        />
      </div>
    );
  }

  if (!profile || edit) {
    return (
      <div className="space-y-6">
        {nav}
        {error}

        <ProfileForm
          init={profile}
          onSave={saveProfile}
          onCancel={
            profile ? () => setEdit(false) : null
          }
        />
      </div>
    );
  }

  const kLeft = P.kcal - eaten;
  const pLeft = P.protein - prot;
  const tips = isToday ? ideas(kLeft, pLeft) : [];
  const done = P.gain <= 0;

  const macros = [
    ['Calories', eaten, P.kcal, 'kcal'],
    ['Protein', prot, P.protein, 'g'],
    ['Carbs', carbs, P.carbs, 'g'],
    ['Fat', fat, P.fat, 'g']
  ];

  return (
    <div className="space-y-6">
      {nav}
      {error}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card
            title={
              isToday
                ? 'Food diary: today'
                : `Food diary: ${fmt(date, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric'
                  })}`
            }
            action={
              <div className="flex items-center gap-1">
                <button
                  className={iconBtn}
                  aria-label="Previous day"
                  onClick={() => step(-1)}
                >
                  <ChevronLeft size={16} />
                </button>

                <input
                  type="date"
                  aria-label="Diary date"
                  max={today}
                  value={date}
                  onChange={(e) =>
                    e.target.value &&
                    e.target.value <= today &&
                    setDate(e.target.value)
                  }
                  className={`${inp} w-auto py-1`}
                />

                <button
                  disabled={isToday}
                  className={`${iconBtn} disabled:opacity-30`}
                  aria-label="Next day"
                  onClick={() => step(1)}
                >
                  <ChevronRight size={16} />
                </button>

                {!isToday && (
                  <button
                    className={`${btn} py-1 text-xs`}
                    onClick={() => setDate(today)}
                  >
                    Today
                  </button>
                )}
              </div>
            }
          >
            {macros.map(([label, value, target, unit]) => (
              <div key={label} className="mb-3">
                <div className="mb-1 flex justify-between text-sm">
                  <span>{label}</span>

                  <span className="text-zinc-500">
                    {Math.round(value * 10) / 10} / {target} {unit}
                  </span>
                </div>

                <Bar
                  value={
                    target > 0
                      ? Math.min(100, (value / target) * 100)
                      : 0
                  }
                />
              </div>
            ))}

            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              {isToday
                ? `Still to eat: ${Math.max(
                    0,
                    Math.round(kLeft)
                  )} kcal and ${Math.max(
                    0,
                    Math.round(pLeft)
                  )} g protein.`
                : `${Math.round(
                    (eaten / P.kcal) * 100
                  )}% of calorie target and ${Math.round(
                    (prot / P.protein) * 100
                  )}% of protein target.`}
            </p>

            {tips.length > 0 && (
              <p className="mt-1 text-xs text-zinc-500">
                Ideas:{' '}
                {tips
                  .map(
                    (f) =>
                      `${f[0]} (${f[1]} kcal, ${f[2]} g protein)`
                  )
                  .join(', ')}
              </p>
            )}
          </Card>

          <Card title="Log food">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {MEALS.map((m) => (
                <button
                  key={m}
                  aria-pressed={meal === m}
                  onClick={() => setMeal(m)}
                  className={`${btn} py-1 text-xs ${
                    meal === m ? on : ''
                  }`}
                >
                  {m}
                </button>
              ))}

              <label className="ml-auto flex items-center gap-2 text-xs text-zinc-500">
                Servings

                <input
                  type="number"
                  min="0.1"
                  max="20"
                  step="0.5"
                  aria-label="Servings"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  className={`${inp} w-20 py-1`}
                />
              </label>
            </div>

           <div className="space-y-4">
  {/* Regular foods */}
  <div>
    <h3 className="mb-2 text-sm font-semibold">
      🍽️ Regular foods
    </h3>

    <div className="flex flex-wrap gap-2">
      {FOODS.map(([n, k, p, c, f]) => (
        <button
          key={n}
          type="button"
          onClick={() => addFood(n, k, p, c, f)}
          className={`${btn} py-1 text-xs`}
        >
          <Plus size={12} />
          {n}
        </button>
      ))}
    </div>
  </div>

  {/* Fruits */}
  <div>
    <h3 className="mb-2 text-sm font-semibold">
      🍎 Fruits
    </h3>

    <div className="flex flex-wrap gap-2">
      {FRUITS.map(([n, k, p, c, f]) => (
        <button
          key={n}
          type="button"
          onClick={() => addFood(n, k, p, c, f)}
          className={`${btn} py-1 text-xs`}
        >
          <Plus size={12} />
          {n}
          <span className="text-zinc-500">
            {k} kcal
          </span>
        </button>
      ))}
    </div>
  </div>
</div>

            <form
              onSubmit={addCustom}
              className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3"
            >
              <input
                aria-label="Food name"
                className={inp}
                placeholder="Food name"
                value={custom.name}
                onChange={(e) =>
                  setCustom({
                    ...custom,
                    name: e.target.value
                  })
                }
                required
              />

              <input
                aria-label="Calories per serving"
                type="number"
                min="1"
                className={inp}
                placeholder="kcal"
                value={custom.kcal}
                onChange={(e) =>
                  setCustom({
                    ...custom,
                    kcal: e.target.value
                  })
                }
                required
              />

              <input
                aria-label="Protein grams per serving"
                type="number"
                min="0"
                className={inp}
                placeholder="Protein g"
                value={custom.protein}
                onChange={(e) =>
                  setCustom({
                    ...custom,
                    protein: e.target.value
                  })
                }
              />

              <input
                aria-label="Carbohydrates per serving"
                type="number"
                min="0"
                className={inp}
                placeholder="Carbs g"
                value={custom.carbs}
                onChange={(e) =>
                  setCustom({
                    ...custom,
                    carbs: e.target.value
                  })
                }
              />

              <input
                aria-label="Fat per serving"
                type="number"
                min="0"
                className={inp}
                placeholder="Fat g"
                value={custom.fat}
                onChange={(e) =>
                  setCustom({
                    ...custom,
                    fat: e.target.value
                  })
                }
              />

              <button className={btnP}>Add food</button>
            </form>

            <p className="mt-2 text-xs text-zinc-400">
              Values are per serving. Quick-add nutrition values
              are approximate.
            </p>

            <div className="mt-4 space-y-3">
              {day.length === 0 && (
                <p className="text-sm text-zinc-500">
                  Nothing logged for this day yet.
                </p>
              )}

              {MEALS.map((m) => {
                const items = day.filter(
                  (x) => (x.meal || 'Snack') === m
                );

                if (items.length === 0) return null;

                return (
                  <div key={m}>
                    <p className="text-xs font-medium text-zinc-500">
                      {m}:{' '}
                      {items.reduce(
                        (sum, x) => sum + (x.kcal || 0),
                        0
                      )}{' '}
                      kcal
                    </p>

                    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {items.map((x) => (
                        <li
                          key={x._id}
                          className="flex items-center gap-2 py-2 text-sm"
                        >
                          <span className="min-w-0 flex-1">
                            {x.name}
                            {(x.qty || 1) !== 1 &&
                              ` x ${x.qty}`}

                            <span className="block text-xs text-zinc-500">
                              P: {x.protein ?? '—'} g · C:{' '}
                              {x.carbs ?? '—'} g · F:{' '}
                              {x.fat ?? '—'} g
                            </span>
                          </span>

                          <span className="shrink-0 text-zinc-500">
                            {x.kcal} kcal
                          </span>

                          <button
                            className={iconBtn}
                            aria-label={`Remove ${x.name}`}
                            onClick={() => delFood(x._id)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card
            title="Your plan"
            action={
              <button
                className={iconBtn}
                aria-label="Edit plan"
                onClick={() => setEdit(true)}
              >
                <Pencil size={15} />
              </button>
            }
          >
            {done ? (
              <p className="text-sm">
                You have reached your target. To maintain, eat
                about <b>{P.tdee} kcal</b> a day.
              </p>
            ) : (
              <>
                <p className="text-sm">
                  {cur} kg to {profile.target} kg: about{' '}
                  <b>{P.weeks} weeks</b> at{' '}
                  {P.rate.toFixed(2)} kg a week.
                </p>

                <dl className="mt-3 grid grid-cols-2 gap-2 text-center">
                  {[
                    ['Calories', `${P.kcal}`],
                    ['Protein', `${P.protein} g`],
                    ['Carbs', `${P.carbs} g`],
                    ['Fat', `${P.fat} g`],
                    ['Water', `${(P.water / 1000).toFixed(1)} L`],
                    ['Surplus', `+${P.surplus}`]
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-xl bg-zinc-50 p-2 dark:bg-zinc-800/50"
                    >
                      <dd className="font-semibold">{value}</dd>
                      <dt className="text-xs text-zinc-500">
                        {label}
                      </dt>
                    </div>
                  ))}
                </dl>

                <p className="mt-2 text-xs text-zinc-500">
                  Maintenance is about {P.tdee} kcal. BMI now{' '}
                  {P.bmi.toFixed(1)}.
                </p>
              </>
            )}

            {P.notes.map((n) => (
              <p
                key={n}
                className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
              >
                {n}
              </p>
            ))}
          </Card>

          <Card title="Weight">
            <form
              onSubmit={addWeight}
              className="mb-3 flex gap-2"
            >
              <input
                aria-label="Weight in kg"
                type="number"
                step="0.1"
                className={inp}
                placeholder={`Weight on ${
                  isToday ? 'today' : fmt(date)
                } (kg)`}
                value={kg}
                onChange={(e) => setKg(e.target.value)}
                required
              />

              <button className={btnP}>Log</button>
            </form>

            <WeightChart
              weights={weights}
              target={profile.target}
            />

            {weights.length > 0 && (
              <p className="mt-1 text-xs text-zinc-500">
                Latest: {weights[weights.length - 1].kg} kg
                on {fmt(weights[weights.length - 1].date)}
              </p>
            )}

            {!done && (
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
                {advice(P.rate, actualRate(weights))}
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}