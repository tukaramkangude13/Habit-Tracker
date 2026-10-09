import { addDays, key, parse } from './lib';

export const MEALS = ['Breakfast', 'Lunch', 'Snack', 'Dinner'];
export const mealNow = () => { const h = new Date().getHours(); return h < 11 ? 'Breakfast' : h < 16 ? 'Lunch' : h < 19 ? 'Snack' : 'Dinner'; };
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);

export function analyse(foods, end, n) {
  const from = key(addDays(parse(end), -(n - 1)));
  const list = foods.filter((f) => f.date >= from && f.date <= end);
  const byDay = {}, byFood = {};
  list.forEach((f) => {
    const d = (byDay[f.date] = byDay[f.date] || { kcal: 0, protein: 0 });
    d.kcal += f.kcal; d.protein += f.protein;
    const o = (byFood[f.name] = byFood[f.name] || { name: f.name, times: 0, qty: 0, kcal: 0, protein: 0 });
    o.times++; o.qty += f.qty || 1; o.kcal += f.kcal; o.protein += f.protein;
  });
  const dates = Object.keys(byDay);
  return {
    dates, days: dates.length, byDay, foods: Object.values(byFood),
    byMeal: Object.fromEntries(MEALS.map((m) => [m, sum(list.filter((f) => (f.meal || 'Snack') === m), (f) => f.kcal)])),
    totalKcal: sum(list, (f) => f.kcal), totalProtein: sum(list, (f) => f.protein),
  };
}
