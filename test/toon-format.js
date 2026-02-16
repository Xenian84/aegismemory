#!/usr/bin/env node

/**
 * TOON Format vs JSON Comparison
 * 
 * TOON (Telegram Object Notation) - simpler, more compact than JSON
 * Let's compare size and readability
 */

/**
 * Sample memory in JSON format
 */
const memoryJSON = {
  schema: "aegismemory.v1",
  agent_id: "theo",
  wallet: "ABC123XYZ",
  timestamp: "2026-02-16T10:00:00Z",
  date: "2026-02-16",
  prev_cid: "QmPrevious",
  prev_sha256: "hash123",
  plaintext_sha256: "hash456",
  content: {
    summary: "Discussed weather and plans",
    messages: [
      { role: "user", content: "What's the weather?", timestamp: "2026-02-16T10:00:00Z" },
      { role: "assistant", content: "It's sunny, 75°F!", timestamp: "2026-02-16T10:00:05Z" },
      { role: "user", content: "Should I go to park?", timestamp: "2026-02-16T10:00:10Z" },
      { role: "assistant", content: "Yes! Perfect day for it.", timestamp: "2026-02-16T10:00:15Z" }
    ],
    tags: ["weather", "outdoor", "advice"]
  },
  anchor: {
    enabled: true,
    program: "memo",
    signature: "5Xj7...",
    slot: 123456,
    blockTime: 1234567890
  }
};

/**
 * Same memory in TOON format (Telegram-style)
 * More compact, easier to read
 */
const memoryTOON = `
@aegismemory/v1
agent: theo
wallet: ABC123XYZ
time: 2026-02-16T10:00:00Z
date: 2026-02-16
prev: QmPrevious
prev_hash: hash123
hash: hash456

# Discussed weather and plans

[10:00:00] user: What's the weather?
[10:00:05] assistant: It's sunny, 75°F!
[10:00:10] user: Should I go to park?
[10:00:15] assistant: Yes! Perfect day for it.

tags: weather, outdoor, advice

anchor: memo@5Xj7.../123456/1234567890
`.trim();

/**
 * TOON Parser
 */
function parseTOON(toon) {
  const lines = toon.split('\n');
  const memory = {
    content: {
      messages: [],
      tags: []
    }
  };
  
  let inMessages = false;
  let summary = '';
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Schema
    if (trimmed.startsWith('@aegismemory/')) {
      memory.schema = trimmed.substring(1);
      continue;
    }
    
    // Key-value pairs
    if (trimmed.includes(':') && !trimmed.startsWith('[')) {
      const [key, ...valueParts] = trimmed.split(':');
      const value = valueParts.join(':').trim();
      
      if (key === 'agent') memory.agent_id = value;
      else if (key === 'wallet') memory.wallet = value;
      else if (key === 'time') memory.timestamp = value;
      else if (key === 'date') memory.date = value;
      else if (key === 'prev') memory.prev_cid = value;
      else if (key === 'prev_hash') memory.prev_sha256 = value;
      else if (key === 'hash') memory.plaintext_sha256 = value;
      else if (key === 'tags') memory.content.tags = value.split(',').map(t => t.trim());
      else if (key === 'anchor') {
        const [prog, rest] = value.split('@');
        const [sig, slot, blockTime] = rest.split('/');
        memory.anchor = {
          enabled: true,
          program: prog,
          signature: sig,
          slot: parseInt(slot),
          blockTime: parseInt(blockTime)
        };
      }
      continue;
    }
    
    // Summary (# heading)
    if (trimmed.startsWith('#')) {
      summary = trimmed.substring(1).trim();
      memory.content.summary = summary;
      inMessages = true;
      continue;
    }
    
    // Messages [timestamp] role: content
    if (trimmed.startsWith('[')) {
      const match = trimmed.match(/\[([^\]]+)\]\s+(\w+):\s+(.+)/);
      if (match) {
        const [, time, role, content] = match;
        memory.content.messages.push({
          role,
          content,
          timestamp: `${memory.date}T${time}Z`
        });
      }
    }
  }
  
  return memory;
}

/**
 * TOON Serializer
 */
