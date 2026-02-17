# Cyberdyne Profiles

**Production-grade encrypted user profiles on IPFS with wallet-based encryption**

## Overview

Cyberdyne Profiles is a module within AegisMemory that provides encrypted, decentralized storage for user reputation profiles. It's designed for Telegram bots (like Theo) to create, manage, and retrieve user profiles with complete privacy and zero-knowledge architecture.

## Features

- 🔐 **Client-side encryption** using wallet signatures (AES-256-GCM)
- 📦 **IPFS storage** via X1 Vault (free, no XNT required)
- 🎯 **Zero-knowledge** - AI never sees plaintext profiles
- 📊 **Rich schema** - Reputation, contributions, achievements, communities
- 🔄 **Version tracking** - Full profile history via CID chain
- 💾 **TOON format** - 40% smaller than JSON, human-readable
- 🛠️ **CLI tools** - Complete command-line interface
- 🤖 **OpenClaw tools** - Native integration for Theo bot

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Telegram Bot (Theo)                     │
│  - Generates profile from user activity                     │
│  - Requests user approval via web client                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Cyberdyne Profile Manager                   │
│  - Validates schema                                          │
│  - Encrypts with user's wallet                              │
│  - Uploads to IPFS                                           │
│  - Maintains CID chain                                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    X1 Vault (IPFS)                          │
│  - Stores encrypted profiles                                │
│  - Returns CID                                               │
│  - Free storage (no XNT required)                           │
└─────────────────────────────────────────────────────────────┘
```

## Profile Schema v2

```json
{
  "schema": "cyberdyne_profile_v2",
  "version": "2",
  "created_at": "2026-02-17T12:00:00.000Z",
  "updated_at": "2026-02-17T12:00:00.000Z",
  
  "identity": {
    "telegram_id": 5451495644,
    "username": "Skywalker432",
    "display_name": "Skywalker",
    "handle": "@Skywalker432",
    "wallet": "optional_wallet_address"
  },
  
  "reputation": {
    "score": 417,
    "rank": 8,
    "tier": "HARMONIC",
    "level": 4,
    "xp": 17,
    "xp_to_next": 100,
    "xnt_entitlement": 100
  },
  
  "contributions": [
    {
      "type": "builder",
      "name": "Buy Bot Portfolio",
      "description": "7 buy bots deployed across communities",
      "score": 150,
      "timestamp": "2026-02-17"
    }
  ],
  
  "achievements": [
    "🎯 7 buy bots deployed",
    "🎙️ Multi-community moderator",
    "📊 #8 Cyberdyne Rank"
  ],
  
  "communities": [
    "X1 XEN CRYPTO",
    "Echo Hound"
  ],
  
  "skills": {
    "builder": 150,
    "promoter": 25,
    "ecosystem": 0,
    "leadership": 0
  },
  
  "badges": [
    "🚀 Builder",
    "💬 Moderator"
  ],
  
  "metadata": {
    "auto_enhanced": true,
    "source": "aegismemory-cli",
    "ipfs_cid": "bafybeihg..."
  },
  
  "encryption": {
    "algorithm": "AES-256-GCM",
    "key_derivation": "wallet_signature",
    "encrypted_at": "2026-02-17T12:00:00.000Z"
  }
}
```

## CLI Commands

### Create Profile

```bash
aegismemory cyberdyne-create \
  --telegram-id 5451495644 \
  --username Skywalker432 \
  --display-name "Skywalker" \
  --score 417 \
  --rank 8 \
  --tier HARMONIC \
  --xnt-entitlement 100 \
  --contributions '[{"type":"builder","name":"Buy Bot Portfolio","description":"7 buy bots deployed","score":150}]' \
  --achievements "7 buy bots,Moderator" \
  --communities "X1 XEN CRYPTO,Echo Hound"
```

**Output:**
```
✅ Profile created successfully!

