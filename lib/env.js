import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

/**
 * Load environment variables from .env files
 * Searches in order: ~/.openclaw/.env, ~/.moltbot/.env, ~/.clawdbot/.env
 */
export function loadEnv() {
  const envPaths = [
    join(homedir(), '.openclaw', '.env'),
    join(homedir(), '.moltbot', '.env'),
    join(homedir(), '.clawdbot', '.env')
  ];

  const env = {};

  for (const envPath of envPaths) {
    if (existsSync(envPath)) {
      try {
        const content = readFileSync(envPath, 'utf8');
        const lines = content.split('\n');
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          
          const eqIndex = trimmed.indexOf('=');
          if (eqIndex === -1) continue;
          
          const key = trimmed.slice(0, eqIndex).trim();
          let value = trimmed.slice(eqIndex + 1).trim();
          
          // Remove quotes
          if ((value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          
          env[key] = value;
        }
      } catch (err) {
        // Silently continue if env file can't be read
      }
    }
  }

  return env;
}

/**
 * Get environment variable with fallback
 */
export function getEnv(key, defaultValue = undefined) {
  return process.env[key] || defaultValue;
}

/**
 * Expand tilde in paths
 */
export function expandPath(path) {
  if (!path) return path;
  if (path.startsWith('~/')) {
    return join(homedir(), path.slice(2));
  }
  return path;
}
