import test from 'node:test';
import assert from 'node:assert/strict';
import { pursuitStatusLabel } from '../src/law.js';

test('wanted status distinguishes an active visual from a last-fix search', () => {
  assert.equal(pursuitStatusLabel(false, false), 'Wanted');
  assert.equal(pursuitStatusLabel(true, true), '수배 · FWC 추격');
  assert.equal(pursuitStatusLabel(true, false), '수배 · FWC 수색');
});