Schema:     cyberdyne_profile_v2
Telegram:   5451495644 (@Skywalker432)
Score:      417 (Rank #8)
Tier:       HARMONIC
Level:      4 (XP: 17/117)
CID:        QmfNTR8kEizdx1ogRATp2D8F3zMb5VFgASktgqfsXZehhW
Size:       655 bytes (toon)
Cost:       $0 (IPFS only)

View: https://ipfs.io/ipfs/QmfNTR8kEizdx1ogRATp2D8F3zMb5VFgASktgqfsXZehhW
```

### Get Profile

```bash
# Pretty format (default)
aegismemory cyberdyne-get --telegram-id 5451495644

# TOON format (compact, human-readable)
aegismemory cyberdyne-get --telegram-id 5451495644 --format toon

# JSON format
aegismemory cyberdyne-get --telegram-id 5451495644 --format json
```

### Update Profile

```bash
aegismemory cyberdyne-update \
  --telegram-id 5451495644 \
  --score 450 \
  --rank 7 \
  --add-contribution '{"type":"promoter","name":"Community Event","score":50}'
```

### List Profiles

```bash
aegismemory cyberdyne-list
```

### Profile Statistics

```bash
aegismemory cyberdyne-stats --telegram-id 5451495644
```

### Export Profile

```bash
# Export as JSON
aegismemory cyberdyne-export --telegram-id 5451495644 --output profile.json

# Export as TOON
aegismemory cyberdyne-export --telegram-id 5451495644 --output profile.toon --format toon
```

### Verify Profile

```bash
aegismemory cyberdyne-verify --cid QmfNTR8kEizdx1ogRATp2D8F3zMb5VFgASktgqfsXZehhW
```

## OpenClaw Tools (Theo Integration)

The following tools are automatically registered when AegisMemory plugin loads:

### `cyberdyne_create_profile`

Create and store an encrypted profile.

**Parameters:**
- `telegram_id` (number, required) - Telegram user ID
- `username` (string, required) - Username
- `display_name` (string, optional) - Display name
- `score` (number, default: 0) - Reputation score
- `rank` (number, default: 0) - Rank position
- `tier` (string, default: "ATTUNING") - Tier name
- `xnt_entitlement` (number, default: 0) - XNT allocation
- `wallet` (string, optional) - Wallet address
- `contributions` (array, optional) - Contribution objects
- `achievements` (array, optional) - Achievement strings
- `communities` (array, optional) - Community names

**Returns:**
```json
{
  "success": true,
  "cid": "QmfNTR8...",
  "profile": {
    "telegram_id": 5451495644,
    "username": "Skywalker432",
    "score": 417,
    "rank": 8,
    "tier": "HARMONIC",
    "level": 4,
    "xp": 17
  },
  "ipfs_url": "https://ipfs.io/ipfs/QmfNTR8...",
  "size": 655,
  "format": "toon"
}
```

### `cyberdyne_get_profile`

Retrieve and decrypt a profile.

**Parameters:**
- `telegram_id` (number, required) - Telegram user ID
- `wallet` (string, optional) - Wallet address

**Returns:**
```json
{
  "success": true,
  "profile": {
    "telegram_id": 5451495644,
    "username": "Skywalker432",
    "display_name": "Skywalker",
    "score": 417,
    "rank": 8,
    "tier": "HARMONIC",
    "level": 4,
    "xp": 17,
    "xnt_entitlement": 100,
    "contributions": [...],
    "achievements": [...],
    "communities": [...],
    "badges": [...]
  },
  "cid": "QmfNTR8...",
  "version": "2"
}
```

### `cyberdyne_update_profile`

Update an existing profile.

**Parameters:**
- `telegram_id` (number, required) - Telegram user ID
- `score` (number, optional) - New score
- `rank` (number, optional) - New rank
- `tier` (string, optional) - New tier
- `xnt_entitlement` (number, optional) - New XNT allocation
- `add_contribution` (object, optional) - Contribution to add
- `add_achievement` (string, optional) - Achievement to add
- `wallet` (string, optional) - Wallet address

**Returns:**
```json
{
  "success": true,
  "cid": "QmNewCID...",
  "old_version": 2,
  "new_version": 3,
  "message": "✅ Profile updated! New CID: QmNewCID..."
}
```

### `cyberdyne_list_profiles`

List all profiles for the current wallet.

**Parameters:**
- `wallet` (string, optional) - Wallet address

**Returns:**
```json
{
  "success": true,
  "count": 5,
  "profiles": [
    {
      "telegram_id": 5451495644,
      "cid": "QmfNTR8...",
      "username": "Skywalker432",
      "score": 417,
      "rank": 8,
      "tier": "HARMONIC",
      "updated_at": "2026-02-17T21:58:21.719Z"
    }
  ]
}
```

## TOON Format

TOON (Telegram Object Notation) is a compact, human-readable format that saves ~40% space compared to JSON.

**Example:**

```
@cyberdyne_profile_v2

version: 2
created: 2026-02-17T21:58:21.719Z
updated: 2026-02-17T21:58:21.719Z

# Identity
telegram: 5451495644
username: Skywalker432
display: Skywalker
handle: @Skywalker432

# Reputation
score: 417
rank: 8
tier: HARMONIC
level: 4
xp: 17/117
xnt: 100

# Contributions
[builder]
- Buy Bot Portfolio (150 pts)

# Achievements
- 7 buy bots deployed
- Multi-community moderator

# Communities
- X1 XEN CRYPTO
- Echo Hound

# Skills
builder: 150

# Badges
- 🌟 Rising Star
- 🥇 Top 10
- 🚀 Builder

# Metadata
cid: QmfNTR8kEizdx1ogRATp2D8F3zMb5VFgASktgqfsXZehhW
source: aegismemory-cli
enhanced: true

# Encryption
algo: AES-256-GCM
key: wallet_signature
encrypted: 2026-02-17T21:58:21.719Z
```

## Storage & Costs

### IPFS Storage (Free)

- **Provider:** X1 Vault
- **Cost:** $0 (free)
- **When:** Every profile creation/update
- **Speed:** Immediate (~500ms)
- **Retrieval:** Via X1 Vault API or public IPFS gateways

### On-chain Anchoring (Optional)

- **Network:** X1 (Solana)
- **Cost:** ~$0.000005 per anchor (5 microlamports)
- **When:** Optional (not required for profiles)
- **Purpose:** Timestamping and immutability proof

**Note:** Profiles are stored on IPFS only by default. On-chain anchoring is optional and not required for basic functionality.

## Security Model

### Zero-Knowledge Architecture

1. **Profile Generation:** Bot collects data from user activity
2. **User Approval:** User reviews profile in web client
3. **Client-side Encryption:** Profile encrypted with user's wallet signature
4. **IPFS Upload:** Encrypted payload uploaded to X1 Vault
5. **CID Storage:** Only CID stored in bot's state

**AI never sees plaintext profiles.** All decryption happens client-side or in authorized contexts.

### Encryption Details

- **Algorithm:** AES-256-GCM
- **Key Derivation:** Wallet signature (ed25519)
- **Derivation Message:** `IPFS_ENCRYPTION_KEY_V1`
- **Key Caching:** 10 minutes (configurable)

## Integration Example (Theo Bot)

```javascript
// In Theo's conversation handler
async function handleUserCommand(ctx) {
  const telegramId = ctx.from.id;
  const username = ctx.from.username;
  
  // Generate profile from user's activity
  const profile = await generateProfileFromActivity(telegramId);
  
  // Create encrypted profile
  const result = await ctx.tools.cyberdyne_create_profile({
    telegram_id: telegramId,
    username: username,
    score: profile.score,
    rank: profile.rank,
    tier: profile.tier,
    contributions: profile.contributions,
    achievements: profile.achievements,
    communities: profile.communities
  });
  
  if (result.success) {
    await ctx.reply(
      `✅ Your Cyberdyne Profile has been created!\n\n` +
      `🎯 Score: ${profile.score}\n` +
      `🏆 Rank: #${profile.rank}\n` +
      `⚡ Tier: ${profile.tier}\n\n` +
      `View: ${result.ipfs_url}`
    );
  }
}

// Retrieve profile later
async function getProfile(ctx, telegramId) {
  const result = await ctx.tools.cyberdyne_get_profile({
    telegram_id: telegramId
  });
  
  if (result.success) {
    return result.profile;
  }
  return null;
}
```

## File Structure

```
aegismemory/
├── lib/
│   └── cyberdyne/
│       ├── profileSchema.js      # Schema validation & helpers
│       ├── profileManager.js     # CRUD operations
│       └── profileToon.js        # TOON format encoder/decoder
├── bin/
│   └── aegismemory.js            # CLI with cyberdyne-* commands
├── index.js                      # Plugin registration (includes tools)
└── CYBERDYNE_PROFILES.md         # This file
```

## Troubleshooting

### Profile Not Found

```bash
# Check if profile exists
aegismemory cyberdyne-list

# Verify CID is accessible
aegismemory cyberdyne-verify --cid QmYourCID...
```

### Decryption Failed

- Ensure wallet secret key is correct in config
- Check that the profile was encrypted with the same wallet
- Verify IPFS gateway is accessible

### IPFS Fetch Timeout

- X1 Vault API may be slow (try again)
- Use public gateways as fallback: `ipfs.io`, `cloudflare-ipfs.com`

## Roadmap

- [ ] Web client for profile approval
- [ ] Profile search by username
- [ ] Profile badges system
- [ ] Vouch/endorsement system
- [ ] Profile analytics dashboard
- [ ] Multi-wallet support

## License

MIT

## Support

For issues or questions:
- GitHub: https://github.com/your-org/aegismemory
- Telegram: @YourSupportBot
