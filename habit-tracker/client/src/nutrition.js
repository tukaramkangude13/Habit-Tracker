import { parse } from './lib';

export const ACTIVITY = [['sedentary', 'Mostly sitting (classes, studying)', 1.2], ['light', 'Light (walks, 1-3 workouts a week)', 1.375],
  ['moderate', 'Moderate (3-5 workouts a week)', 1.55], ['active', 'Very active (hard training daily)', 1.725]];

// [name, kcal, protein g] per serving. Approximate values.
export const FOODS = [['Roti (1)', 100, 3], ['Cooked rice (1 cup)', 200, 4], ['Dal (1 bowl)', 150, 9], ['Paneer (100 g)', 265, 18],
  ['Boiled egg (1)', 78, 6], ['Full-fat milk (250 ml)', 150, 8], ['Curd (1 bowl)', 120, 7], ['Banana (1)', 105, 1], ['Peanuts (30 g)', 170, 7],
  ['Peanut butter (2 tbsp)', 190, 8], ['Oats with milk (1 bowl)', 270, 12], ['Soya chunks (30 g dry)', 104, 16], ['Poha (1 plate)', 250, 5],
  ['Chicken curry (150 g)', 250, 25], ['Whey protein (1 scoop)', 120, 24], ['Chana (1 bowl)', 210, 11]];

const r = Math.round;

export function plan(p, today) {
  const w = +p.weight, t = +p.target, h = +p.height, a = +p.age;
  const bmr = 10 * w + 6.25 * h - 5 * a + (p.sex === 'male' ? 5 : -161);
  const tdee = r(bmr * (ACTIVITY.find((x) => x[0] === p.activity)?.[2] || 1.375));
  const gain = +(t - w).toFixed(1), notes = [];
  const bmi = w / (h / 100) ** 2, tbmi = t / (h / 100) ** 2;
  if (bmi < 16) notes.push('Your BMI is very low. Please see a doctor before starting a gain plan.');
  if (tbmi > 24.9) notes.push(`A ${t} kg target gives a BMI of ${tbmi.toFixed(1)}, above the usual healthy range (18.5 to 24.9). Consider a lower target.`);
  let rate = 0.35;
  if (p.targetDate && gain > 0) {
    const wk = (parse(p.targetDate) - parse(today)) / 6048e5;
    if (wk > 0) {
      rate = gain / wk;
      if (rate > 0.5) notes.push(`Reaching ${t} kg by then needs ${rate.toFixed(2)} kg a week. Gaining faster than 0.5 kg a week is mostly fat, so the plan is capped at 0.5.`);
    }
  }
  rate = Math.min(0.5, Math.max(0.15, rate));
  const surplus = r(rate * 1100), kcal = tdee + surplus;
  const protein = r(1.8 * w), fat = r((kcal * 0.25) / 9), carbs = r((kcal - protein * 4 - fat * 9) / 4);
  return { tdee, gain, rate, surplus, kcal, protein, fat, carbs, water: r(w * 35), weeks: gain > 0 ? Math.ceil(gain / rate) : 0, bmi, notes };
}

export function actualRate(weights) {
  const last = weights[weights.length - 1];
  if (!last) return null;
  const from = weights.find((x) => (parse(last.date) - parse(x.date)) / 864e5 <= 21);
  const d = from ? (parse(last.date) - parse(from.date)) / 864e5 : 0;
  return d >= 10 ? ((last.kg - from.kg) / d) * 7 : null;
}

export function advice(planned, actual) {
  if (actual == null) return 'Log your weight regularly. After 10+ days I can compare your real rate to the plan.';
  const f = (n) => n.toFixed(2);
  if (actual < planned * 0.6) return `You are gaining ${f(actual)} kg a week against a plan of ${f(planned)}. Add about ${r((planned - actual) * 1100)} kcal a day, for example milk with a banana and peanut butter.`;
  if (actual > planned * 1.6) return `You are gaining faster than planned (${f(actual)} kg a week). Trim about ${r((actual - planned) * 1100)} kcal a day to keep the gain lean.`;
  return `On track: ${f(actual)} kg a week against a plan of ${f(planned)}. Keep going.`;
}

export function ideas(kcalLeft, protLeft) {
  if (kcalLeft <= 0 && protLeft <= 0) return [];
  const score = protLeft > 15 ? (f) => f[2] / f[1] : (f) => f[1];
  return [...FOODS].filter((f) => f[1] <= Math.max(kcalLeft, 200)).sort((a, b) => score(b) - score(a)).slice(0, 3);
}
