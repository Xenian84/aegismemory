/**
 * @fileoverview Semantic search API for AegisMemory
 * High-level interface for searching memories by natural language queries
 */

import { decryptPayload } from './cryptoBox.js';
import { fromTOON } from './toon.js';

export class SemanticSearch {
  constructor(config, embeddings, vectorDB, ipfsFetch, logger = console) {
    this.config = config;
    this.embeddings = embeddings;
    this.vectorDB = vectorDB;
    this.ipfsFetch = ipfsFetch;
    this.logger = logger;
  }

  /**
   * Search memories by natural language query
   * @param {string} query - Natural language search query
   * @param {Object} options - Search options
   * @param {number} options.limit - Maximum number of results (default: 10)
   * @param {string} options.agentId - Filter by agent ID (default: null)
   * @param {number} options.minScore - Minimum relevance score 0-1 (default: 0.5)
   * @param {boolean} options.decrypt - Whether to decrypt and return full memories (default: true)
   * @returns {Promise<Array>} Array of memories with relevance scores
   */
  async search(query, options = {}) {
    const {
      limit = 10,
      agentId = null,
      minScore = 0.5,
      decrypt = true
    } = options;

    this.logger.info(`Searching for: "${query}"`);

    try {
      // Generate query embedding
      const queryEmbedding = await this.embeddings.embed(query);

      // Search vector DB (get more results to filter by score)
      const filter = agentId ? { agent_id: agentId } : null;
      const results = await this.vectorDB.search(
        queryEmbedding,
        limit * 2, // Get 2x, filter by score
        filter
      );

      if (results.length === 0) {
        this.logger.info('No results found');
        return [];
      }

      // Filter by minimum score
      const filtered = results.filter(r => r.score >= minScore);
      this.logger.info(`Found ${filtered.length} results above score ${minScore}`);

      if (!decrypt) {
        // Return just CIDs and scores
        return filtered.slice(0, limit).map(r => ({
          cid: r.cid,
          relevance_score: r.score,
          metadata: r.metadata,
          encrypted: true
        }));
      }

      // Fetch and decrypt memories
      const memories = [];
      for (const result of filtered.slice(0, limit)) {
        try {
          const memory = await this._fetchMemory(result.cid);
          memories.push({
            ...memory,
            relevance_score: result.score,
            search_metadata: result.metadata
          });
        } catch (error) {
          this.logger.error(`Failed to fetch ${result.cid}: ${error.message}`);
        }
      }

      return memories;
    } catch (error) {
      this.logger.error(`Search failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fetch and decrypt a single memory by CID
   * @private
   * @param {string} cid - IPFS CID
   * @returns {Promise<Object>} Decrypted memory object
   */
  async _fetchMemory(cid) {
    // Fetch from IPFS
    const encrypted = await this.ipfsFetch.fetch(cid);

    // Decrypt
    const plaintext = await decryptPayload(
      encrypted,
      this.config.walletSecretKeyBase58,
      'IPFS_ENCRYPTION_KEY_V1'
    );

    // Parse (JSON or TOON)
    let memory;
    if (plaintext.startsWith('@aegismemory')) {
      memory = fromTOON(plaintext);
    } else {
      memory = JSON.parse(plaintext);
    }

    return memory;
  }

  /**
   * Find similar memories to a given memory
   * @param {string} cid - CID of the reference memory
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Similar memories
   */
  async findSimilar(cid, options = {}) {
    const { limit = 10 } = options;

    this.logger.info(`Finding memories similar to ${cid}`);

    try {
      // Get embedding for this CID
      const entry = await this.vectorDB.get(cid);
      if (!entry) {
        throw new Error(`No embedding found for CID: ${cid}`);
      }

      // Search using this embedding
      const results = await this.vectorDB.search(
        entry.embedding,
        limit + 1 // +1 because the CID itself will be in results
      );

      // Remove the original CID from results
      const filtered = results.filter(r => r.cid !== cid);

      // Fetch memories
      const memories = [];
      for (const result of filtered.slice(0, limit)) {
        try {
          const memory = await this._fetchMemory(result.cid);
          memories.push({
            ...memory,
            similarity_score: result.score
          });
        } catch (error) {
          this.logger.error(`Failed to fetch ${result.cid}: ${error.message}`);
        }
      }

      return memories;
    } catch (error) {
      this.logger.error(`Find similar failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Index an existing memory (generate and store embedding)
   * @param {string} cid - IPFS CID
   * @param {Object} memory - Memory object
   * @param {string} agentId - Agent ID
   */
  async index(cid, memory, agentId) {
    try {
      // Extract searchable text
      const text = this.embeddings.extractText(memory);

      // Generate embedding
      const embedding = await this.embeddings.embed(text);

      // Store in vector DB
      await this.vectorDB.add(cid, embedding, {
        agent_id: agentId,
        timestamp: memory.timestamp,
        prev_cid: memory.prev_cid || null,
        plaintext_sha256: memory.plaintext_sha256
      });

      this.logger.debug(`Indexed ${cid}`);
    } catch (error) {
      this.logger.error(`Failed to index ${cid}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Reindex all memories for an agent
   * Useful for rebuilding the vector database
   * @param {string} agentId - Agent ID
   * @param {Array} cids - Array of {cid, timestamp, prev_cid} objects
   */
  async reindexAgent(agentId, cids) {
    this.logger.info(`Reindexing ${cids.length} memories for agent ${agentId}`);

    let indexed = 0;
    let failed = 0;

    for (const cidEntry of cids) {
      try {
        // Fetch memory
        const memory = await this._fetchMemory(cidEntry.cid);

        // Index it
        await this.index(cidEntry.cid, memory, agentId);
        indexed++;

        if (indexed % 10 === 0) {
          this.logger.info(`Indexed ${indexed}/${cids.length}`);
        }
      } catch (error) {
        this.logger.error(`Failed to reindex ${cidEntry.cid}: ${error.message}`);
        failed++;
      }
    }

    this.logger.info(`Reindexing complete: ${indexed} indexed, ${failed} failed`);
    return { indexed, failed };
  }

  /**
   * Get search statistics
   * @returns {Promise<Object>} Statistics
   */
  async getStats() {
    return await this.vectorDB.getStats();
  }
}
