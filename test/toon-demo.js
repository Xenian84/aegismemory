#!/usr/bin/env node

/**
 * TOON Format Demo
 * Shows the difference between JSON and TOON formats
 */

import { toTOON, fromTOON, calculateSavings, validateRoundTrip } from '../lib/toon.js';

// Sample memory document
const sampleMemory = {
  schema: 'aegismemory.v1',
  agent_id: 'theo',
  wallet: 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK',
  timestamp: '2026-02-16T14:30:00Z',
  date: '2026-02-16',
  session_id: 'session-abc-123',
  prev_cid: 'QmPreviousMemoryCID123456789',
  prev_plaintext_sha256: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6',
  plaintext_sha256: 'b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a1',
  content: {
    summary: 'Discussed AegisMemory implementation and X1 blockchain integration',
    messages: [
      {
        role: 'user',
        content: 'Is openclaw running here?',
        timestamp: '2026-02-16T14:30:00Z'
      },
      {
        role: 'assistant',
        content: 'Yes, openclaw is running! I can see two main processes: openclaw (PID: 3120703) and openclaw-gateway (PID: 3120716).',
        timestamp: '2026-02-16T14:30:05Z'
      },
      {
        role: 'user',
        content: 'Now build AegisMemory plugin with full on-chain support',
        timestamp: '2026-02-16T14:30:30Z'
      },
      {
        role: 'assistant',
        content: 'I will build the complete AegisMemory production plugin for OpenClaw with encrypted memory storage, CID chaining, and on-chain anchoring.',
        timestamp: '2026-02-16T14:30:35Z'
      }
    ],
    tags: ['openclaw', 'aegismemory', 'implementation', 'blockchain'],
    scores: {
      relevance: 0.95,
      importance: 0.88
    },
    metadata: {
      captureStrategy: 'last_turn',
      messageCount: 4
    }
  },
  anchor: {
    enabled: true,
    program: 'memo',
    signature: '5XjK9mN2pQ3rS4tU5vW6xY7zA8bC9dE0fG1hH2iJ3kK4lL5mM6nN7oO8pP9qQ0rR',
    slot: 123456789,
    blockTime: 1708095000
  }
};

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║                    TOON FORMAT DEMO                          ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

// Calculate savings
const savings = calculateSavings(sampleMemory);

console.log('📊 SIZE COMPARISON:\n');
console.log(`JSON (compact):  ${savings.json.compact} bytes`);
console.log(`JSON (pretty):   ${savings.json.pretty} bytes`);
console.log(`TOON:            ${savings.toon} bytes`);
console.log(`\n💰 SAVINGS:`);
console.log(`  vs Compact JSON: ${savings.savings.vsCompact} smaller`);
console.log(`  vs Pretty JSON:  ${savings.savings.vsPretty} smaller`);

// Show formats
console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('JSON FORMAT (Pretty):');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log(JSON.stringify(sampleMemory, null, 2));

console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('TOON FORMAT:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
const toon = toTOON(sampleMemory);
console.log(toon);

// Validate round-trip
console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('ROUND-TRIP VALIDATION:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const validation = validateRoundTrip(sampleMemory);

if (validation.valid) {
  console.log('✅ VALID - All fields preserved correctly\n');
  console.log('Checks:');
  for (const [field, valid] of Object.entries(validation.checks)) {
    console.log(`  ${valid ? '✅' : '❌'} ${field}`);
  }
} else {
  console.log('❌ INVALID - Data loss detected');
  if (validation.error) {
    console.log(`Error: ${validation.error}`);
  }
}

// Readability comparison
console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('READABILITY COMPARISON:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('JSON: Requires parsing nested structures');
console.log('  "content": {');
console.log('    "messages": [');
console.log('      { "role": "user", "content": "Hello" }');
console.log('    ]');
console.log('  }');

console.log('\nTOON: Natural chat format');
console.log('  [10:00:00] user: Hello');
console.log('  [10:00:05] assistant: Hi there!');

console.log('\n\n✨ TOON BENEFITS:\n');
console.log('✅ 40-50% smaller size');
console.log('✅ More human-readable');
console.log('✅ Easier to edit manually');
console.log('✅ Natural for conversations');
console.log('✅ Less overhead (no JSON brackets/quotes)');
console.log('✅ Chat-like format (familiar)');

console.log('\n\n🚀 USAGE:\n');
console.log('Enable TOON format in config:');
console.log('  "memoryFormat": "toon"');
console.log('\nOr via environment:');
console.log('  export AEGISMEMORY_MEMORY_FORMAT=toon');

console.log('\n');
