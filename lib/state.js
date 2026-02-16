import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

/**
 * Durable state management
 * Stores: lastCid, lastPlaintextSha256, lastAnchoredDate per wallet+agent_id
 */
export class State {
  constructor(statePath, logger) {
    this.statePath = statePath;
    this.logger = logger;
    this.data = {
      version: 1,
      agents: {} // { "wallet:agentId": { lastCid, lastPlaintextSha256, lastAnchoredDate } }
    };
    
    this.load();
  }

  /**
   * Load state from disk
   */
  load() {
    try {
      if (existsSync(this.statePath)) {
        const content = readFileSync(this.statePath, 'utf8');
        const loaded = JSON.parse(content);
        // Merge with defaults to ensure structure
        this.data = {
          version: loaded.version || 1,
          agents: loaded.agents || {}
        };
        this.logger.debug('State loaded', { path: this.statePath });
      } else {
        this.logger.debug('No existing state file', { path: this.statePath });
      }
    } catch (error) {
      this.logger.error('Failed to load state', { error: error.message, path: this.statePath });
      // Continue with empty state
    }
  }

  /**
   * Save state to disk
   */
  save() {
    try {
      const dir = dirname(this.statePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      
      writeFileSync(this.statePath, JSON.stringify(this.data, null, 2), 'utf8');
      this.logger.debug('State saved', { path: this.statePath });
    } catch (error) {
      this.logger.error('Failed to save state', { error: error.message, path: this.statePath });
      throw error;
    }
  }

  /**
   * Get agent key
   */
  _getKey(wallet, agentId) {
    return `${wallet}:${agentId}`;
  }

  /**
   * Get agent state
   */
  getAgent(wallet, agentId) {
    const key = this._getKey(wallet, agentId);
    return this.data.agents[key] || {
      lastCid: null,
      lastPlaintextSha256: null,
      lastAnchoredDate: null
    };
  }

  /**
   * Set agent state
   */
  setAgent(wallet, agentId, updates) {
    const key = this._getKey(wallet, agentId);
    const current = this.getAgent(wallet, agentId);
    
    this.data.agents[key] = {
      ...current,
      ...updates
    };
    
    this.save();
  }

  /**
   * Get last CID for agent
   */
  getLastCid(wallet, agentId) {
    return this.getAgent(wallet, agentId).lastCid;
  }

  /**
   * Set last CID for agent
   */
  setLastCid(wallet, agentId, cid, plaintextSha256) {
    this.setAgent(wallet, agentId, {
      lastCid: cid,
      lastPlaintextSha256: plaintextSha256
    });
  }

  /**
   * Get last anchored date for agent
   */
  getLastAnchoredDate(wallet, agentId) {
    return this.getAgent(wallet, agentId).lastAnchoredDate;
  }

  /**
   * Set last anchored date for agent
   */
  setLastAnchoredDate(wallet, agentId, date) {
    this.setAgent(wallet, agentId, {
      lastAnchoredDate: date
    });
  }

  /**
   * Get all agents
   */
  getAllAgents() {
    return Object.keys(this.data.agents);
  }
}
