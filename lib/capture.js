/**
 * Memory capture and sanitization
 */

/**
 * Capture memory from context
 */
export function captureMemory(ctx, strategy = 'last_turn', maxMessageChars = 50000) {
  if (strategy === 'last_turn') {
    return captureLastTurn(ctx, maxMessageChars);
  } else if (strategy === 'full_session') {
    return captureFullSession(ctx, maxMessageChars);
  } else {
    throw new Error(`Unknown capture strategy: ${strategy}`);
  }
}

/**
 * Capture last turn only
 */
function captureLastTurn(ctx, maxMessageChars) {
  const messages = [];
  
  // Handle OpenClaw format: ctx.messages array
  if (ctx.messages && Array.isArray(ctx.messages)) {
    // Find last user message index
    const lastUserIndex = ctx.messages
      .map((m, idx) => ({ m, idx }))
      .filter(({ m }) => m?.role === 'user')
      .map(({ idx }) => idx)
      .pop();
    
    if (lastUserIndex !== undefined) {
      // Get messages from last user message onwards
      const slice = ctx.messages.slice(lastUserIndex);
      
      for (const msg of slice) {
        if (!msg || !msg.role) continue;
        
        const content = extractTextContent(msg.content);
        if (!content) continue;
        
        messages.push(sanitizeMessage({
          role: msg.role,
          content: truncate(content, maxMessageChars),
          timestamp: msg.timestamp || new Date().toISOString()
        }));
      }
    }
  }
  // Fallback to old format for backwards compatibility
  else if (ctx.userMessage || ctx.assistantMessage) {
    if (ctx.userMessage) {
      messages.push(sanitizeMessage({
        role: 'user',
        content: truncate(ctx.userMessage, maxMessageChars),
        timestamp: ctx.timestamp || new Date().toISOString()
      }));
    }
    
    if (ctx.assistantMessage) {
      messages.push(sanitizeMessage({
        role: 'assistant',
        content: truncate(ctx.assistantMessage, maxMessageChars),
        timestamp: new Date().toISOString()
      }));
    }
  }
  
  return {
    summary: generateSummary(messages),
    messages,
    tags: extractTags(messages),
    metadata: {
      captureStrategy: 'last_turn',
      messageCount: messages.length
    }
  };
}

/**
 * Capture full session
 */
function captureFullSession(ctx, maxMessageChars) {
  const messages = [];
  
  // Get all messages from context
  if (ctx.messages && Array.isArray(ctx.messages)) {
    for (const msg of ctx.messages) {
      if (!msg || !msg.role) continue;
      
      const content = extractTextContent(msg.content);
      if (!content) continue;
      
      messages.push(sanitizeMessage({
        role: msg.role,
        content: truncate(content, maxMessageChars),
        timestamp: msg.timestamp || new Date().toISOString()
      }));
    }
  } else {
    // Fallback to last turn
    return captureLastTurn(ctx, maxMessageChars);
  }
  
  return {
    summary: generateSummary(messages),
    messages,
    tags: extractTags(messages),
    metadata: {
      captureStrategy: 'full_session',
      messageCount: messages.length
    }
  };
}

/**
 * Extract text content from message content (can be string or array of content blocks)
 */
function extractTextContent(content) {
  if (typeof content === 'string') {
    return content;
  }
  
  if (Array.isArray(content)) {
    return content
      .filter(block => block?.type === 'text' && block?.text)
      .map(block => block.text)
      .join('\n');
  }
  
  return '';
}

/**
 * Sanitize message (remove sensitive data)
 */
function sanitizeMessage(message) {
  const sanitized = { ...message };
  
  // Redact potential secrets
  if (typeof sanitized.content === 'string') {
    // Remove base58 private keys (common pattern)
    sanitized.content = sanitized.content.replace(/[1-9A-HJ-NP-Za-km-z]{64,}/g, '[REDACTED_KEY]');
    
    // Remove potential API keys
    sanitized.content = sanitized.content.replace(/sk-[a-zA-Z0-9]{32,}/g, '[REDACTED_API_KEY]');
  }
  
  return sanitized;
}

/**
 * Truncate text to max length
 */
function truncate(text, maxLength) {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '... [truncated]';
}

/**
 * Generate summary from messages
 */
function generateSummary(messages) {
  if (messages.length === 0) return 'No messages';
  
  const userMessages = messages.filter(m => m.role === 'user');
  const assistantMessages = messages.filter(m => m.role === 'assistant');
  
  const parts = [];
  
  if (userMessages.length > 0) {
    const firstUser = userMessages[0].content.slice(0, 100);
    parts.push(`User: ${firstUser}`);
  }
  
  if (assistantMessages.length > 0) {
    const firstAssistant = assistantMessages[0].content.slice(0, 100);
    parts.push(`Assistant: ${firstAssistant}`);
  }
  
  return parts.join(' | ');
}

/**
 * Extract tags from messages
 */
function extractTags(messages) {
  const tags = new Set();
  
  for (const msg of messages) {
    const content = msg.content?.toLowerCase() || '';
    
    // Extract common topics
    if (content.includes('error') || content.includes('failed')) {
      tags.add('error');
    }
    
    if (content.includes('success') || content.includes('completed')) {
      tags.add('success');
    }
    
    if (content.includes('code') || content.includes('function')) {
      tags.add('code');
    }
    
    if (content.includes('question') || content.includes('?')) {
      tags.add('question');
    }
  }
  
  return Array.from(tags);
}
