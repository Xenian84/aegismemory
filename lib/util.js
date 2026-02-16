/**
 * Utility functions for retry, backoff, timeouts
 */

/**
 * Sleep for ms milliseconds
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff with jitter
 */
export function calculateBackoff(attempt, baseMs = 1000, maxMs = 30000) {
  const exponential = Math.min(baseMs * Math.pow(2, attempt), maxMs);
  const jitter = Math.random() * exponential * 0.1; // 10% jitter
  return Math.floor(exponential + jitter);
}

/**
 * Retry a function with exponential backoff
 */
export async function retry(fn, options = {}) {
  const {
    maxRetries = 3,
    baseMs = 1000,
    maxMs = 30000,
    shouldRetry = () => true,
    onRetry = () => {}
  } = options;

  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries || !shouldRetry(error, attempt)) {
        throw error;
      }
      
      const backoffMs = calculateBackoff(attempt, baseMs, maxMs);
      onRetry(error, attempt, backoffMs);
      await sleep(backoffMs);
    }
  }
  
  throw lastError;
}

/**
 * Execute function with timeout
 */
export async function withTimeout(fn, timeoutMs, timeoutError = new Error('Timeout')) {
  return Promise.race([
    fn(),
    sleep(timeoutMs).then(() => {
      throw timeoutError;
    })
  ]);
}

/**
 * Execute promises with limited concurrency
 */
export async function parallelLimit(items, concurrency, fn) {
  const results = [];
  const executing = [];
  
  for (const [index, item] of items.entries()) {
    const promise = Promise.resolve().then(() => fn(item, index));
    results.push(promise);
    
    if (concurrency <= items.length) {
      const e = promise.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      
      if (executing.length >= concurrency) {
        await Promise.race(executing);
      }
    }
  }
  
  return Promise.all(results);
}

/**
 * Deterministic JSON stringify with sorted keys
 */
export function canonicalStringify(obj) {
  if (obj === null) return 'null';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map(item => canonicalStringify(item)).join(',') + ']';
  }
  
  const keys = Object.keys(obj).sort();
  const pairs = keys.map(key => {
    return JSON.stringify(key) + ':' + canonicalStringify(obj[key]);
  });
  
  return '{' + pairs.join(',') + '}';
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error) {
  if (!error) return false;
  
  const message = error.message?.toLowerCase() || '';
  const code = error.code?.toLowerCase() || '';
  
  // Network errors
  if (code === 'econnreset' || code === 'etimedout' || code === 'enotfound') {
    return true;
  }
  
  // HTTP errors
  if (error.status >= 500 && error.status < 600) {
    return true;
  }
  
  if (error.status === 429) { // Rate limit
    return true;
  }
  
  // Common retryable messages
  if (message.includes('timeout') || 
      message.includes('network') ||
      message.includes('econnreset') ||
      message.includes('socket hang up')) {
    return true;
  }
  
  return false;
}
