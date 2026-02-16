import { test } from 'node:test';
import assert from 'node:assert';
import { validateChain, buildChain, verifyChainIntegrity } from '../lib/chain.js';

test('validateChain accepts valid chain', () => {
  const prevDoc = {
    cid: 'Qm123',
    plaintext_sha256: 'abc123',
    wallet: 'wallet1',
    agent_id: 'theo',
    timestamp: '2026-02-16T10:00:00Z'
  };
  
  const currentDoc = {
    cid: 'Qm456',
    prev_cid: 'Qm123',
    plaintext_sha256: 'def456',
    prev_plaintext_sha256: 'abc123',
    wallet: 'wallet1',
    agent_id: 'theo',
    timestamp: '2026-02-16T11:00:00Z'
  };
  
  const result = validateChain(currentDoc, prevDoc);
  
  assert.ok(result.valid, 'Valid chain should pass validation');
  assert.strictEqual(result.errors.length, 0, 'Should have no errors');
});

test('validateChain detects prev_cid mismatch', () => {
  const prevDoc = {
    cid: 'Qm123',
    plaintext_sha256: 'abc123',
    wallet: 'wallet1',
    agent_id: 'theo',
    timestamp: '2026-02-16T10:00:00Z'
  };
  
  const currentDoc = {
    cid: 'Qm456',
    prev_cid: 'QmWRONG',
    plaintext_sha256: 'def456',
    prev_plaintext_sha256: 'abc123',
    wallet: 'wallet1',
    agent_id: 'theo',
    timestamp: '2026-02-16T11:00:00Z'
  };
  
  const result = validateChain(currentDoc, prevDoc);
  
  assert.ok(!result.valid, 'Invalid chain should fail validation');
  assert.ok(result.errors.length > 0, 'Should have errors');
  assert.ok(result.errors[0].includes('prev_cid'), 'Error should mention prev_cid');
});

test('validateChain detects sha256 mismatch', () => {
  const prevDoc = {
    cid: 'Qm123',
    plaintext_sha256: 'abc123',
    wallet: 'wallet1',
    agent_id: 'theo',
    timestamp: '2026-02-16T10:00:00Z'
  };
  
  const currentDoc = {
    cid: 'Qm456',
    prev_cid: 'Qm123',
    plaintext_sha256: 'def456',
    prev_plaintext_sha256: 'WRONG',
    wallet: 'wallet1',
    agent_id: 'theo',
    timestamp: '2026-02-16T11:00:00Z'
  };
  
  const result = validateChain(currentDoc, prevDoc);
  
  assert.ok(!result.valid, 'Invalid chain should fail validation');
  assert.ok(result.errors.some(e => e.includes('prev_plaintext_sha256')), 'Should detect sha256 mismatch');
});

test('buildChain sorts by timestamp', () => {
  const docs = [
    { timestamp: '2026-02-16T12:00:00Z', cid: 'Qm3', prev_cid: 'Qm2', plaintext_sha256: 'c', prev_plaintext_sha256: 'b' },
    { timestamp: '2026-02-16T10:00:00Z', cid: 'Qm1', prev_cid: null, plaintext_sha256: 'a', prev_plaintext_sha256: null },
    { timestamp: '2026-02-16T11:00:00Z', cid: 'Qm2', prev_cid: 'Qm1', plaintext_sha256: 'b', prev_plaintext_sha256: 'a' }
  ];
  
  const chain = buildChain(docs);
  
  assert.strictEqual(chain.length, 3);
  assert.strictEqual(chain[0].cid, 'Qm1', 'First should be earliest');
  assert.strictEqual(chain[1].cid, 'Qm2', 'Second should be middle');
  assert.strictEqual(chain[2].cid, 'Qm3', 'Third should be latest');
});

test('verifyChainIntegrity detects breaks', () => {
  const docs = [
    { 
      timestamp: '2026-02-16T10:00:00Z', 
      cid: 'Qm1', 
      prev_cid: null, 
      plaintext_sha256: 'a', 
      prev_plaintext_sha256: null,
      wallet: 'w1',
      agent_id: 'theo'
    },
    { 
      timestamp: '2026-02-16T11:00:00Z', 
      cid: 'Qm2', 
      prev_cid: 'QmWRONG', 
      plaintext_sha256: 'b', 
      prev_plaintext_sha256: 'a',
      wallet: 'w1',
      agent_id: 'theo'
    }
  ];
  
  const result = verifyChainIntegrity(docs);
  
  assert.ok(!result.valid, 'Chain with breaks should be invalid');
  assert.strictEqual(result.breaks, 1, 'Should detect one break');
});
