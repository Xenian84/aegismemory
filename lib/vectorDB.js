/**
 * @fileoverview Vector database for storing and searching embeddings
 * Simple in-memory vector store with file persistence
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export class VectorDB {
  constructor(config, logger = console) {
    this.config = config;
    this.logger = logger;
    this.embeddings = new Map(); // cid -> {embedding, metadata}
    
    // Storage path
    const stateDir = config.stateDir || (config.statePath ? join(config.statePath, '..') : join(process.env.HOME || '/tmp', '.aegismemory'));
    this.storagePath = config.vectorDbPath || join(stateDir, 'vectors.json');
  }

  /**
   * Initialize vector database
   */
  async init() {
    if (this.initialized) {
      return; // Already initialized
    }

    try {
      // Ensure storage directory exists
      const dir = join(this.storagePath, '..');
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
        this.logger.info(`Created vector DB directory: ${dir}`);
      }

      // Load existing embeddings
      if (existsSync(this.storagePath)) {
        const data = JSON.parse(readFileSync(this.storagePath, 'utf8'));
        this.embeddings = new Map(Object.entries(data));
        this.logger.info(`Vector DB loaded: ${this.embeddings.size} embeddings`);
      } else {
        this.logger.info('Vector DB initialized (empty)');
      }

      this.initialized = true;
    } catch (error) {
      this.logger.error(`Failed to initialize vector DB: ${error.message}`);
      throw error;
    }
  }

  /**
   * Save embeddings to disk
   * @private
   */
  _persist() {
    try {
      const data = Object.fromEntries(this.embeddings);
      writeFileSync(this.storagePath, JSON.stringify(data, null, 2));
    } catch (error) {
      this.logger.error(`Failed to persist vector DB: ${error.message}`);
    }
  }

  /**
   * Add embedding to database
   * @param {string} cid - IPFS CID (used as ID)
   * @param {number[]} embedding - 384-dimensional vector
   * @param {Object} metadata - Metadata (agent_id, timestamp, etc.)
   */
  async add(cid, embedding, metadata = {}) {
    if (!this.initialized) {
      await this.init();
    }

    this.embeddings.set(cid, { embedding, metadata });
    this._persist();
    this.logger.debug(`Added embedding for CID: ${cid}`);
  }

  /**
   * Update existing embedding
   * @param {string} cid - IPFS CID
   * @param {number[]} embedding - New embedding
   * @param {Object} metadata - New metadata
   */
  async update(cid, embedding, metadata = {}) {
    if (!this.initialized) {
      await this.init();
    }

    this.embeddings.set(cid, { embedding, metadata });
    this._persist();
    this.logger.debug(`Updated embedding for CID: ${cid}`);
  }

  /**
   * Calculate cosine similarity between two vectors
   * @private
   */
  _cosineSimilarity(a, b) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Search for similar embeddings
   * @param {number[]} queryEmbedding - Query embedding vector
   * @param {number} limit - Maximum number of results
   * @param {Object} filter - Metadata filter (e.g., {agent_id: "theo"})
   * @returns {Promise<Array>} Search results with CIDs, scores, and metadata
   */
  async search(queryEmbedding, limit = 10, filter = null) {
    if (!this.initialized) {
      await this.init();
    }

    try {
      // Calculate similarities for all embeddings
      const results = [];
      
      for (const [cid, entry] of this.embeddings.entries()) {
        // Apply filter if provided
        if (filter) {
          let matches = true;
          for (const [key, value] of Object.entries(filter)) {
            if (entry.metadata[key] !== value) {
              matches = false;
              break;
            }
          }
          if (!matches) continue;
        }

        // Calculate similarity
        const score = this._cosineSimilarity(queryEmbedding, entry.embedding);
        results.push({
          cid,
          score,
          metadata: entry.metadata
        });
      }

      // Sort by score (highest first) and limit
      results.sort((a, b) => b.score - a.score);
      return results.slice(0, limit);
    } catch (error) {
      this.logger.error(`Search failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get embedding by CID
   * @param {string} cid - IPFS CID
   * @returns {Promise<Object|null>} Embedding and metadata, or null if not found
   */
  async get(cid) {
    if (!this.initialized) {
      await this.init();
    }

    const entry = this.embeddings.get(cid);
    if (!entry) {
      return null;
    }

    return {
      cid,
      embedding: entry.embedding,
      metadata: entry.metadata
    };
  }

  /**
   * Delete embedding by CID
   * @param {string} cid - IPFS CID
   */
  async delete(cid) {
    if (!this.initialized) {
      await this.init();
    }

    this.embeddings.delete(cid);
    this._persist();
    this.logger.debug(`Deleted embedding for CID: ${cid}`);
  }

  /**
   * Get total count of embeddings
   * @returns {Promise<number>} Total count
   */
  async count() {
    if (!this.initialized) {
      await this.init();
    }

    return this.embeddings.size;
  }

  /**
   * Clear all embeddings (use with caution!)
   */
  async clear() {
    if (!this.initialized) {
      await this.init();
    }

    this.embeddings.clear();
    this._persist();
    this.logger.info('Vector DB cleared');
  }

  /**
   * Get statistics about the vector database
   * @returns {Promise<Object>} Statistics
   */
  async getStats() {
    if (!this.initialized) {
      await this.init();
    }

    try {
      const count = this.embeddings.size;
      const agents = new Set();
      let oldestTimestamp = Infinity;
      let newestTimestamp = 0;

      for (const entry of this.embeddings.values()) {
        if (entry.metadata.agent_id) {
          agents.add(entry.metadata.agent_id);
        }
        if (entry.metadata.timestamp) {
          oldestTimestamp = Math.min(oldestTimestamp, entry.metadata.timestamp);
          newestTimestamp = Math.max(newestTimestamp, entry.metadata.timestamp);
        }
      }

      return {
        total_embeddings: count,
        unique_agents: agents.size,
        oldest_memory: oldestTimestamp !== Infinity ? new Date(oldestTimestamp).toISOString() : null,
        newest_memory: newestTimestamp > 0 ? new Date(newestTimestamp).toISOString() : null,
        storage_path: this.storagePath
      };
    } catch (error) {
      this.logger.error(`Failed to get stats: ${error.message}`);
      return {
        total_embeddings: 0,
        unique_agents: 0,
        oldest_memory: null,
        newest_memory: null,
        storage_path: this.storagePath
      };
    }
  }
}
