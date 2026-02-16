/**
 * Structured logger with redaction support
 */

const LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

const SENSITIVE_KEYS = [
  'walletSecretKeyBase58',
  'anchorWalletSecretKeyBase58',
  'secretKey',
  'privateKey',
  'secret',
  'password',
  'token',
  'key'
];

class Logger {
  constructor(options = {}) {
    this.level = options.level || 'info';
    this.json = options.json !== false;
    this.name = options.name || 'aegismemory';
  }

  /**
   * Redact sensitive information from objects
   */
  redact(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.redact(item));
    }
    
    const redacted = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = SENSITIVE_KEYS.some(sk => lowerKey.includes(sk.toLowerCase()));
      
      if (isSensitive && typeof value === 'string' && value.length > 0) {
        redacted[key] = '[REDACTED]';
      } else if (value && typeof value === 'object') {
        redacted[key] = this.redact(value);
      } else {
        redacted[key] = value;
      }
    }
    
    return redacted;
  }

  log(level, message, meta = {}) {
    if (LEVELS[level] < LEVELS[this.level]) return;
    
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      name: this.name,
      message,
      ...this.redact(meta)
    };
    
    if (this.json) {
      console.log(JSON.stringify(entry));
    } else {
      const metaStr = Object.keys(meta).length > 0 ? ' ' + JSON.stringify(this.redact(meta)) : '';
      console.log(`[${entry.timestamp}] ${level.toUpperCase()} ${this.name}: ${message}${metaStr}`);
    }
  }

  debug(message, meta) {
    this.log('debug', message, meta);
  }

  info(message, meta) {
    this.log('info', message, meta);
  }

  warn(message, meta) {
    this.log('warn', message, meta);
  }

  error(message, meta) {
    this.log('error', message, meta);
  }
}

export function createLogger(options) {
  return new Logger(options);
}
