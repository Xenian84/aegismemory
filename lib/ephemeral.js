/**
 * @fileoverview Ephemeral memory management
 * Auto-expiring memories stored locally (not on IPFS/chain)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { createEncryptedPayload, decryptPayload, sha256 } from './cryptoBox.js';
import { canonicalStringify } from './util.js';

export class EphemeralMemory {
  constructor(config, logger = console) {
    this.config = config;
    this.logger = logger;
    
    // Storage directory
    const stateDir = config.stateDir || join(config.statePath, '..');
    this.ephemeralDir = config.ephemeralDir || join(stateDir, 'ephemeral');
    
    // Default TTL: 24 hours
    this.defaultTtl = config.defaultTtl || 86400;
  }

  /**
   * Initialize ephemeral storage
   */
  async init() {
    if (this.initialized) {
      return;
    }

    try {
      // Ensure directory exists
      if (!existsSync(this.ephemeralDir)) {
        mkdirSync(this.ephemeralDir, { recursive: true });
        this.logger.info(`Created ephemeral directory: ${this.ephemeralDir}`);
      }

      this.initialized = true;
      this.logger.info('Ephemeral memory initialized');
    } catch (error) {
      this.logger.error(`Failed to initialize ephemeral memory: ${error.message}`);
      throw error;
    }
  }

  /**
   * Save ephemeral memory
   * @param {string} agentId - Agent ID
   * @param {Object} memory - Memory object
   * @param {number} ttlSeconds - Time to live in seconds
   * @returns {Promise<string>} Memory ID
   */
  async save(agentId, memory, ttlSeconds = null) {
    if (!this.initialized) {
      await this.init();
    }

    const ttl = ttlSeconds || this.defaultTtl;
    const expiresAt = Date.now() + (ttl * 1000);

    try {
      // Add ephemeral metadata
      const ephemeralMemory = {
        ...memory,
        memory_type: 'ephemeral',
        expires_at: expiresAt,
        ttl_seconds: ttl,
        created_at: Date.now()
      };

      // Generate ID (hash of content)
      const canonical = canonicalStringify(ephemeralMemory);
      const id = sha256(canonical);

      // Encrypt
      const encrypted = await createEncryptedPayload(
        canonical,
        this.config.walletPubkey,
        this.config.walletSecretKeyBase58,
        'EPHEMERAL_KEY_V1'
      );

      // Save to file
      const filename = `${agentId}-${id}.json`;
      const filepath = join(this.ephemeralDir, filename);
      
      writeFileSync(filepath, JSON.stringify({
        id,
        agentId,
        encrypted,
        expiresAt,
        createdAt: ephemeralMemory.created_at
      }, null, 2));

      this.logger.info(`Ephemeral memory saved: ${id}`, { agentId, ttl });
      
      return id;
    } catch (error) {
      this.logger.error(`Failed to save ephemeral memory: ${error.message}`);
      throw error;
    }
  }

  /**
   * Load ephemeral memory by ID
   * @param {string} id - Memory ID
   * @returns {Promise<Object|null>} Memory object or null if expired/not found
   */
  async load(id) {
    if (!this.initialized) {
      await this.init();
    }

    try {
      // Find file
      const files = readdirSync(this.ephemeralDir);
      const file = files.find(f => f.includes(id));
      
      if (!file) {
        return null;
      }

      const filepath = join(this.ephemeralDir, file);
      const data = JSON.parse(readFileSync(filepath, 'utf8'));

      // Check if expired
      if (Date.now() > data.expiresAt) {
        this.logger.info(`Memory ${id} has expired, deleting`);
        unlinkSync(filepath);
        return null;
      }

      // Decrypt
      const plaintext = await decryptPayload(
        data.encrypted,
        this.config.walletSecretKeyBase58
      );

      return JSON.parse(plaintext);
    } catch (error) {
      this.logger.error(`Failed to load ephemeral memory: ${error.message}`);
      return null;
    }
  }

  /**
   * List all ephemeral memories for an agent
   * @param {string} agentId - Agent ID (optional, lists all if not provided)
   * @returns {Promise<Array>} Array of memory metadata
   */
  async list(agentId = null) {
    if (!this.initialized) {
      await this.init();
    }

    try {
      const files = readdirSync(this.ephemeralDir);
      const memories = [];

      for (const file of files) {
        if (agentId && !file.startsWith(`${agentId}-`)) {
          continue;
        }

        try {
          const filepath = join(this.ephemeralDir, file);
          const data = JSON.parse(readFileSync(filepath, 'utf8'));

          // Check if expired
          const isExpired = Date.now() > data.expiresAt;

          memories.push({
            id: data.id,
            agentId: data.agentId,
            createdAt: new Date(data.createdAt).toISOString(),
            expiresAt: new Date(data.expiresAt).toISOString(),
            isExpired,
            timeRemaining: isExpired ? 0 : Math.floor((data.expiresAt - Date.now()) / 1000)
          });
        } catch (error) {
          this.logger.error(`Failed to read ${file}: ${error.message}`);
        }
      }

      return memories;
    } catch (error) {
      this.logger.error(`Failed to list ephemeral memories: ${error.message}`);
      return [];
    }
  }

  /**
   * Clean expired memories
   * @returns {Promise<number>} Number of memories deleted
   */
  async cleanExpired() {
    if (!this.initialized) {
      await this.init();
    }

    let deleted = 0;

    try {
      const files = readdirSync(this.ephemeralDir);

      for (const file of files) {
        try {
          const filepath = join(this.ephemeralDir, file);
          const data = JSON.parse(readFileSync(filepath, 'utf8'));

          // Delete if expired
          if (Date.now() > data.expiresAt) {
            unlinkSync(filepath);
            deleted++;
            this.logger.debug(`Deleted expired memory: ${data.id}`);
          }
        } catch (error) {
          this.logger.error(`Failed to process ${file}: ${error.message}`);
        }
      }

      if (deleted > 0) {
        this.logger.info(`Cleaned ${deleted} expired memories`);
      }

      return deleted;
    } catch (error) {
      this.logger.error(`Failed to clean expired memories: ${error.message}`);
      return 0;
    }
  }

  /**
   * Promote ephemeral memory to permanent
   * @param {string} id - Memory ID
   * @returns {Promise<Object>} Memory object ready for permanent storage
   */
  async promote(id) {
    if (!this.initialized) {
      await this.init();
    }

    try {
      // Load ephemeral memory
      const memory = await this.load(id);
      if (!memory) {
        throw new Error(`Memory ${id} not found or expired`);
      }

      // Remove ephemeral metadata
      delete memory.memory_type;
      delete memory.expires_at;
      delete memory.ttl_seconds;
      delete memory.created_at;

      // Delete ephemeral file
      const files = readdirSync(this.ephemeralDir);
      const file = files.find(f => f.includes(id));
      if (file) {
        unlinkSync(join(this.ephemeralDir, file));
        this.logger.info(`Promoted ephemeral memory ${id} to permanent`);
      }

      return memory;
    } catch (error) {
      this.logger.error(`Failed to promote memory: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get statistics
   * @returns {Promise<Object>} Statistics
   */
  async getStats() {
    if (!this.initialized) {
      await this.init();
    }

    try {
      const all = await this.list();
      const expired = all.filter(m => m.isExpired);
      const active = all.filter(m => !m.isExpired);

      return {
        total: all.length,
        active: active.length,
        expired: expired.length,
        storage_path: this.ephemeralDir
      };
    } catch (error) {
      this.logger.error(`Failed to get stats: ${error.message}`);
      return {
        total: 0,
        active: 0,
        expired: 0,
        storage_path: this.ephemeralDir
      };
    }
  }
}
