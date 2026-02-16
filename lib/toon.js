/**
 * TOON (Telegram Object Notation) Format
 * 
 * A compact, human-readable format for memory storage
 * ~46% smaller than JSON, perfect for conversation data
 */

/**
 * Convert memory object to TOON format
 */
export function toTOON(memory) {
  const lines = [];
  
  // Schema header
  lines.push(`@${memory.schema || 'aegismemory.v1'}`);
  lines.push('');
  
  // Metadata
  lines.push(`agent: ${memory.agent_id}`);
  lines.push(`wallet: ${memory.wallet}`);
  lines.push(`time: ${memory.timestamp}`);
  lines.push(`date: ${memory.date}`);
  
  if (memory.session_id) {
    lines.push(`session: ${memory.session_id}`);
  }
  
  if (memory.prev_cid) {
    lines.push(`prev: ${memory.prev_cid}`);
  }
  
  if (memory.prev_plaintext_sha256) {
    lines.push(`prev_hash: ${memory.prev_plaintext_sha256}`);
  }
  
  lines.push(`hash: ${memory.plaintext_sha256}`);
  lines.push('');
  
  // Content section
  if (memory.content) {
    // Summary as heading
    if (memory.content.summary) {
      lines.push(`# ${memory.content.summary}`);
      lines.push('');
    }
    
    // Messages in chat format
    if (memory.content.messages && memory.content.messages.length > 0) {
      for (const msg of memory.content.messages) {
        const timestamp = extractTime(msg.timestamp || memory.timestamp);
        const role = msg.role || 'unknown';
        const content = msg.content || '';
        
        lines.push(`[${timestamp}] ${role}: ${content}`);
      }
      lines.push('');
    }
    
    // Tags
    if (memory.content.tags && memory.content.tags.length > 0) {
      lines.push(`tags: ${memory.content.tags.join(', ')}`);
      lines.push('');
    }
    
    // Scores (if present)
    if (memory.content.scores && Object.keys(memory.content.scores).length > 0) {
      lines.push('scores:');
      for (const [key, value] of Object.entries(memory.content.scores)) {
        lines.push(`  ${key}: ${value}`);
      }
      lines.push('');
    }
    
    // Metadata (if present)
    if (memory.content.metadata && Object.keys(memory.content.metadata).length > 0) {
      lines.push('metadata:');
      for (const [key, value] of Object.entries(memory.content.metadata)) {
        lines.push(`  ${key}: ${JSON.stringify(value)}`);
      }
      lines.push('');
    }
  }
  
  // Anchor section
  if (memory.anchor) {
    if (memory.anchor.enabled && memory.anchor.signature) {
      const program = memory.anchor.program || 'memo';
      const sig = memory.anchor.signature;
      const slot = memory.anchor.slot || '';
      const blockTime = memory.anchor.blockTime || '';
      
      lines.push(`anchor: ${program}@${sig}/${slot}/${blockTime}`);
    } else if (memory.anchor.enabled) {
      lines.push(`anchor: enabled`);
    }
  }
  
  return lines.join('\n').trim();
}

/**
 * Parse TOON format back to memory object
 */
