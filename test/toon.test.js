import { test } from 'node:test';
import assert from 'node:assert';
import { toTOON, fromTOON, calculateSavings, validateRoundTrip } from '../lib/toon.js';

test('toTOON produces compact format', () => {
  const memory = {
    schema: 'aegismemory.v1',
    agent_id: 'theo',
    wallet: 'ABC123',
    timestamp: '2026-02-16T10:00:00Z',
    date: '2026-02-16',
    prev_cid: null,
    prev_plaintext_sha256: null,
    plaintext_sha256: 'hash123',
    content: {
      summary: 'Test conversation',
      messages: [
        { role: 'user', content: 'Hello', timestamp: '2026-02-16T10:00:00Z' }
      ],
      tags: ['test']
    },
    anchor: { enabled: false }
  };
  
  const toon = toTOON(memory);
  
  assert.ok(toon.includes('@aegismemory.v1'), 'Should include schema');
  assert.ok(toon.includes('agent: theo'), 'Should include agent');
  assert.ok(toon.includes('[10:00:00] user: Hello'), 'Should include message');
  assert.ok(toon.includes('tags: test'), 'Should include tags');
});

test('fromTOON parses back to object', () => {
  const toon = `@aegismemory.v1

agent: theo
wallet: ABC123
time: 2026-02-16T10:00:00Z
date: 2026-02-16
hash: hash123

# Test conversation

[10:00:00] user: Hello
[10:00:05] assistant: Hi there!

tags: test, greeting`;

  const memory = fromTOON(toon);
  
  assert.strictEqual(memory.schema, 'aegismemory.v1');
  assert.strictEqual(memory.agent_id, 'theo');
  assert.strictEqual(memory.wallet, 'ABC123');
  assert.strictEqual(memory.content.summary, 'Test conversation');
  assert.strictEqual(memory.content.messages.length, 2);
  assert.strictEqual(memory.content.messages[0].role, 'user');
  assert.strictEqual(memory.content.messages[0].content, 'Hello');
  assert.strictEqual(memory.content.tags.length, 2);
});

test('TOON is smaller than JSON', () => {
  const memory = {
    schema: 'aegismemory.v1',
    agent_id: 'theo',
    wallet: 'ABC123',
    timestamp: '2026-02-16T10:00:00Z',
    date: '2026-02-16',
    prev_cid: null,
    prev_plaintext_sha256: null,
    plaintext_sha256: 'hash123',
    content: {
      summary: 'Test',
      messages: [
        { role: 'user', content: 'Hello', timestamp: '2026-02-16T10:00:00Z' }
      ],
      tags: ['test']
    }
  };
  
  const savings = calculateSavings(memory);
  
  assert.ok(savings.toon < savings.json.compact, 'TOON should be smaller than compact JSON');
  assert.ok(savings.toon < savings.json.pretty, 'TOON should be smaller than pretty JSON');
});

test('TOON round-trip preserves data', () => {
  const memory = {
    schema: 'aegismemory.v1',
    agent_id: 'theo',
    wallet: 'ABC123',
    timestamp: '2026-02-16T10:00:00Z',
    date: '2026-02-16',
    prev_cid: 'QmPrev',
    prev_plaintext_sha256: 'prevHash',
    plaintext_sha256: 'hash123',
    content: {
      summary: 'Test conversation',
      messages: [
        { role: 'user', content: 'Hello', timestamp: '2026-02-16T10:00:00Z' },
        { role: 'assistant', content: 'Hi!', timestamp: '2026-02-16T10:00:05Z' }
      ],
      tags: ['test', 'greeting']
    },
    anchor: {
      enabled: true,
      program: 'memo',
      signature: 'sig123',
      slot: 12345,
      blockTime: 1234567890
    }
  };
  
  const result = validateRoundTrip(memory);
  
  assert.ok(result.valid, 'Round-trip should be valid');
  assert.ok(result.checks.schema, 'Schema should match');
  assert.ok(result.checks.agent_id, 'Agent ID should match');
  assert.ok(result.checks.wallet, 'Wallet should match');
  assert.ok(result.checks.hash, 'Hash should match');
  assert.ok(result.checks.messageCount, 'Message count should match');
});

test('TOON handles anchor format', () => {
  const toon = `@aegismemory.v1
agent: theo
wallet: ABC123
time: 2026-02-16T10:00:00Z
date: 2026-02-16
hash: hash123

# Test

anchor: memo@sig123/12345/1234567890`;

  const memory = fromTOON(toon);
  
  assert.strictEqual(memory.anchor.enabled, true);
  assert.strictEqual(memory.anchor.program, 'memo');
  assert.strictEqual(memory.anchor.signature, 'sig123');
  assert.strictEqual(memory.anchor.slot, 12345);
  assert.strictEqual(memory.anchor.blockTime, 1234567890);
});
