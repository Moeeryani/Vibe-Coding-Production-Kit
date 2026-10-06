import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeDeepLink, platformGreeting } from '../src/app.js';

test('fixture journey remains deterministic without a device', () => {
  assert.equal(normalizeDeepLink('vcp://welcome'), 'vcp://welcome');
  assert.equal(platformGreeting('ios'), 'hello ios');
});