export function fromTOON(toon) {
  const lines = toon.split('\n');
  const memory = {
    content: {
      messages: [],
      tags: [],
      scores: {},
      metadata: {}
    },
    anchor: {
      enabled: false
    }
  };
  
  let currentSection = null;
  let summary = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    if (!trimmed) continue;
    
    // Schema
    if (trimmed.startsWith('@')) {
      memory.schema = trimmed.substring(1);
      continue;
    }
    
    // Section markers
    if (trimmed === 'scores:') {
      currentSection = 'scores';
      continue;
    }
    
    if (trimmed === 'metadata:') {
      currentSection = 'metadata';
      continue;
    }
    
    // Indented lines (scores/metadata)
    if (line.startsWith('  ') && currentSection) {
      const [key, ...valueParts] = trimmed.split(':');
      const value = valueParts.join(':').trim();
      
      if (currentSection === 'scores') {
        memory.content.scores[key] = parseFloat(value) || value;
      } else if (currentSection === 'metadata') {
        try {
          memory.content.metadata[key] = JSON.parse(value);
        } catch {
          memory.content.metadata[key] = value;
        }
      }
      continue;
    } else {
      currentSection = null;
    }
    
    // Key-value pairs
    if (trimmed.includes(':') && !trimmed.startsWith('[') && !trimmed.startsWith('#')) {
      const colonIndex = trimmed.indexOf(':');
      const key = trimmed.substring(0, colonIndex).trim();
      const value = trimmed.substring(colonIndex + 1).trim();
      
      switch (key) {
        case 'agent':
          memory.agent_id = value;
          break;
        case 'wallet':
          memory.wallet = value;
          break;
        case 'time':
          memory.timestamp = value;
          break;
        case 'date':
          memory.date = value;
          break;
        case 'session':
          memory.session_id = value;
          break;
        case 'cid':
          memory.cid = value === 'null' ? null : value;
          break;
        case 'sha256':
          memory.plaintext_sha256 = value === 'null' ? null : value;
          break;
        case 'prev_cid':
          memory.prev_cid = value === 'null' ? null : value;
          break;
        case 'prev_sha256':
          memory.prev_plaintext_sha256 = value === 'null' ? null : value;
          break;
        case 'prev':
          memory.prev_cid = value;
          break;
        case 'prev_hash':
          memory.prev_plaintext_sha256 = value;
          break;
        case 'hash':
          memory.plaintext_sha256 = value;
          break;
        case 'tags':
          memory.content.tags = value.split(',').map(t => t.trim());
          break;
        case 'anchor':
          parseAnchor(value, memory);
          break;
      }
      continue;
    }
    
    // Summary (# heading)
    if (trimmed.startsWith('#')) {
      summary = trimmed.substring(1).trim();
      memory.content.summary = summary;
      continue;
    }
    
    // Messages [timestamp] role: content
    if (trimmed.startsWith('[')) {
      const match = trimmed.match(/\[([^\]]+)\]\s+(\w+):\s+(.+)/);
      if (match) {
        const [, time, role, content] = match;
        const fullTimestamp = buildTimestamp(memory.date, time);
        
        memory.content.messages.push({
          role,
          content,
          timestamp: fullTimestamp
        });
      }
    }
  }
  
  return memory;
}

/**
 * Extract time from ISO timestamp
 */
function extractTime(timestamp) {
  if (!timestamp) return '00:00:00';
  
  try {
    const match = timestamp.match(/T(\d{2}:\d{2}:\d{2})/);
    return match ? match[1] : '00:00:00';
  } catch {
    return '00:00:00';
  }
}

/**
 * Build full timestamp from date and time
 */
function buildTimestamp(date, time) {
  if (!date) return new Date().toISOString();
  
  try {
    return `${date}T${time}Z`;
  } catch {
    return new Date().toISOString();
  }
}

/**
 * Parse anchor string
 */
function parseAnchor(value, memory) {
  if (value === 'enabled') {
    memory.anchor.enabled = true;
    return;
  }
  
  try {
    const [programPart, rest] = value.split('@');
    if (!rest) {
      memory.anchor.enabled = true;
      return;
    }
    
    const [sig, slot, blockTime] = rest.split('/');
    
    memory.anchor = {
      enabled: true,
      program: programPart,
      signature: sig,
      slot: slot ? parseInt(slot) : null,
      blockTime: blockTime ? parseInt(blockTime) : null
    };
  } catch (error) {
    memory.anchor.enabled = true;
  }
}

/**
 * Calculate size savings
 */
export function calculateSavings(memory) {
  const jsonCompact = JSON.stringify(memory);
  const jsonPretty = JSON.stringify(memory, null, 2);
  const toon = toTOON(memory);
  
  return {
    json: {
      compact: jsonCompact.length,
      pretty: jsonPretty.length
    },
    toon: toon.length,
    savings: {
      vsCompact: ((jsonCompact.length - toon.length) / jsonCompact.length * 100).toFixed(1) + '%',
      vsPretty: ((jsonPretty.length - toon.length) / jsonPretty.length * 100).toFixed(1) + '%'
    }
  };
}

/**
 * Validate TOON round-trip
 */
export function validateRoundTrip(memory) {
  try {
    const toon = toTOON(memory);
    const parsed = fromTOON(toon);
    
    // Check critical fields
    const checks = {
      schema: memory.schema === parsed.schema,
      agent_id: memory.agent_id === parsed.agent_id,
      wallet: memory.wallet === parsed.wallet,
      date: memory.date === parsed.date,
      hash: memory.plaintext_sha256 === parsed.plaintext_sha256,
      messageCount: memory.content?.messages?.length === parsed.content?.messages?.length
    };
    
    const allValid = Object.values(checks).every(v => v);
    
    return {
      valid: allValid,
      checks,
      original: memory,
      parsed
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message
    };
  }
}
