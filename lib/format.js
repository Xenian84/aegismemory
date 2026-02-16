/**
 * Memory formatting for prompt context
 */

/**
 * Format memories for prepend context
 */
export function formatMemories(memories, maxChars = 20000) {
  if (!memories || memories.length === 0) {
    return '';
  }
  
  const sections = [];
  
  sections.push('# Previous Memories\n');
  sections.push('The following are relevant memories from previous interactions:\n');
  
  let currentLength = sections.join('').length;
  const includedMemories = [];
  
  // Include memories from newest to oldest until we hit the limit
  for (const memory of memories) {
    const formatted = formatSingleMemory(memory);
    
    if (currentLength + formatted.length > maxChars) {
      // Check if we can include a truncated version
      const remaining = maxChars - currentLength;
      if (remaining > 200) {
        includedMemories.push(truncateMemory(memory, remaining));
      }
      break;
    }
    
    includedMemories.push(formatted);
    currentLength += formatted.length;
  }
  
  if (includedMemories.length === 0) {
    return '';
  }
  
  sections.push(includedMemories.join('\n---\n'));
  sections.push('\n# End of Previous Memories\n');
  
  return sections.join('\n');
}

/**
 * Format single memory
 */
function formatSingleMemory(memory) {
  const parts = [];
  
  // Header
  parts.push(`## Memory from ${memory.date}`);
  
  if (memory.timestamp) {
    parts.push(`Time: ${memory.timestamp}`);
  }
  
  if (memory.content?.summary) {
    parts.push(`Summary: ${memory.content.summary}`);
  }
  
  // Messages
  if (memory.content?.messages && memory.content.messages.length > 0) {
    parts.push('\nMessages:');
    
    for (const msg of memory.content.messages) {
      const role = msg.role || 'unknown';
      const content = msg.content || '';
      parts.push(`- ${role}: ${content.slice(0, 500)}${content.length > 500 ? '...' : ''}`);
    }
  }
  
  // Tags
  if (memory.content?.tags && memory.content.tags.length > 0) {
    parts.push(`\nTags: ${memory.content.tags.join(', ')}`);
  }
  
  return parts.join('\n');
}

/**
 * Truncate memory to fit within char limit
 */
function truncateMemory(memory, maxChars) {
  const header = `## Memory from ${memory.date}\n`;
  const summary = memory.content?.summary ? `Summary: ${memory.content.summary}\n` : '';
  
  let available = maxChars - header.length - summary.length - 50; // 50 for footer
  
  if (available <= 0) {
    return header + '[Memory truncated due to size limit]';
  }
  
  const parts = [header, summary];
  
  // Try to include first message
  if (memory.content?.messages && memory.content.messages.length > 0) {
    const firstMsg = memory.content.messages[0];
    const msgText = `- ${firstMsg.role}: ${firstMsg.content.slice(0, available)}`;
    parts.push(msgText);
  }
  
  parts.push('\n[Memory truncated]');
  
  return parts.join('\n');
}

/**
 * Calculate token budget (rough estimate: 1 token ≈ 4 chars)
 */
export function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

/**
 * Format with token budget
 */
export function formatWithTokenBudget(memories, maxTokens = 5000) {
  const maxChars = maxTokens * 4;
  return formatMemories(memories, maxChars);
}
