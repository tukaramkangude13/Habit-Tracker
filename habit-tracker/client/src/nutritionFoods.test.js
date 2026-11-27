import assert from 'node:assert/strict';
import test from 'node:test';
import { FOODS } from './nutrition.js';

test('quick-add foods include local ladoo and buttermilk servings', () => {
  const names = FOODS.map(([name]) => name.toLowerCase());

  assert.ok(names.some((name) => name.includes('shengdana ladoo')));
  assert.ok(names.some((name) => name.includes('til ladoo')));
  assert.ok(names.some((name) => name.includes('buttermilk')));
  assert.ok(names.some((name) => name.startsWith('baati')));
});
