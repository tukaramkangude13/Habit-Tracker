export function normalizeHabitName(name) {
  return String(name ?? '').normalize('NFKC').trim().toLocaleLowerCase('en-US');
}

// A scheduled habit keeps its name reserved until its inclusive end date or
// the first day on which it is archived.
export function isHabitNameActive(habit, today) {
  return (!habit.archivedOn || habit.archivedOn > today)
    && (!habit.endDate || habit.endDate >= today);
}

export function findActiveHabitNameDuplicate(habits, name, today, excludeId = null) {
  const nameKey = normalizeHabitName(name);
  if (!nameKey) return null;
  return habits.find((habit) => String(habit._id) !== String(excludeId)
    && normalizeHabitName(habit.name) === nameKey
    && isHabitNameActive(habit, today)) || null;
}

// The list is normally oldest-first; retain the newest archived record for
// each name when offering it as a reusable habit.
export function newestPastHabitPerName(habits) {
  const seen = new Set();
  return [...habits].reverse().filter((habit) => {
    const name = normalizeHabitName(habit.name);
    if (!name || seen.has(name)) return false;
    seen.add(name);
    return true;
  });
}

export function pastHabitLabel(habit, allPastHabits) {
  const nameKey = normalizeHabitName(habit.name);
  const matching = allPastHabits.filter((item) => normalizeHabitName(item.name) === nameKey);
  if (matching.length < 2) return habit.name;
  const date = habit.archivedOn || habit.endDate || String(habit.createdAt || '').slice(0, 10);
  return `${habit.name} · ${date || 'past entry'} · #${String(habit._id).slice(-4)}`;
}
