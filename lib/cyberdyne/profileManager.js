/**
 * Cyberdyne Profile Manager
 * Handles profile creation, updates, and retrieval
 */

import { validateProfile, enhanceProfile, createDefaultProfile, sanitizeProfile } from './profileSchema.js';
import { canonicalStringify } from '../util.js';
import { sha256 } from '../cryptoBox.js';

export class ProfileManager {
  constructor(config, state, vaultApi, crypto, logger, metrics) {
    this.config = config;
    this.state = state;
    this.vaultApi = vaultApi;
    this.crypto = crypto;
    this.logger = logger;
    this.metrics = metrics;
  }

  /**
   * Create a new profile
   */
  async create(profileData) {
    const startTime = Date.now();
    
    try {
      this.logger.info('Creating Cyberdyne profile', { 
        telegram_id: profileData.identity?.telegram_id,
        score: profileData.reputation?.score 
      });
      
      // Enhance profile with auto-calculated fields
      const profile = enhanceProfile(profileData);
      
      // Validate
      const validation = validateProfile(profile);
      if (!validation.valid) {
        throw new Error(`Profile validation failed: ${validation.errors.join(', ')}`);
      }
      
      // Get wallet info
      const wallet = profile.identity.wallet || this.config.walletPubkey;
      const telegramId = profile.identity.telegram_id;
      
      // Check for existing profile
      const existingAgent = this.state.getAgent(wallet, `cyberdyne:${telegramId}`);
      if (existingAgent.lastCid) {
        profile.metadata.previous_cid = existingAgent.lastCid;
        profile.version = (existingAgent.metadata?.version || 1) + 1;
      }
      
      // Determine storage format
      const format = this.config.memoryFormat || 'json';
      let plaintext;
      
      if (format === 'toon') {
        const { profileToTOON } = await import('./profileToon.js');
        plaintext = profileToTOON(profile);
        this.logger.debug('Using TOON format for profile');
      } else {
        plaintext = canonicalStringify(profile);
      }
      
      // Calculate SHA256
      const plaintextSha256 = sha256(plaintext);
      
      // Encrypt
      const encryptedPayload = await this.crypto.encrypt(plaintext);
      
      // Upload to IPFS
      const filename = `cyberdyne/${telegramId}/profile_v${profile.version}.json`;
      const result = await this.vaultApi.add(
        encryptedPayload,
        filename,
        wallet,
        plaintext,
        this.config.maxRetries
      );
      
      const cid = result.cid || result.Hash;
      
      // Update profile with CID
      profile.metadata.ipfs_cid = cid;
      
      // Store in state
      this.state.setAgent(wallet, `cyberdyne:${telegramId}`, {
        lastCid: cid,
        lastPlaintextSha256: plaintextSha256,
        lastAnchoredDate: null,
        metadata: {
          telegram_id: telegramId,
          username: profile.identity.username,
          score: profile.reputation.score,
          rank: profile.reputation.rank,
          tier: profile.reputation.tier,
          version: profile.version,
          created_at: profile.created_at,
          updated_at: profile.updated_at
        }
      });
      
      this.metrics.inc('cyberdyne.profile.created');
      this.metrics.recordTime('cyberdyne.profile.create.duration', Date.now() - startTime);
      
      this.logger.info('Profile created successfully', { 
        telegram_id: telegramId,
        cid,
        size: plaintext.length,
        format
      });
      
      return {
        cid,
        profile,
        size: plaintext.length,
        format
      };
    } catch (error) {
      this.metrics.inc('cyberdyne.profile.error');
      this.logger.error('Profile creation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Get profile by telegram ID
   */
  async get(telegramId, walletAddress = null) {
    const startTime = Date.now();
    
    try {
      const wallet = walletAddress || this.config.walletPubkey;
      
      this.logger.info('Fetching profile', { telegram_id: telegramId, wallet });
      
      // Get from state
      const agent = this.state.getAgent(wallet, `cyberdyne:${telegramId}`);
      
      if (!agent.lastCid) {
        this.logger.info('Profile not found', { telegram_id: telegramId });
        return null;
      }
      
      // Fetch from IPFS
      const { IpfsFetcher } = await import('../ipfsFetch.js');
      const fetcher = new IpfsFetcher(this.config.ipfsGatewayUrls, this.logger, this.metrics);
      const text = await fetcher.fetch(agent.lastCid);
      const encryptedPayload = JSON.parse(text);
      
      // Decrypt
      const plaintext = await this.crypto.decrypt(encryptedPayload);
      
      // Parse based on format
      let profile;
      if (plaintext.startsWith('@cyberdyne')) {
        // TOON format
        const { profileFromTOON } = await import('./profileToon.js');
        profile = profileFromTOON(plaintext);
      } else {
        // JSON format
        profile = JSON.parse(plaintext);
      }
      
      this.metrics.inc('cyberdyne.profile.fetched');
      this.metrics.recordTime('cyberdyne.profile.fetch.duration', Date.now() - startTime);
      
      this.logger.info('Profile fetched successfully', { 
        telegram_id: telegramId,
        cid: agent.lastCid,
        version: profile.version
      });
      
      return profile;
    } catch (error) {
      this.metrics.inc('cyberdyne.profile.fetch.error');
      this.logger.error('Profile fetch failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Update existing profile
   */
  async update(telegramId, updates, walletAddress = null) {
    this.logger.info('Updating profile', { telegram_id: telegramId });
    
    // Get existing profile
    const existing = await this.get(telegramId, walletAddress);
    
    if (!existing) {
      throw new Error(`Profile not found for telegram_id: ${telegramId}`);
    }
    
    // Merge updates
    const updated = {
      ...existing,
      updated_at: new Date().toISOString()
    };
    
    // Update reputation if provided
    if (updates.reputation) {
      updated.reputation = {
        ...updated.reputation,
        ...updates.reputation
      };
      
      // Recalculate level/xp
      updated.reputation.level = calculateLevel(updated.reputation.score);
      updated.reputation.xp = calculateXP(updated.reputation.score);
      updated.reputation.xp_to_next = calculateXPToNext(updated.reputation.score);
    }
    
    // Update contributions if provided
    if (updates.contributions) {
      if (updates.addContribution) {
        updated.contributions.push(updates.contributions);
      } else {
        updated.contributions = updates.contributions;
      }
    }
    
    // Update achievements if provided
    if (updates.achievements) {
      if (updates.addAchievement) {
        updated.achievements.push(...updates.achievements);
      } else {
        updated.achievements = updates.achievements;
      }
    }
    
    // Update communities if provided
    if (updates.communities) {
      updated.communities = updates.communities;
    }
    
    // Re-enhance (recalculate skills, badges)
    const enhanced = enhanceProfile(updated);
    
    // Save as new version
    return await this.create(enhanced);
  }

  /**
   * List all profiles for a wallet
   */
  listProfiles(walletAddress = null) {
    const wallet = walletAddress || this.config.walletPubkey;
    const profiles = [];
    
    // Iterate through state to find cyberdyne profiles
    for (const [key, agent] of Object.entries(this.state.data.agents)) {
      if (key.startsWith(`${wallet}:cyberdyne:`)) {
        const telegramId = key.split(':')[2];
        profiles.push({
          telegram_id: parseInt(telegramId),
          cid: agent.lastCid,
          username: agent.metadata?.username,
          score: agent.metadata?.score,
          rank: agent.metadata?.rank,
          tier: agent.metadata?.tier,
          updated_at: agent.metadata?.updated_at
        });
      }
    }
    
    return profiles;
  }

  /**
   * Get profile statistics
   */
  async getStats(telegramId, walletAddress = null) {
    const profile = await this.get(telegramId, walletAddress);
    
    if (!profile) {
      return null;
    }
    
    return {
      telegram_id: profile.identity.telegram_id,
      username: profile.identity.username,
      score: profile.reputation.score,
      rank: profile.reputation.rank,
      tier: profile.reputation.tier,
      level: profile.reputation.level,
      xp: profile.reputation.xp,
      xp_to_next: profile.reputation.xp_to_next,
      total_contributions: profile.contributions.length,
      total_achievements: profile.achievements.length,
      communities_count: profile.communities.length,
      badges_count: profile.badges.length,
      cid: profile.metadata.ipfs_cid,
      version: profile.version
    };
  }

  /**
   * Export profile to JSON
   */
  async export(telegramId, options = {}) {
    const profile = await this.get(telegramId, options.walletAddress);
    
    if (!profile) {
      throw new Error(`Profile not found for telegram_id: ${telegramId}`);
    }
    
    // Sanitize if requested
    if (options.sanitize) {
      return sanitizeProfile(profile, options);
    }
    
    return profile;
  }

  /**
   * Verify profile integrity
   */
  async verify(cid) {
    try {
      // Fetch from IPFS
      const { IpfsFetcher } = await import('../ipfsFetch.js');
      const fetcher = new IpfsFetcher(this.config.ipfsGatewayUrls, this.logger, this.metrics);
      const text = await fetcher.fetch(cid);
      const encryptedPayload = JSON.parse(text);
      
      // Decrypt
      const plaintext = await this.crypto.decrypt(encryptedPayload);
      
      // Parse
      let profile;
      if (plaintext.startsWith('@cyberdyne')) {
        const { profileFromTOON } = await import('./profileToon.js');
        profile = profileFromTOON(plaintext);
      } else {
        profile = JSON.parse(plaintext);
      }
      
      // Validate
      const validation = validateProfile(profile);
      
      return {
        valid: validation.valid,
        errors: validation.errors,
        profile: validation.valid ? profile : null,
        cid
      };
    } catch (error) {
      return {
        valid: false,
        errors: [error.message],
        profile: null,
        cid
      };
    }
  }
}

// Helper functions (moved from schema for clarity)
function calculateLevel(score) {
  return Math.floor(score / 100);
}

function calculateXP(score) {
  return score % 100;
}

function calculateXPToNext(score) {
  return 100 - (score % 100);
}
