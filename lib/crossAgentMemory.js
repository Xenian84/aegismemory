/**
 * @fileoverview Cross-agent memory queries
 * Query other agents' memories with permission
 */

import { State } from './state.js';
import { IpfsFetcher } from './ipfsFetch.js';
import { decryptPayload } from './cryptoBox.js';
import { fromTOON } from './toon.js';
import { join } from 'path';

export class CrossAgentMemory {
  constructor(config, permissions, embeddings, vectorDB, logger = console) {
    this.config = config;
    this.permissions = permissions;
    this.embeddings = embeddings;
    this.vectorDB = vectorDB;
    this.logger = logger;
    this.ipfsFetch = new IpfsFetcher(config, logger);
  }

  /**
   * Query another agent's memories
   * @param {string} targetWallet - Wallet address of agent to query
   * @param {Object} options - Query options
   * @param {string} options.search - Semantic search query
   * @param {number} options.limit - Max results
   * @param {number} options.minScore - Minimum relevance score
   * @returns {Promise<Array>} Array of memories
   */
  async query(targetWallet, options = {}) {
    const {
      search = null,
      limit = 10,
      minScore = 0.5
    } = options;

    this.logger.info(`Querying agent ${targetWallet}`);

    try {
      // Check if we have permission
      const hasPermission = await this.permissions.hasPermission(targetWallet);
      if (!hasPermission) {
        throw new Error(`No permission to access ${targetWallet}'s memories`);
      }

      // Get shared key
      const sharedKey = await this.permissions.getSharedKey(targetWallet);
      if (!sharedKey) {
        throw new Error(`Failed to get shared key for ${targetWallet}`);
      }

      // Load target agent's state
      const targetState = await this._loadTargetState(targetWallet);
      if (!targetState) {
        throw new Error(`No state found for ${targetWallet}`);
      }

      // Get CID list for target agent
      const cids = this._getCidsFromState(targetState);
      if (cids.length === 0) {
        this.logger.info(`No memories found for ${targetWallet}`);
        return [];
      }

      this.logger.info(`Found ${cids.length} memories for ${targetWallet}`);

      // If semantic search requested, use vector search
      if (search && this.embeddings && this.vectorDB) {
        return await this._semanticSearch(targetWallet, search, sharedKey, limit, minScore);
      }

      // Otherwise, fetch recent memories
      return await this._fetchRecentMemories(targetWallet, cids, sharedKey, limit);
    } catch (error) {
      this.logger.error(`Query failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Semantic search across another agent's memories
   * @private
   */
  async _semanticSearch(targetWallet, query, sharedKey, limit, minScore) {
    try {
      // Generate query embedding
      const queryEmbedding = await this.embeddings.embed(query);

      // Search vector DB filtered by target agent
      const results = await this.vectorDB.search(
        queryEmbedding,
        limit * 2,
        { agent_id: targetWallet }
      );

      // Filter by score
      const filtered = results.filter(r => r.score >= minScore);

      // Fetch and decrypt memories
      const memories = [];
      for (const result of filtered.slice(0, limit)) {
        try {
          const memory = await this._fetchAndDecrypt(result.cid, sharedKey);
          memories.push({
            ...memory,
            relevance_score: result.score,
            source_agent: targetWallet
          });
        } catch (error) {
          this.logger.error(`Failed to fetch ${result.cid}: ${error.message}`);
        }
      }

      return memories;
    } catch (error) {
      this.logger.error(`Semantic search failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fetch recent memories
   * @private
   */
  async _fetchRecentMemories(targetWallet, cids, sharedKey, limit) {
    const memories = [];
    const recentCids = cids.slice(-limit);

    for (const cidEntry of recentCids) {
      try {
        const memory = await this._fetchAndDecrypt(cidEntry.cid, sharedKey);
        memories.push({
          ...memory,
          source_agent: targetWallet
        });
      } catch (error) {
        this.logger.error(`Failed to fetch ${cidEntry.cid}: ${error.message}`);
      }
    }

    return memories;
  }

  /**
   * Fetch and decrypt a memory
   * @private
   */
  async _fetchAndDecrypt(cid, sharedKey) {
    // Fetch from IPFS
    const encrypted = await this.ipfsFetch.fetch(cid);

    // Decrypt using shared key (payload format)
    const plaintext = await decryptPayload(
      encrypted,
      sharedKey
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
   * Load target agent's state
   * @private
   */
  async _loadTargetState(targetWallet) {
    try {
      // Construct state path for target agent
      const stateDir = this.config.stateDir || join(this.config.statePath, '..');
      const targetStatePath = join(stateDir, `state-${targetWallet}.json`);

      // Try to load state
      const targetState = new State(targetStatePath, this.logger);
      await targetState.load();

      return targetState;
    } catch (error) {
      this.logger.error(`Failed to load target state: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract CID list from state
   * @private
   */
  _getCidsFromState(state) {
    const cids = [];
    
    // Get all agents from state
    const agents = state.getAllAgents();
    
    for (const agentKey of agents) {
      const [wallet, agentId] = agentKey.split(':');
      const agentState = state.getAgent(wallet, agentId);
      
      if (agentState && agentState.cids) {
        cids.push(...agentState.cids);
      }
    }

    // Sort by timestamp (newest first)
    cids.sort((a, b) => b.timestamp - a.timestamp);

    return cids;
  }

  /**
   * Get statistics about cross-agent access
   * @returns {Promise<Object>} Statistics
   */
  async getStats() {
    const permissionCount = await this.permissions.count();
    const permissions = await this.permissions.list();

    return {
      total_permissions: permissionCount,
      granted_to: permissions.map(p => p.grantee),
      oldest_permission: permissions.length > 0 
        ? permissions.reduce((oldest, p) => 
            new Date(p.grantedAt) < new Date(oldest.grantedAt) ? p : oldest
          ).grantedAt
        : null
    };
  }

  /**
   * Import a memory from a share token
   * @param {string} cid - IPFS CID to import
   * @param {string} sourceWallet - Source agent's wallet
   * @param {string} sharedKey - Decrypted shared key
   * @param {Object} options - Import options
   * @param {boolean} options.saveLocally - Save to local state
   * @returns {Promise<Object>} Imported memory
   */
  async importMemory(cid, sourceWallet, sharedKey, options = {}) {
    const { saveLocally = false } = options;

    this.logger.info(`Importing memory ${cid} from ${sourceWallet}`);

    try {
      // Fetch and decrypt the memory
      const memory = await this._fetchAndDecrypt(cid, sharedKey);

      // Add source metadata
      memory.source_agent = sourceWallet;
      memory.imported_at = new Date().toISOString();
      memory.imported_cid = cid;

      // Optionally save to local state
      if (saveLocally) {
        // Store the permission for future queries
        await this.permissions.importPermission(sourceWallet, sharedKey);
        this.logger.info(`Saved permission for ${sourceWallet}`);
      }

      this.logger.info(`Successfully imported memory from ${sourceWallet}`);
      
      return memory;
    } catch (error) {
      this.logger.error(`Import failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Import multiple memories from a source agent
   * @param {string} sourceWallet - Source agent's wallet
   * @param {Array<string>} cids - Array of CIDs to import
   * @param {string} sharedKey - Decrypted shared key
   * @returns {Promise<Array>} Imported memories
   */
  async importMemories(sourceWallet, cids, sharedKey) {
    this.logger.info(`Importing ${cids.length} memories from ${sourceWallet}`);

    const memories = [];
    const errors = [];

    for (const cid of cids) {
      try {
        const memory = await this.importMemory(cid, sourceWallet, sharedKey, { saveLocally: false });
        memories.push(memory);
      } catch (error) {
        this.logger.error(`Failed to import ${cid}: ${error.message}`);
        errors.push({ cid, error: error.message });
      }
    }

    this.logger.info(`Imported ${memories.length}/${cids.length} memories`);

    return {
      memories,
      errors,
      success: memories.length,
      failed: errors.length
    };
  }

  /**
   * Fetch a single memory by CID (requires permission)
   * @param {string} sourceWallet - Source agent's wallet
   * @param {string} cid - IPFS CID to fetch
   * @returns {Promise<Object>} Memory
   */
  async fetchMemory(sourceWallet, cid) {
    this.logger.info(`Fetching memory ${cid} from ${sourceWallet}`);

    try {
      // Check permission
      const hasPermission = await this.permissions.hasPermission(sourceWallet);
      if (!hasPermission) {
        throw new Error(`No permission to access ${sourceWallet}'s memories`);
      }

      // Get shared key
      const sharedKey = await this.permissions.getSharedKey(sourceWallet);
      if (!sharedKey) {
        throw new Error(`Failed to get shared key for ${sourceWallet}`);
      }

      // Fetch and decrypt
      const memory = await this._fetchAndDecrypt(cid, sharedKey);
      memory.source_agent = sourceWallet;

      return memory;
    } catch (error) {
      this.logger.error(`Fetch failed: ${error.message}`);
      throw error;
    }
  }
}
