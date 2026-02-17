/**
 * TOON Format for Cyberdyne Profiles
 * Compact, human-readable format (~40% smaller than JSON)
 */

/**
 * Convert profile to TOON format
 */
export function profileToTOON(profile) {
  const lines = [];
  
  // Schema header
  lines.push(`@${profile.schema}`);
  lines.push('');
  
  // Metadata
  lines.push(`version: ${profile.version}`);
  lines.push(`created: ${profile.created_at}`);
  lines.push(`updated: ${profile.updated_at}`);
  lines.push('');
  
  // Identity
  lines.push('# Identity');
  lines.push(`telegram: ${profile.identity.telegram_id}`);
  lines.push(`username: ${profile.identity.username}`);
  if (profile.identity.display_name) {
    lines.push(`display: ${profile.identity.display_name}`);
  }
  if (profile.identity.handle) {
    lines.push(`handle: ${profile.identity.handle}`);
  }
  if (profile.identity.wallet) {
    lines.push(`wallet: ${profile.identity.wallet}`);
  }
  lines.push('');
  
  // Reputation
  lines.push('# Reputation');
  lines.push(`score: ${profile.reputation.score}`);
  lines.push(`rank: ${profile.reputation.rank}`);
  lines.push(`tier: ${profile.reputation.tier}`);
  lines.push(`level: ${profile.reputation.level}`);
  lines.push(`xp: ${profile.reputation.xp}/${profile.reputation.xp_to_next + profile.reputation.xp}`);
  if (profile.reputation.xnt_entitlement) {
    lines.push(`xnt: ${profile.reputation.xnt_entitlement}`);
  }
  lines.push('');
  
  // Contributions
  if (profile.contributions && profile.contributions.length > 0) {
    lines.push('# Contributions');
    for (const contrib of profile.contributions) {
      lines.push(`[${contrib.type}]`);
      lines.push(`- ${contrib.name} (${contrib.score} pts)`);
      if (contrib.description) {
        lines.push(`  ${contrib.description}`);
      }
      if (contrib.timestamp) {
        lines.push(`  ${contrib.timestamp}`);
      }
    }
    lines.push('');
  }
  
  // Achievements
  if (profile.achievements && profile.achievements.length > 0) {
    lines.push('# Achievements');
    for (const achievement of profile.achievements) {
      lines.push(`- ${achievement}`);
    }
    lines.push('');
  }
  
  // Communities
  if (profile.communities && profile.communities.length > 0) {
    lines.push('# Communities');
    for (const community of profile.communities) {
      lines.push(`- ${community}`);
    }
    lines.push('');
  }
  
  // Skills
  if (profile.skills && Object.keys(profile.skills).length > 0) {
    lines.push('# Skills');
    for (const [skill, score] of Object.entries(profile.skills)) {
      if (score > 0) {
        lines.push(`${skill}: ${score}`);
      }
    }
    lines.push('');
  }
  
  // Badges
  if (profile.badges && profile.badges.length > 0) {
    lines.push('# Badges');
    for (const badge of profile.badges) {
      lines.push(`- ${badge}`);
    }
    lines.push('');
  }
  
  // Metadata
  lines.push('# Metadata');
  if (profile.metadata.ipfs_cid) {
    lines.push(`cid: ${profile.metadata.ipfs_cid}`);
  }
  if (profile.metadata.previous_cid) {
    lines.push(`prev: ${profile.metadata.previous_cid}`);
  }
  lines.push(`source: ${profile.metadata.source || 'unknown'}`);
  if (profile.metadata.auto_enhanced) {
    lines.push(`enhanced: true`);
  }
  lines.push('');
  
  // Encryption
  if (profile.encryption) {
    lines.push('# Encryption');
    lines.push(`algo: ${profile.encryption.algorithm}`);
    lines.push(`key: ${profile.encryption.key_derivation}`);
    lines.push(`encrypted: ${profile.encryption.encrypted_at}`);
  }
  
  return lines.join('\n');
}

/**
 * Parse TOON format back to profile object
 */
