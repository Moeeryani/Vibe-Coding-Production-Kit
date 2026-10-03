import assert from 'node:assert/strict';
import test from 'node:test';
import { formatOrderId } from '../src/order-id.mjs';

test('formats a valid order id with the shared workspace prefix', () => {
  assert.equal(formatOrderId('123'), 'ord_123');
});

test('trims caller whitespace before formatting', () => {
  assert.equal(formatOrderId('  abc-42  '), 'ord_abc-42');
});

test('rejects empty identifiers after trimming', () => {
  assert.throws(() => formatOrderId('   '), /must not be empty/);
});

test('rejects non-string identifiers', () => {
  assert.throws(() => formatOrderId(42), /must be a string/);
});
