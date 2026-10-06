import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeDeepLink } from '../src/app.js';

test('normalizes trusted deep-link scheme and rejects other inputs', () => {
  assert.equal(normalizeDeepLink('  vcp://home  '), 'vcp://home');
  assert.equal(normalizeDeepLink('https://example.com'), null);
  assert.equal(normalizeDeepLink(null), null);
});
