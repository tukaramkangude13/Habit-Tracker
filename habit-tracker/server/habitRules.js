export function normalizeHabitName(name) {
  return String(name ?? '').normalize('NFKC').trim().toLocaleLowerCase('en-US');
}

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

export function activeHabitNameConflict(name) {
  const error = new Error(`An active habit named “${name}” already exists. Edit that habit or choose a different name.`);
  error.statusCode = 409;
  return error;
}
