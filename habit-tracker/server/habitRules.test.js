import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeHabitNameConflict,
  findActiveHabitNameDuplicate,
  isHabitNameActive,
  normalizeHabitName,
} from './habitRules.js';

test('normalizes habit names before comparing them', () => {
  assert.equal(normalizeHabitName('  Ｍｅｄｉｔａｔｉｏｎ  '), 'meditation');
  assert.equal(normalizeHabitName('Drink Water'), normalizeHabitName('drink water'));
});

test('keeps an end-date habit active through that day and releases it on archive day', () => {
  assert.equal(isHabitNameActive({ endDate: '2026-11-25' }, '2026-11-25'), true);
  assert.equal(isHabitNameActive({ endDate: '2026-11-24' }, '2026-11-25'), false);
  assert.equal(isHabitNameActive({ archivedOn: '2026-11-25' }, '2026-11-25'), false);
  assert.equal(isHabitNameActive({ archivedOn: '2026-11-26' }, '2026-11-25'), true);
});

test('finds only active same-name habits and excludes the record being edited', () => {
  const habits = [
    { _id: 'active', name: 'Meditation', endDate: '' },
    { _id: 'past', name: 'Meditation', archivedOn: '2026-11-25' },
  ];
  assert.equal(findActiveHabitNameDuplicate(habits, ' meditation ', '2026-11-25')._id, 'active');
  assert.equal(findActiveHabitNameDuplicate(habits, 'Meditation', '2026-11-25', 'active'), null);
  assert.equal(findActiveHabitNameDuplicate(habits, 'Meditation', '2026-11-26')._id, 'active');
});

test('duplicate conflict is returned as HTTP 409', () => {
  const error = activeHabitNameConflict('Workout');
  assert.equal(error.statusCode, 409);
  assert.match(error.message, /Workout/);
});
