import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import { dirname } from 'path';

/**
 * Durable job queue with JSONL persistence
 */
export class Queue {
  constructor(queuePath, logger) {
    this.queuePath = queuePath;
    this.logger = logger;
    this.jobs = [];
    this.processing = new Set();
    
    this.load();
  }

  /**
   * Load queue from disk
   */
  load() {
    try {
      if (existsSync(this.queuePath)) {
        const content = readFileSync(this.queuePath, 'utf8');
        const lines = content.trim().split('\n').filter(l => l);
        
        for (const line of lines) {
          try {
            const job = JSON.parse(line);
            this.jobs.push(job);
          } catch (err) {
            this.logger.warn('Failed to parse queue line', { error: err.message });
          }
        }
        
        this.logger.debug('Queue loaded', { path: this.queuePath, jobs: this.jobs.length });
      }
    } catch (error) {
      this.logger.error('Failed to load queue', { error: error.message, path: this.queuePath });
    }
  }

  /**
   * Save entire queue to disk (rewrite)
   */
  save() {
    try {
      const dir = dirname(this.queuePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      
      const lines = this.jobs.map(job => JSON.stringify(job)).join('\n');
      writeFileSync(this.queuePath, lines + '\n', 'utf8');
      
      this.logger.debug('Queue saved', { path: this.queuePath, jobs: this.jobs.length });
    } catch (error) {
      this.logger.error('Failed to save queue', { error: error.message, path: this.queuePath });
      throw error;
    }
  }

  /**
   * Enqueue a job
   */
  enqueue(type, payload, options = {}) {
    const job = {
      id: this._generateId(),
      type,
      payload,
      createdAt: new Date().toISOString(),
      attempts: 0,
      maxRetries: options.maxRetries || 6,
      nextRetryAt: null,
      lastError: null
    };
    
    // Check for duplicate by key
    if (options.key) {
      const existing = this.jobs.find(j => j.payload?.key === options.key);
      if (existing) {
        this.logger.debug('Job already queued', { key: options.key });
        return existing;
      }
      job.payload.key = options.key;
    }
    
    this.jobs.push(job);
    
    // Append to file
    try {
      const dir = dirname(this.queuePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      appendFileSync(this.queuePath, JSON.stringify(job) + '\n', 'utf8');
    } catch (error) {
      this.logger.error('Failed to append to queue', { error: error.message });
    }
    
    this.logger.debug('Job enqueued', { id: job.id, type: job.type });
    return job;
  }

  /**
   * Get next job to process
   */
  getNext() {
    const now = new Date();
    
    for (const job of this.jobs) {
      if (this.processing.has(job.id)) continue;
      
      if (job.nextRetryAt && new Date(job.nextRetryAt) > now) {
        continue;
      }
      
      if (job.attempts >= job.maxRetries) {
        continue;
      }
      
      return job;
    }
    
    return null;
  }

  /**
   * Mark job as processing
   */
  markProcessing(jobId) {
    this.processing.add(jobId);
  }

  /**
   * Mark job as complete and remove
   */
  complete(jobId) {
    this.processing.delete(jobId);
    this.jobs = this.jobs.filter(j => j.id !== jobId);
    this.save();
    this.logger.debug('Job completed', { id: jobId });
  }

  /**
   * Mark job as failed and schedule retry
   */
  fail(jobId, error, backoffMs = 1000) {
    this.processing.delete(jobId);
    
    const job = this.jobs.find(j => j.id === jobId);
    if (!job) return;
    
    job.attempts++;
    job.lastError = error.message || String(error);
    
    if (job.attempts < job.maxRetries) {
      const delay = backoffMs * Math.pow(2, job.attempts - 1);
      job.nextRetryAt = new Date(Date.now() + delay).toISOString();
      this.logger.debug('Job failed, will retry', { 
        id: jobId, 
        attempts: job.attempts, 
        maxRetries: job.maxRetries,
        nextRetryAt: job.nextRetryAt 
      });
    } else {
      this.logger.error('Job failed permanently', { 
        id: jobId, 
        attempts: job.attempts,
        error: job.lastError 
      });
    }
    
    this.save();
  }

  /**
   * Get queue size
   */
  size() {
    return this.jobs.length;
  }

  /**
   * Get pending jobs count
   */
  pendingCount() {
    const now = new Date();
    return this.jobs.filter(j => {
      if (this.processing.has(j.id)) return false;
      if (j.attempts >= j.maxRetries) return false;
      if (j.nextRetryAt && new Date(j.nextRetryAt) > now) return false;
      return true;
    }).length;
  }

  /**
   * Generate unique job ID
   */
  _generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
