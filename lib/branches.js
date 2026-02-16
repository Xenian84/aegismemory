/**
 * @fileoverview Branch management for fork/branch memory chains
 * Git-like branching for memory contexts
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';

export class BranchManager {
  constructor(state, logger = console) {
    this.state = state;
    this.logger = logger;
    this.defaultBranch = 'main';
  }

  /**
   * Initialize branch system for an agent
   * @param {string} wallet - Wallet address
   * @param {string} agentId - Agent ID
   */
  _ensureBranches(wallet, agentId) {
    const agent = this.state.getAgent(wallet, agentId);
    
    if (!agent.branches) {
      const branches = {
        main: {
          lastCid: agent.lastCid || null,
          lastPlaintextSha256: agent.lastPlaintextSha256 || null,
          cids: agent.cids || []
        }
      };
      const currentBranch = 'main';
      
      this.state.setAgent(wallet, agentId, {
        branches,
        currentBranch
      });
    }

    return this.state.getAgent(wallet, agentId);
  }

  /**
   * Create a new branch
   * @param {string} wallet - Wallet address
   * @param {string} agentId - Agent ID
   * @param {string} branchName - Name of new branch
   * @param {string} fromBranch - Branch to fork from (default: current)
   * @returns {Object} Branch info
   */
  async create(wallet, agentId, branchName, fromBranch = null) {
    const agent = this._ensureBranches(wallet, agentId);

    // Check if branch already exists
    if (agent.branches[branchName]) {
      throw new Error(`Branch '${branchName}' already exists`);
    }

    // Get source branch
    const sourceBranch = fromBranch || agent.currentBranch || this.defaultBranch;
    const source = agent.branches[sourceBranch];
    
    if (!source) {
      throw new Error(`Source branch '${sourceBranch}' not found`);
    }

    // Create new branch (copy of source)
    agent.branches[branchName] = {
      lastCid: source.lastCid,
      lastPlaintextSha256: source.lastPlaintextSha256,
      cids: [...source.cids],
      createdAt: Date.now(),
      createdFrom: sourceBranch
    };

    this.state.setAgent(wallet, agentId, { branches: agent.branches });
    this.logger.info(`Created branch '${branchName}' from '${sourceBranch}'`);

    return {
      name: branchName,
      createdFrom: sourceBranch,
      lastCid: source.lastCid,
      memoryCount: source.cids.length
    };
  }

  /**
   * Switch to a different branch
   * @param {string} wallet - Wallet address
   * @param {string} agentId - Agent ID
   * @param {string} branchName - Branch to switch to
   */
  async switch(wallet, agentId, branchName) {
    const agent = this._ensureBranches(wallet, agentId);

    if (!agent.branches[branchName]) {
      throw new Error(`Branch '${branchName}' not found`);
    }

    agent.currentBranch = branchName;
    this.state.setAgent(wallet, agentId, { currentBranch: branchName });
    
    this.logger.info(`Switched to branch '${branchName}'`);

    return {
      branch: branchName,
      lastCid: agent.branches[branchName].lastCid,
      memoryCount: agent.branches[branchName].cids.length
    };
  }

  /**
   * Get current branch
   * @param {string} wallet - Wallet address
   * @param {string} agentId - Agent ID
   * @returns {string} Current branch name
   */
  getCurrent(wallet, agentId) {
    const agent = this._ensureBranches(wallet, agentId);
    return agent.currentBranch || this.defaultBranch;
  }

  /**
   * List all branches
   * @param {string} wallet - Wallet address
   * @param {string} agentId - Agent ID
   * @returns {Array} Array of branch info
   */
  async list(wallet, agentId) {
    const agent = this._ensureBranches(wallet, agentId);
    const current = agent.currentBranch || this.defaultBranch;

    const branches = [];
    for (const [name, branch] of Object.entries(agent.branches)) {
      branches.push({
        name,
        isCurrent: name === current,
        lastCid: branch.lastCid,
        memoryCount: branch.cids?.length || 0,
        createdAt: branch.createdAt ? new Date(branch.createdAt).toISOString() : null,
        createdFrom: branch.createdFrom || null
      });
    }

    return branches;
  }

  /**
   * Delete a branch
   * @param {string} wallet - Wallet address
   * @param {string} agentId - Agent ID
   * @param {string} branchName - Branch to delete
   * @param {boolean} force - Force delete even if current
   */
  async delete(wallet, agentId, branchName, force = false) {
    const agent = this._ensureBranches(wallet, agentId);

    // Can't delete main branch
    if (branchName === this.defaultBranch) {
      throw new Error(`Cannot delete '${this.defaultBranch}' branch`);
    }

    // Can't delete current branch unless forced
    if (agent.currentBranch === branchName && !force) {
      throw new Error(`Cannot delete current branch '${branchName}'. Switch branches first or use --force`);
    }

    // Check if branch exists
    if (!agent.branches[branchName]) {
      throw new Error(`Branch '${branchName}' not found`);
    }

    // Delete branch
    delete agent.branches[branchName];

    // If we deleted current branch, switch to main
    if (agent.currentBranch === branchName) {
      agent.currentBranch = this.defaultBranch;
    }

    this.state.setAgent(wallet, agentId, {
      branches: agent.branches,
      currentBranch: agent.currentBranch
    });
    this.logger.info(`Deleted branch '${branchName}'`);

    return { deleted: branchName };
  }

  /**
   * Merge a branch into another
   * @param {string} wallet - Wallet address
   * @param {string} agentId - Agent ID
   * @param {string} sourceBranch - Branch to merge from
   * @param {string} targetBranch - Branch to merge into
   * @returns {Object} Merge info
   */
  async merge(wallet, agentId, sourceBranch, targetBranch) {
    const agent = this._ensureBranches(wallet, agentId);

    // Check branches exist
    if (!agent.branches[sourceBranch]) {
      throw new Error(`Source branch '${sourceBranch}' not found`);
    }
    if (!agent.branches[targetBranch]) {
      throw new Error(`Target branch '${targetBranch}' not found`);
    }

    const source = agent.branches[sourceBranch];
    const target = agent.branches[targetBranch];

    // Create merge commit metadata
    const mergeInfo = {
      type: 'merge',
      sourceBranch,
      targetBranch,
      sourceCid: source.lastCid,
      targetCid: target.lastCid,
      mergedAt: Date.now()
    };

    // Append source CIDs to target (skip duplicates)
    const targetCidSet = new Set(target.cids.map(c => c.cid));
    const newCids = source.cids.filter(c => !targetCidSet.has(c.cid));

    target.cids.push(...newCids);
    target.lastCid = source.lastCid;
    target.lastPlaintextSha256 = source.lastPlaintextSha256;

    // Update state
    agent.branches[targetBranch] = target;
    this.state.setAgent(wallet, agentId, { branches: agent.branches });

    this.logger.info(`Merged '${sourceBranch}' into '${targetBranch}'`, {
      memoriesAdded: newCids.length
    });

    return {
      ...mergeInfo,
      memoriesAdded: newCids.length
    };
  }

  /**
   * Get branch for memory operations
   * @param {string} wallet - Wallet address
   * @param {string} agentId - Agent ID
   * @param {string} branchName - Branch name (optional, uses current)
   * @returns {Object} Branch data
   */
  getBranch(wallet, agentId, branchName = null) {
    const agent = this._ensureBranches(wallet, agentId);
    const branch = branchName || agent.currentBranch || this.defaultBranch;

    if (!agent.branches[branch]) {
      throw new Error(`Branch '${branch}' not found`);
    }

    return {
      name: branch,
      data: agent.branches[branch]
    };
  }

  /**
   * Update branch after memory save
   * @param {string} wallet - Wallet address
   * @param {string} agentId - Agent ID
   * @param {string} cid - New CID
   * @param {string} sha256 - New SHA256
   * @param {string} branchName - Branch name (optional, uses current)
   */
  updateBranch(wallet, agentId, cid, sha256, branchName = null) {
    const agent = this._ensureBranches(wallet, agentId);
    const branch = branchName || agent.currentBranch || this.defaultBranch;

    if (!agent.branches[branch]) {
      throw new Error(`Branch '${branch}' not found`);
    }

    agent.branches[branch].lastCid = cid;
    agent.branches[branch].lastPlaintextSha256 = sha256;
    
    if (!agent.branches[branch].cids) {
      agent.branches[branch].cids = [];
    }
    
    agent.branches[branch].cids.push({
      cid,
      timestamp: Date.now(),
      sha256
    });

    this.state.setAgent(wallet, agentId, { branches: agent.branches });
  }
}
