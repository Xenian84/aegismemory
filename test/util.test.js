import { test } from 'node:test';
import assert from 'node:assert';
import { canonicalStringify, calculateBackoff, isRetryableError } from '../lib/util.js';

test('canonicalStringify produces deterministic output', () => {
  const obj1 = { b: 2, a: 1, c: 3 };
  const obj2 = { c: 3, a: 1, b: 2 };
  
  const str1 = canonicalStringify(obj1);
  const str2 = canonicalStringify(obj2);
  
  assert.strictEqual(str1, str2, 'Same object with different key order should produce same output');
  assert.strictEqual(str1, '{"a":1,"b":2,"c":3}');
});

test('canonicalStringify handles nested objects', () => {
  const obj = {
    z: { y: 2, x: 1 },
    a: [3, 2, 1]
  };
  
  const result = canonicalStringify(obj);
  assert.strictEqual(result, '{"a":[3,2,1],"z":{"x":1,"y":2}}');
});

test('calculateBackoff increases exponentially', () => {
  const backoff0 = calculateBackoff(0, 1000);
  const backoff1 = calculateBackoff(1, 1000);
  const backoff2 = calculateBackoff(2, 1000);
  
  assert.ok(backoff0 >= 1000 && backoff0 <= 1100, 'First backoff should be ~1000ms');
  assert.ok(backoff1 >= 2000 && backoff1 <= 2200, 'Second backoff should be ~2000ms');
  assert.ok(backoff2 >= 4000 && backoff2 <= 4400, 'Third backoff should be ~4000ms');
});

test('calculateBackoff respects maxMs', () => {
  const backoff = calculateBackoff(10, 1000, 5000);
  assert.ok(backoff <= 5500, 'Backoff should not exceed maxMs + jitter');
});

test('isRetryableError detects network errors', () => {
  const networkError = new Error('ECONNRESET');
  networkError.code = 'ECONNRESET';
  
  assert.ok(isRetryableError(networkError), 'ECONNRESET should be retryable');
});

test('isRetryableError detects 5xx errors', () => {
  const serverError = new Error('Server error');
  serverError.status = 503;
  
  assert.ok(isRetryableError(serverError), '503 should be retryable');
});

test('isRetryableError detects rate limit', () => {
  const rateLimitError = new Error('Rate limited');
  rateLimitError.status = 429;
  
  assert.ok(isRetryableError(rateLimitError), '429 should be retryable');
});

test('isRetryableError rejects 4xx client errors', () => {
  const clientError = new Error('Bad request');
  clientError.status = 400;
  
  assert.ok(!isRetryableError(clientError), '400 should not be retryable');
});