export function profileFromTOON(toon) {
  const lines = toon.split('\n');
  const profile = {
    schema: null,
    version: null,
    created_at: null,
    updated_at: null,
    identity: {},
    reputation: {},
    contributions: [],
    achievements: [],
    communities: [],
    skills: {},
    badges: [],
    metadata: {},
    encryption: {}
  };
  
  let currentSection = null;
  let currentContribution = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines
    if (!line) continue;
    
    // Schema header
    if (line.startsWith('@')) {
      profile.schema = line.substring(1);
      continue;
    }
    
    // Section headers
    if (line.startsWith('# ')) {
      currentSection = line.substring(2).toLowerCase();
      currentContribution = null;
      continue;
    }
    
    // Contribution blocks
    if (line.startsWith('[') && line.endsWith(']')) {
      const type = line.substring(1, line.length - 1);
      currentContribution = {
        type,
        name: null,
        description: null,
        score: 0,
        timestamp: null
      };
      continue;
    }
    
    // Parse key-value pairs
    if (line.includes(':')) {
      const colonIndex = line.indexOf(':');
      const key = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();
      
      // Top-level fields
      if (!currentSection) {
        if (key === 'version') profile.version = value;
        else if (key === 'created') profile.created_at = value;
        else if (key === 'updated') profile.updated_at = value;
        continue;
      }
      
      // Identity section
      if (currentSection === 'identity') {
        if (key === 'telegram') profile.identity.telegram_id = parseInt(value);
        else if (key === 'username') profile.identity.username = value;
        else if (key === 'display') profile.identity.display_name = value;
        else if (key === 'handle') profile.identity.handle = value;
        else if (key === 'wallet') profile.identity.wallet = value;
        continue;
      }
      
      // Reputation section
      if (currentSection === 'reputation') {
        if (key === 'score') profile.reputation.score = parseInt(value);
        else if (key === 'rank') profile.reputation.rank = parseInt(value);
        else if (key === 'tier') profile.reputation.tier = value;
        else if (key === 'level') profile.reputation.level = parseInt(value);
        else if (key === 'xp') {
          const [current, total] = value.split('/').map(v => parseInt(v));
          profile.reputation.xp = current;
          profile.reputation.xp_to_next = total - current;
        }
        else if (key === 'xnt') profile.reputation.xnt_entitlement = parseInt(value);
        continue;
      }
      
      // Skills section
      if (currentSection === 'skills') {
        profile.skills[key] = parseInt(value);
        continue;
      }
      
      // Metadata section
      if (currentSection === 'metadata') {
        if (key === 'cid') profile.metadata.ipfs_cid = value;
        else if (key === 'prev') profile.metadata.previous_cid = value;
        else if (key === 'source') profile.metadata.source = value;
        else if (key === 'enhanced') profile.metadata.auto_enhanced = value === 'true';
        continue;
      }
      
      // Encryption section
      if (currentSection === 'encryption') {
        if (key === 'algo') profile.encryption.algorithm = value;
        else if (key === 'key') profile.encryption.key_derivation = value;
        else if (key === 'encrypted') profile.encryption.encrypted_at = value;
        continue;
      }
    }
    
    // Parse list items
    if (line.startsWith('- ')) {
      const content = line.substring(2);
      
      if (currentSection === 'achievements') {
        profile.achievements.push(content);
      } else if (currentSection === 'communities') {
        profile.communities.push(content);
      } else if (currentSection === 'badges') {
        profile.badges.push(content);
      } else if (currentContribution) {
        // Parse contribution line: "Name (score pts)"
        const match = content.match(/^(.+?)\s*\((\d+)\s*pts\)$/);
        if (match) {
          currentContribution.name = match[1];
          currentContribution.score = parseInt(match[2]);
          profile.contributions.push(currentContribution);
          currentContribution = null;
        }
      }
      continue;
    }
    
    // Parse contribution description/timestamp (indented lines)
    if (line.startsWith('  ') && currentContribution) {
      const content = line.trim();
      if (content.match(/^\d{4}-\d{2}-\d{2}/)) {
        currentContribution.timestamp = content;
      } else {
        currentContribution.description = content;
      }
    }
  }
  
  return profile;
}

/**
 * Calculate TOON format savings
 */
export function calculateProfileSavings(profile) {
  const jsonPretty = JSON.stringify(profile, null, 2);
  const jsonCompact = JSON.stringify(profile);
  const toon = profileToTOON(profile);
  
  return {
    json: {
      pretty: jsonPretty.length,
      compact: jsonCompact.length
    },
    toon: toon.length,
    savings: {
      vsCompact: ((jsonCompact.length - toon.length) / jsonCompact.length * 100).toFixed(1) + '%',
      vsPretty: ((jsonPretty.length - toon.length) / jsonPretty.length * 100).toFixed(1) + '%'
    }
  };
}
