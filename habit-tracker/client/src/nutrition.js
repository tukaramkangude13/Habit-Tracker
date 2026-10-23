import { parse } from './lib';

export const ACTIVITY = [
  ['sedentary', 'Mostly sitting (classes, studying)', 1.2],
  ['light', 'Light (walks, 1-3 workouts a week)', 1.375],
  ['moderate', 'Moderate (3-5 workouts a week)', 1.55],
  ['active', 'Very active (hard training daily)', 1.725]
];

// [name, kcal, protein, carbs, fat] per serving
// Nutrition values are approximate.
export const FOODS = [
  ['Roti (1)', 100, 3, 18, 2],
  ['Cooked rice (1 cup)', 200, 4, 45, 0.5],
  ['Dal (1 bowl)', 150, 9, 20, 4],
  ['Paneer (100 g)', 265, 18, 3, 20],
  ['White bread (2 slices)', 140, 5, 26, 2],
['Brown bread (2 slices)', 140, 6, 24, 2],
['Bread with butter (2 slices)', 220, 5, 27, 10],
['Shengdana ladoo (1 piece)', 150, 4, 12, 10],
  ['Boiled egg (1)', 78, 6, 0.6, 5],
  ['Full-fat milk (250 ml)', 150, 8, 12, 8],
  ['Curd (1 bowl)', 120, 7, 10, 5],
  ['Banana (1)', 105, 1, 27, 0.3],
  ['Peanuts (30 g)', 170, 7, 5, 14],
  ['Peanut butter (2 tbsp)', 190, 8, 7, 16],
  ['Oats with milk (1 bowl)', 270, 12, 40, 8],
  ['Soya chunks (30 g dry)', 104, 16, 7, 0.5],
  ['Poha (1 plate)', 250, 5, 45, 6],
  ['Whey protein (1 scoop)', 120, 24, 3, 1.5],
  ['Chana (1 bowl)', 210, 11, 30, 5],
  ['Roasted chana (100 g)', 380, 20, 63, 6]
];
export const FRUITS = [
  ['Banana', 105, 1.3, 27, 0.4],
  ['Apple', 95, 0.5, 25, 0.3],
  ['Guava', 68, 2.6, 14, 1],
  ['Pomegranate', 144, 2.9, 32, 2],
  ['Orange', 62, 1.2, 15.4, 0.2],
  ['Papaya', 59, 0.9, 15, 0.2],
  ['Mango', 99, 1.4, 25, 0.6],
  ['Grapes', 104, 1.1, 27, 0.2],
  ['Chikoo', 83, 0.4, 20, 1.4],
  ['Watermelon', 86, 1.7, 22, 0.4],
  ['Pineapple', 82, 0.9, 22, 0.2],
  ['Pear', 101, 0.6, 27, 0.2],
];
const r = Math.round;

export function plan(p, today) {
  const w = +p.weight;
  const t = +p.target;
  const h = +p.height;
  const a = +p.age;

  const bmr =
    10 * w +
    6.25 * h -
    5 * a +
    (p.sex === 'male' ? 5 : -161);

  const factor =
    ACTIVITY.find((x) => x[0] === p.activity)?.[2] || 1.375;

  const tdee = r(bmr * factor);
  const gain = +(t - w).toFixed(1);
  const notes = [];

  const bmi = w / (h / 100) ** 2;
  const tbmi = t / (h / 100) ** 2;

  if (bmi < 16) {
    notes.push(
      'Your BMI is very low. Please see a doctor before starting a gain plan.'
    );
  }

  if (tbmi > 24.9) {
    notes.push(
      `A ${t} kg target gives a BMI of ${tbmi.toFixed(1)}, above the usual healthy range (18.5 to 24.9). Consider a lower target.`
    );
  }

  let rate = 0.35;

  if (p.targetDate && gain > 0) {
    const weeksAvailable =
      (parse(p.targetDate) - parse(today)) / 6048e5;

    if (weeksAvailable > 0) {
      rate = gain / weeksAvailable;

      if (rate > 0.5) {
        notes.push(
          `Reaching ${t} kg by then needs ${rate.toFixed(2)} kg a week. Consider a slower target.`
        );
      }
    }
  }

  rate = Math.min(0.5, Math.max(0.15, rate));

  const surplus = r(rate * 1100);
  const kcal = tdee + surplus;
  const protein = r(1.8 * w);
  const fat = r((kcal * 0.25) / 9);
  const carbs = r((kcal - protein * 4 - fat * 9) / 4);

  return {
    tdee,
    gain,
    rate,
    surplus,
    kcal,
    protein,
    fat,
    carbs,
    water: r(w * 35),
    weeks: gain > 0 ? Math.ceil(gain / rate) : 0,
    bmi,
    notes
  };
}

export function actualRate(weights) {
  const last = weights[weights.length - 1];

  if (!last) return null;

  const from = weights.find(
    (x) => (parse(last.date) - parse(x.date)) / 864e5 <= 21
  );

  const days = from
    ? (parse(last.date) - parse(from.date)) / 864e5
    : 0;

  return days >= 10
    ? ((last.kg - from.kg) / days) * 7
    : null;
}

export function advice(planned, actual) {
  if (actual == null) {
    return 'Log your weight regularly. After 10+ days I can compare your real rate to the plan.';
  }

  const f = (n) => n.toFixed(2);

  if (actual < planned * 0.6) {
    return `You are gaining ${f(actual)} kg a week against a plan of ${f(planned)}. Consider adding calories gradually.`;
  }

  if (actual > planned * 1.6) {
    return `You are gaining faster than planned (${f(actual)} kg a week). Consider reducing your calorie surplus.`;
  }

  return `On track: ${f(actual)} kg a week against a plan of ${f(planned)}. Keep going.`;
}

export function ideas(kcalLeft, protLeft) {
  if (kcalLeft <= 0 && protLeft <= 0) return [];

  const score =
    protLeft > 15
      ? (f) => f[2] / Math.max(f[1], 1)
      : (f) => f[1];

  return [...FOODS]
    .filter((f) => f[1] <= Math.max(kcalLeft, 200))
    .sort((a, b) => score(b) - score(a))
    .slice(0, 3);
}