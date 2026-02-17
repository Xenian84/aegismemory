/**
 * Cyberdyne Profile Schema v2
 * Validation and type definitions for user profiles
 */

/**
 * Validate profile against schema v2
 */
export function validateProfile(profile) {
  const errors = [];
  
  // Check schema version
  if (profile.schema !== 'cyberdyne_profile_v2') {
    errors.push('Invalid schema: must be cyberdyne_profile_v2');
  }
  
  // Check version
  if (!profile.version || profile.version !== '2') {
    errors.push('Invalid version: must be "2"');
  }
  
  // Check timestamps
  if (!profile.created_at || !isValidISO8601(profile.created_at)) {
    errors.push('Invalid created_at: must be ISO8601 timestamp');
  }
  
  if (!profile.updated_at || !isValidISO8601(profile.updated_at)) {
    errors.push('Invalid updated_at: must be ISO8601 timestamp');
  }
  
  // Check identity (required)
  if (!profile.identity) {
    errors.push('Missing identity object');
  } else {
    if (!profile.identity.telegram_id || typeof profile.identity.telegram_id !== 'number') {
      errors.push('Invalid identity.telegram_id: must be number');
    }
    if (!profile.identity.username || typeof profile.identity.username !== 'string') {
      errors.push('Invalid identity.username: must be string');
    }
  }
  
  // Check reputation (required)
  if (!profile.reputation) {
    errors.push('Missing reputation object');
  } else {
    if (typeof profile.reputation.score !== 'number') {
      errors.push('Invalid reputation.score: must be number');
    }
    if (typeof profile.reputation.rank !== 'number') {
      errors.push('Invalid reputation.rank: must be number');
    }
    if (!profile.reputation.tier || typeof profile.reputation.tier !== 'string') {
      errors.push('Invalid reputation.tier: must be string');
    }
  }
  
  // Check contributions (optional but must be array)
  if (profile.contributions && !Array.isArray(profile.contributions)) {
    errors.push('Invalid contributions: must be array');
  }
  
  // Check achievements (optional but must be array)
  if (profile.achievements && !Array.isArray(profile.achievements)) {
    errors.push('Invalid achievements: must be array');
  }
  
  // Check communities (optional but must be array)
  if (profile.communities && !Array.isArray(profile.communities)) {
    errors.push('Invalid communities: must be array');
  }
  
  // Check skills (optional but must be object)
  if (profile.skills && typeof profile.skills !== 'object') {
    errors.push('Invalid skills: must be object');
  }
  
  // Check badges (optional but must be array)
  if (profile.badges && !Array.isArray(profile.badges)) {
    errors.push('Invalid badges: must be array');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Create default profile structure
 */
export function createDefaultProfile(identity, reputation) {
  return {
    schema: 'cyberdyne_profile_v2',
    version: '2',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    
    identity: {
      telegram_id: identity.telegram_id,
      username: identity.username,
      display_name: identity.display_name || identity.username,
      handle: identity.handle || `@${identity.username}`
    },
    
    reputation: {
      score: reputation.score || 0,
      rank: reputation.rank || 0,
      tier: reputation.tier || 'ATTUNING',
      level: calculateLevel(reputation.score || 0),
      xp: calculateXP(reputation.score || 0),
      xp_to_next: calculateXPToNext(reputation.score || 0),
      xnt_entitlement: reputation.xnt_entitlement || 0
    },
    
    contributions: [],
    achievements: [],
    communities: [],
    
    skills: {
      builder: 0,
      promoter: 0,
      ecosystem: 0,
      leadership: 0
    },
    
    badges: [],
    
    metadata: {
      auto_enhanced: true,
      source: 'aegismemory-cli',
      ipfs_cid: null
    },
    
    encryption: {
      algorithm: 'AES-256-GCM',
      key_derivation: 'wallet_signature',
      encrypted_at: new Date().toISOString()
    }
  };
}

/**
 * Calculate level from score
 */
export function calculateLevel(score) {
  return Math.floor(score / 100);
}

/**
 * Calculate XP within current level
 */
export function calculateXP(score) {
  return score % 100;
}

/**
 * Calculate XP needed for next level
 */
export function calculateXPToNext(score) {
  return 100 - (score % 100);
}

/**
 * Auto-assign badges based on profile data
 */
export function autoAssignBadges(profile) {
  const badges = [];
  
  // Score-based badges
  if (profile.reputation.score >= 800) {
    badges.push('🏆 Elite');
  } else if (profile.reputation.score >= 500) {
    badges.push('⭐ Advanced');
  } else if (profile.reputation.score >= 100) {
    badges.push('🌟 Rising Star');
  }
  
  // Rank-based badges
  if (profile.reputation.rank <= 10) {
    badges.push('🥇 Top 10');
  } else if (profile.reputation.rank <= 50) {
    badges.push('🥈 Top 50');
  }
  
  // Contribution-based badges
  const builderContributions = profile.contributions.filter(c => c.type === 'builder');
  if (builderContributions.length > 0) {
    badges.push('🚀 Builder');
  }
  
  const communityContributions = profile.contributions.filter(c => 
    c.type === 'community_modding' || c.type === 'promoter'
  );
  if (communityContributions.length > 0) {
    badges.push('💬 Moderator');
  }
  
  // Community badges
  if (profile.communities && profile.communities.length >= 5) {
    badges.push('🌐 Community Leader');
  }
  
  return badges;
}

/**
 * Calculate skill scores from contributions
 */
export function calculateSkills(contributions) {
  const skills = {
    builder: 0,
    promoter: 0,
    ecosystem: 0,
    leadership: 0
  };
  
  for (const contrib of contributions) {
    switch (contrib.type) {
      case 'builder':
      case 'infrastructure':
      case 'open_source':
        skills.builder += contrib.score || 0;
        break;
      case 'promoter':
      case 'advocacy':
      case 'education':
        skills.promoter += contrib.score || 0;
        break;
      case 'community_modding':
      case 'community_ownership':
        skills.leadership += contrib.score || 0;
        break;
      case 'validators':
      case 'staking_program':
        skills.ecosystem += contrib.score || 0;
        break;
    }
  }
  
  return skills;
}

/**
 * Enhance profile with auto-calculated fields
 */
export function enhanceProfile(profile) {
  // Auto-calculate level/xp if not set
  if (!profile.reputation.level) {
    profile.reputation.level = calculateLevel(profile.reputation.score);
  }
  if (!profile.reputation.xp) {
    profile.reputation.xp = calculateXP(profile.reputation.score);
  }
  if (!profile.reputation.xp_to_next) {
    profile.reputation.xp_to_next = calculateXPToNext(profile.reputation.score);
  }
  
  // Auto-calculate skills from contributions
  if (profile.contributions && profile.contributions.length > 0) {
    profile.skills = calculateSkills(profile.contributions);
  }
  
  // Auto-assign badges
  profile.badges = autoAssignBadges(profile);
  
  // Mark as enhanced
  profile.metadata.auto_enhanced = true;
  
  return profile;
}

/**
 * Validate ISO8601 timestamp
 */
function isValidISO8601(dateString) {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date) && date.toISOString() === dateString;
}

/**
 * Sanitize profile (remove sensitive data)
 */
export function sanitizeProfile(profile, options = {}) {
  const sanitized = JSON.parse(JSON.stringify(profile)); // Deep clone
  
  // Remove wallet if privacy enabled
  if (options.hideWallet && sanitized.identity.wallet) {
    sanitized.identity.wallet = '[REDACTED]';
  }
  
  // Remove encryption details if requested
  if (options.hideEncryption) {
    delete sanitized.encryption;
  }
  
  return sanitized;
}
