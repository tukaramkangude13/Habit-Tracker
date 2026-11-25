import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findActiveHabitNameDuplicate,
  isHabitNameActive,
  newestPastHabitPerName,
  normalizeHabitName,
  pastHabitLabel,
} from './habitRules.js';

test('habit names normalize spaces, Unicode compatibility forms, and case', () => {
  assert.equal(normalizeHabitName('  Ｍｅｄｉｔａｔｉｏｎ  '), 'meditation');
  assert.equal(normalizeHabitName('Drink Water'), normalizeHabitName('drink water'));
});

test('active names remain reserved through the end date and release on archive date', () => {
  assert.equal(isHabitNameActive({ endDate: '2026-11-25' }, '2026-11-25'), true);
  assert.equal(isHabitNameActive({ endDate: '2026-11-24' }, '2026-11-25'), false);
  assert.equal(isHabitNameActive({ archivedOn: '2026-11-25' }, '2026-11-25'), false);
  assert.equal(isHabitNameActive({ archivedOn: '2026-11-26' }, '2026-11-25'), true);
});

test('duplicate check is case-insensitive, ignores archived entries, and supports editing the same record', () => {
  const habits = [
    { _id: 'active', name: 'Meditation', endDate: '' },
    { _id: 'past', name: 'Meditation', archivedOn: '2026-11-25' },
  ];
  assert.equal(findActiveHabitNameDuplicate(habits, ' meditation ', '2026-11-25')._id, 'active');
  assert.equal(findActiveHabitNameDuplicate(habits, 'Meditation', '2026-11-25', 'active'), null);
  assert.equal(findActiveHabitNameDuplicate(habits, 'Meditation', '2026-11-26')._id, 'active');
});

test('past-habit reuse shows one newest option per name while correction labels distinguish duplicates', () => {
  const rows = [
    { _id: 'old-1234', name: 'Workout', archivedOn: '2026-11-01' },
    { _id: 'middle-5678', name: ' workout ', archivedOn: '2026-11-10' },
    { _id: 'other-9012', name: 'Read', endDate: '2026-11-05' },
  ];
  const unique = newestPastHabitPerName(rows);
  assert.deepEqual(unique.map((row) => row._id), ['other-9012', 'middle-5678']);
  assert.equal(pastHabitLabel(rows[0], rows), 'Workout · 2026-11-01 · #1234');
  assert.equal(pastHabitLabel(rows[2], rows), 'Read');
});