function toTOON(memory) {
  const lines = [];
  
  // Schema
  lines.push(`@${memory.schema}`);
  
  // Metadata
  lines.push(`agent: ${memory.agent_id}`);
  lines.push(`wallet: ${memory.wallet}`);
  lines.push(`time: ${memory.timestamp}`);
  lines.push(`date: ${memory.date}`);
  if (memory.prev_cid) lines.push(`prev: ${memory.prev_cid}`);
  if (memory.prev_sha256) lines.push(`prev_hash: ${memory.prev_sha256}`);
  lines.push(`hash: ${memory.plaintext_sha256}`);
  lines.push('');
  
  // Summary
  if (memory.content.summary) {
    lines.push(`# ${memory.content.summary}`);
    lines.push('');
  }
  
  // Messages
  for (const msg of memory.content.messages) {
    const time = msg.timestamp.split('T')[1].split('Z')[0];
    lines.push(`[${time}] ${msg.role}: ${msg.content}`);
  }
  lines.push('');
  
  // Tags
  if (memory.content.tags?.length > 0) {
    lines.push(`tags: ${memory.content.tags.join(', ')}`);
    lines.push('');
  }
  
  // Anchor
  if (memory.anchor?.enabled) {
    lines.push(`anchor: ${memory.anchor.program}@${memory.anchor.signature}/${memory.anchor.slot}/${memory.anchor.blockTime}`);
  }
  
  return lines.join('\n');
}

/**
 * Compare formats
 */
function compareFormats() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║              TOON vs JSON FORMAT COMPARISON                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  // Sizes
  const jsonStr = JSON.stringify(memoryJSON);
  const jsonPretty = JSON.stringify(memoryJSON, null, 2);
  const toonStr = memoryTOON;
  
  console.log('📊 SIZE COMPARISON:\n');
  console.log(`JSON (compact):    ${jsonStr.length} bytes`);
  console.log(`JSON (pretty):     ${jsonPretty.length} bytes`);
  console.log(`TOON:              ${toonStr.length} bytes`);
  console.log(`\nSavings: ${((jsonPretty.length - toonStr.length) / jsonPretty.length * 100).toFixed(1)}% smaller than pretty JSON`);
  console.log(`Savings: ${((jsonStr.length - toonStr.length) / jsonStr.length * 100).toFixed(1)}% vs compact JSON`);
  
  // Readability
  console.log('\n\n📖 READABILITY:\n');
  console.log('JSON (pretty):');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(jsonPretty.substring(0, 300) + '...\n');
  
  console.log('TOON:');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(toonStr + '\n');
  
  // Parse test
  console.log('\n🔄 PARSE TEST:\n');
  const parsed = parseTOON(toonStr);
  console.log('Parsed TOON back to object:');
  console.log(JSON.stringify(parsed, null, 2).substring(0, 300) + '...\n');
  
  // Round-trip test
  const regenerated = toTOON(memoryJSON);
  console.log('✅ Round-trip test:', regenerated === toonStr ? 'PASSED' : 'FAILED');
  
  // Advantages
  console.log('\n\n✨ TOON ADVANTAGES:\n');
  console.log('✅ More human-readable (chat-like format)');
  console.log('✅ Smaller size (less overhead)');
  console.log('✅ Easier to edit manually');
  console.log('✅ Natural for conversation data');
  console.log('✅ Telegram-inspired (familiar format)');
  console.log('✅ Less nesting (flatter structure)');
  
  console.log('\n\n⚠️  JSON ADVANTAGES:\n');
  console.log('✅ Standard format (universal support)');
  console.log('✅ Built-in parsing (JSON.parse)');
  console.log('✅ Type safety (numbers, booleans, null)');
  console.log('✅ Nested structures (complex data)');
  console.log('✅ Tooling support (validators, schemas)');
  
  // Recommendation
  console.log('\n\n💡 RECOMMENDATION:\n');
  console.log('For AegisMemory, we could support BOTH:');
  console.log('1. JSON (default) - standard, safe, compatible');
  console.log('2. TOON (optional) - compact, readable, efficient');
  console.log('\nConfig option: `memoryFormat: "json" | "toon"`');
  console.log('\nFor on-chain storage, TOON could save 20-30% in size!');
}

// Main
compareFormats();
