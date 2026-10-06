import assert from 'node:assert/strict';
import test from 'node:test';
import { platformGreeting } from '../src/app.js';

test('keeps Android and iOS behavior explicit', () => {
  assert.equal(platformGreeting('android'), 'hello android');
  assert.equal(platformGreeting('ios'), 'hello ios');
});
