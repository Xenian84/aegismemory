/**
 * Simple metrics collection
 */

class Metrics {
  constructor() {
    this.counters = new Map();
    this.timers = new Map();
  }

  /**
   * Increment a counter
   */
  inc(name, value = 1, labels = {}) {
    const key = this._makeKey(name, labels);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + value);
  }

  /**
   * Record a timer value (in milliseconds)
   */
  recordTime(name, value, labels = {}) {
    const key = this._makeKey(name, labels);
    const values = this.timers.get(key) || [];
    values.push(value);
    this.timers.set(key, values);
  }

  /**
   * Get counter value
   */
  getCounter(name, labels = {}) {
    const key = this._makeKey(name, labels);
    return this.counters.get(key) || 0;
  }

  /**
   * Get timer stats
   */
  getTimerStats(name, labels = {}) {
    const key = this._makeKey(name, labels);
    const values = this.timers.get(key) || [];
    
    if (values.length === 0) {
      return { count: 0, min: 0, max: 0, avg: 0, sum: 0 };
    }
    
    const sum = values.reduce((a, b) => a + b, 0);
    const sorted = [...values].sort((a, b) => a - b);
    
    return {
      count: values.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / values.length,
      sum,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }

  /**
   * Get all metrics
   */
  getAll() {
    const result = {
      counters: {},
      timers: {}
    };
    
    for (const [key, value] of this.counters.entries()) {
      result.counters[key] = value;
    }
    
    for (const [key] of this.timers.entries()) {
      result.timers[key] = this.getTimerStats(key.split('|')[0], this._parseLabels(key));
    }
    
    return result;
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.counters.clear();
    this.timers.clear();
  }

  _makeKey(name, labels) {
    if (Object.keys(labels).length === 0) return name;
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return `${name}|${labelStr}`;
  }

  _parseLabels(key) {
    const parts = key.split('|');
    if (parts.length < 2) return {};
    
    const labels = {};
    const pairs = parts[1].split(',');
    for (const pair of pairs) {
      const [k, v] = pair.split('=');
      labels[k] = v;
    }
    return labels;
  }
}

export { Metrics };
export const metrics = new Metrics();
