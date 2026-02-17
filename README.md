# AegisMemory 🛡️

**Production-grade encrypted memory storage for OpenClaw with CID chaining and on-chain anchoring on X1 Blockchain**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![Version](https://img.shields.io/badge/version-3.0.0-blue.svg)](https://github.com/Xenian84/aegismemory/releases)
[![Status](https://img.shields.io/badge/status-production-success)](https://github.com/Xenian84/aegismemory)

---

## 🚀 Features

### Core Features
- 🔐 **End-to-End Encryption**: AES-256-GCM with wallet-derived keys
- ⛓️ **On-Chain Anchoring**: Immutable proofs on X1 Blockchain
- 💾 **IPFS Storage**: Free decentralized storage via X1 Vault
- 📦 **TOON Format**: 46% space savings with human-readable format
- 🔄 **CID Chaining**: Cryptographically linked memory history
- ⚡ **Durable Queue**: Persistent job queue with automatic retries
- 🎯 **OpenClaw Integration**: Seamless memory slot provider
- 💰 **Cost Effective**: Only 0.002 XNT per memory anchor

### v3.0 Features (NEW)
- 👤 **Cyberdyne Profiles**: Encrypted user reputation profiles on IPFS
- 🔐 **Zero-Knowledge Architecture**: AI never sees plaintext profiles
- 🎯 **Rich Profile Schema**: Reputation, contributions, achievements, communities
- 🤖 **OpenClaw Tools**: Native integration for Telegram bots (Theo)
- 📊 **Profile Management**: Full CRUD operations via CLI and tools
- 🔄 **Version Tracking**: Complete profile history via CID chain
- 💾 **TOON Format**: 40% smaller profiles, human-readable

### v2.1 Features
- 🔍 **Semantic Search**: Natural language memory search with vector embeddings
- 🤝 **Cross-Agent Memory**: Permission-based memory sharing between agents
- ⏰ **Ephemeral Memories**: Auto-expiring memories for privacy and cost savings
- 🌳 **Memory Branches**: Multiple memory chains for different contexts
- 🌐 **HTML Chat Viewer**: Beautiful HTML dumps with colors and timestamps
- 💰 **Balance Check**: Integrated Solana wallet balance display
- 🔗 **Explorer Links**: Direct links to X1 blockchain explorer
- 🔑 **Keyword Extraction**: Automatic keyword detection in memories

---

## 📋 Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [CLI Usage](#cli-usage)
- [Cyberdyne Profiles](#cyberdyne-profiles)
- [Architecture](#architecture)
- [Security](#security)
- [Cost Analysis](#cost-analysis)
- [Development](#development)
- [Credits](#credits)
- [License](#license)

---

## 🔧 Installation

### Prerequisites

- Node.js >= 18.0.0
- Solana CLI (for wallet management)
- OpenClaw (for plugin integration)

### Install Solana CLI

```bash
curl -sSfL https://release.solana.com/stable/install | sh
source ~/.bashrc
solana --version
```

### Install AegisMemory

#### Via OpenClaw (Recommended)

```bash
cd ~/.openclaw
openclaw plugins install /path/to/aegismemory
openclaw plugins enable aegismemory
```

#### Manual Installation

```bash
git clone https://github.com/Xenian84/aegismemory.git
cd aegismemory
npm install
```

---

## ⚡ Quick Start

See [QUICK_START.md](./QUICK_START.md) for a 5-minute setup guide.

### 1. Configure Environment

```bash
cp .env.example .env
# Edit .env with your wallet details
```

### 2. Configure OpenClaw

Add to `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "aegismemory": {
        "walletPubkey": "your_wallet_public_key",
        "walletSecretKeyPath": "~/.openclaw/solana-wallet.json",
        "agentId": "your_agent_id",
        "memoryFormat": "toon",
        "anchorEnabled": true,
        "anchorRpcUrl": "https://rpc.mainnet.x1.xyz"
      }
    },
    "slots": {
      "memory": "aegismemory"
    }
  }
}
```

### 3. Fund Your Wallet

```bash
# Check balance
solana balance <your-wallet> --url https://rpc.mainnet.x1.xyz

# Transfer at least 0.01 SOL for ~5 transactions
```

### 4. Test the Installation

```bash
cd aegismemory
./bin/aegismemory.js status
```

---

## ⚙️ Configuration

### Environment Variables

```env
# Wallet Configuration
AEGISMEMORY_WALLET_PUBKEY=your_wallet_public_key
AEGISMEMORY_WALLET_SECRET_KEY=your_wallet_secret_key_base58

# Agent Configuration
AEGISMEMORY_AGENT_ID=your_agent_id

# Anchoring Configuration
AEGISMEMORY_ANCHOR_ENABLED=true
AEGISMEMORY_ANCHOR_RPC_URL=https://rpc.mainnet.x1.xyz

# Memory Configuration
AEGISMEMORY_MEMORY_FORMAT=toon
AEGISMEMORY_MEMORY_LIMIT=50
AEGISMEMORY_CAPTURE_STRATEGY=full
```

### OpenClaw Plugin Configuration

The plugin supports the following configuration options:

- `walletPubkey`: Your Solana wallet public key
- `walletSecretKeyPath`: Path to wallet JSON file
- `agentId`: Unique identifier for your agent
- `memoryFormat`: `toon` (recommended) or `json`
- `recallEnabled`: Enable memory recall on agent start
- `addEnabled`: Enable memory saving on agent end
- `anchorEnabled`: Enable on-chain anchoring
- `anchorRpcUrl`: X1 RPC endpoint
- `memoryLimit`: Maximum number of messages to store
- `captureStrategy`: `full` or `summary`

---

## 🖥️ CLI Usage

AegisMemory includes a comprehensive CLI tool:

### Status

```bash
./bin/aegismemory.js status
```

Shows wallet, agent, queue, and state information.

### Verify

```bash
./bin/aegismemory.js verify --cid=<CID>
```

Verifies CID integrity (decryption, hash, chain, anchor).

### Recall

```bash
./bin/aegismemory.js recall --limit 5
```

Fetches and decrypts recent memories with keyword extraction.

### Search (NEW v2.1)

```bash
./bin/aegismemory.js search "validator requirements" --limit 5
./bin/aegismemory.js search "X1 network" --agent theo --min-score 0.7
```

Natural language semantic search across all memories.

### View (NEW v2.1)

```bash
./bin/aegismemory.js view --cid QmX...
```

Generate beautiful HTML chat dump with colors and timestamps. Saves to `/tmp/convo.html` and opens in browser.

### Export

```bash
./bin/aegismemory.js export --cid QmX... --out backup.json
```

Exports decrypted memory to JSON.

### Verify

```bash
./bin/aegismemory.js verify --cid QmX... --rpc
```

Verify memory integrity and on-chain anchor.

---

## 👤 Cyberdyne Profiles

**NEW in v3.0**: Encrypted user reputation profiles on IPFS with zero-knowledge architecture.

### Quick Start

```bash
# Create a profile
./bin/aegismemory.js cyberdyne-create \
  --telegram-id 5451495644 \
  --username Skywalker432 \
  --score 417 \
  --rank 8 \
  --tier HARMONIC

# Get a profile
./bin/aegismemory.js cyberdyne-get --telegram-id 5451495644

# List all profiles
./bin/aegismemory.js cyberdyne-list

# Get profile stats
./bin/aegismemory.js cyberdyne-stats --telegram-id 5451495644
```

### Features

- 🔐 **Client-side encryption** with wallet signatures
- 📦 **IPFS storage** (free, no XNT required)
- 🎯 **Zero-knowledge** - AI never sees plaintext
- 📊 **Rich schema** - Reputation, contributions, achievements
- 🔄 **Version tracking** via CID chain
- 💾 **TOON format** - 40% smaller than JSON
- 🤖 **OpenClaw tools** for bot integration

### Profile Schema

```json
{
  "identity": {
    "telegram_id": 5451495644,
    "username": "Skywalker432",
    "display_name": "Skywalker"
  },
  "reputation": {
    "score": 417,
    "rank": 8,
    "tier": "HARMONIC",
    "level": 4,
    "xp": 17
  },
  "contributions": [...],
  "achievements": [...],
  "communities": [...],
  "badges": [...]
}
```

### OpenClaw Tools

For Telegram bots (like Theo):

```javascript
// Create profile
await ctx.tools.cyberdyne_create_profile({
  telegram_id: 5451495644,
  username: "Skywalker432",
  score: 417,
  rank: 8
});

// Get profile
const result = await ctx.tools.cyberdyne_get_profile({
  telegram_id: 5451495644
});
```

**📖 Full documentation:** [CYBERDYNE_PROFILES.md](./CYBERDYNE_PROFILES.md)

---

### Replay Queue

```bash
./bin/aegismemory.js replay-queue
```

Manually processes pending queue jobs.

### Anchor

```bash
./bin/aegismemory.js anchor --cid QmX...
```

Manually anchors a memory to X1 Blockchain. Shows transaction signature and explorer link.

**Note**: Both `--flag value` and `--flag=value` formats are supported.

---

## 🆕 What's New in v2.1

### Semantic Search
Search memories by natural language instead of just dates:
```bash
aegismemory search "blockchain consensus mechanisms"
```
- Vector embeddings (384-dimensional)
- Relevance scoring (0-1)
- Agent filtering
- Auto-indexing on save

### Cross-Agent Memory Sharing
Share memories between agents with permissions:
- Grant/revoke access
- Read-only permissions
- Encrypted key sharing
- Collective intelligence network

### Ephemeral Memories
Auto-expiring memories for privacy and cost savings:
- Temporary session data
- No IPFS upload or anchoring
- Free storage
- GDPR compliance

### Memory Branches
Multiple memory chains for different contexts:
- Separate work/personal memories
- Project isolation
- Branch merging
- Context switching

### HTML Chat Viewer
Beautiful visual memory viewer:
- Color-coded users (Xenian: Red, Tachyon: Green)
- Full timestamps
- Responsive design
- Auto-opens in browser

### Enhanced CLI
- Solana balance check in status
- Explorer links in anchor output
- Keyword extraction in recall
- Flexible flag formats (`--flag value` or `--flag=value`)

---

## 🏗️ Architecture

### Two-Layer Storage

1. **X1 Vault (IPFS)**: Stores encrypted memory data
   - Free, decentralized storage
   - Content-addressed (CID)
   - Encrypted with AES-256-GCM
   - **Every conversation saved immediately**

2. **X1 Blockchain**: Stores cryptographic proofs
   - Immutable on-chain anchoring
   - Small memo transactions (~0.000005 SOL)
   - Verifiable integrity
   - **Daily anchoring by default**

### How It Works

#### Every Conversation Turn (Automatic)
1. ✅ **Capture**: Messages extracted from OpenClaw `agent_end` hook
2. 🔐 **Encrypt**: AES-256-GCM with wallet-derived key
3. 📤 **Upload**: Saved to IPFS immediately via vault.x1.xyz API
4. 🔗 **Chain**: New CID links to previous CID (`prev_cid`)
5. 💾 **State**: Local state updated with latest CID

**Result**: Every conversation is encrypted and stored on IPFS within seconds.

#### Daily On-Chain Anchoring (Automatic)
1. 🔍 **Check**: System checks if already anchored today
2. ⚓ **Anchor**: If new day, writes CID + SHA256 to Solana Memo Program
3. ⛓️ **Confirm**: Transaction confirmed on X1 blockchain
4. 📅 **Update**: `lastAnchoredDate` updated to current date

**Result**: Once per day, your memory chain gets an immutable timestamp proof on-chain.

### Storage Locations

**IPFS (Encrypted Data):**
- ✅ Vault API: `https://vault.x1.xyz/ipfs/api/v0/cat?arg=<CID>`
- ✅ Public IPFS: `https://ipfs.io/ipfs/<CID>`
- ❌ Vault Gateway: Disabled (use API instead)

**On-Chain (Timestamp Proofs):**
- View transactions: `https://explorer.x1.xyz/address/9SksTs4MBiqpK3aBxDhzrVforfsR2u9hAaawdrFsNPjd`
- RPC: `https://rpc.mainnet.x1.xyz`

### Anchor Frequency Options

**Daily (Default):**
```bash
# Anchors once per calendar day (UTC)
# Cost: ~0.000005 SOL/day (~$0.0001/day)
# Default behavior - no configuration needed
```

**Every Save (Optional):**
```bash
# In ~/.openclaw/.env
AEGISMEMORY_ANCHOR_FREQUENCY=every_save

# Anchors every single conversation
# Cost: ~0.000005 SOL per conversation
# Maximum security and verifiability
```

### Memory Flow

```
Chat Turn → Capture → Encrypt → IPFS Upload (immediate) → State Update
                                      ↓
                              Daily Check → Anchor to X1 (once/day)
```

### TOON Format

Telegram Object Notation - a human-readable, space-efficient format:

```
@aegismemory.v1

agent: your_agent
wallet: 9SksTs4...
time: 2026-02-16T19:44:17.006Z
cid: QmSPMfe4...
sha256: 94125c04...

[messages]
- role: user
  content: Hello
  time: 2026-02-16T19:44:17.006Z
```

**Space Savings**: 46% compared to JSON

---

## 🔐 Security

### Encryption

- **Algorithm**: AES-256-GCM
- **Key Derivation**: Wallet-based (Ed25519)
- **Nonce**: Random 12-byte IV per encryption
- **Authentication**: Built-in AEAD

### Verification

- **SHA256 Hashing**: Content integrity
- **CID Linking**: Chain continuity
- **Signature Verification**: Ed25519 signing
- **On-Chain Proofs**: Immutable anchoring

### Best Practices

1. Keep wallet private keys secure
2. Use `.env` for sensitive configuration
3. Regularly backup state files
4. Monitor wallet balance
5. Verify CIDs after anchoring

---

## 💰 Cost Analysis

### X1 Blockchain Costs

**IPFS Storage:**
- **Cost**: FREE (X1 Vault)
- **Frequency**: Every conversation (immediate)
- **Size**: ~1,100 bytes encrypted per conversation

**On-Chain Anchoring:**
- **Transaction Fee**: ~0.000005 SOL per anchor
- **Daily Mode**: ~0.000005 SOL/day (~$0.0001/day)
- **Every-Save Mode**: ~0.000005 SOL per conversation

### Capacity Calculation

**Daily Anchoring (Default):**
```
Wallet Balance: 0.976 SOL
Cost per day: ~0.000005 SOL
Capacity: ~195,200 days (535+ years)
```

**Every-Save Anchoring:**
```
Wallet Balance: 0.976 SOL
Cost per conversation: ~0.000005 SOL
Capacity: ~195,200 conversations
```

### Space Efficiency

- **JSON Format**: ~1,370 bytes per memory
- **TOON Format**: ~742 bytes per memory
- **Savings**: 46% reduction
- **Encrypted**: ~1,100 bytes on IPFS

---

## 🛠️ Development

### Setup

```bash
git clone https://github.com/Xenian84/aegismemory.git
cd aegismemory
npm install
```

### Run Tests

```bash
npm test
```

### Project Structure

```
aegismemory/
├── bin/
│   └── aegismemory.js          # CLI tool
├── lib/
│   ├── aegisMemory.js          # Core orchestration
│   ├── anchorModule.js         # X1 blockchain anchoring
│   ├── cryptoBox.js            # Encryption/decryption
│   ├── ipfsFetch.js            # IPFS retrieval
│   ├── toon.js                 # TOON format
│   ├── queue.js                # Durable job queue
│   ├── state.js                # State management
│   └── ...
├── test/                       # Unit tests
├── index.js                    # Plugin entry point
├── openclaw.plugin.json        # Plugin manifest
├── package.json                # Dependencies
└── README.md                   # This file
```

### Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines.

---

## 🙏 Credits

AegisMemory is built with and for the following projects:

### Core Technologies

- **[OpenClaw](https://github.com/openclaw)** - AI agent framework
  - Memory slot provider integration
  - Plugin architecture
  - Lifecycle hooks

- **[X1 Network](https://x1.xyz)** - Blockchain infrastructure
  - X1 Blockchain for on-chain anchoring
  - X1 Vault (IPFS) for decentralized storage
  - X1 RPC endpoints

- **[Solana](https://solana.com)** - Blockchain foundation
  - Wallet infrastructure (Ed25519)
  - Transaction signing
  - Memo program for on-chain data

### Libraries

- **[@solana/web3.js](https://github.com/solana-labs/solana-web3.js)** - Solana JavaScript API
- **[@noble/ed25519](https://github.com/paulmillr/noble-ed25519)** - Ed25519 signatures
- **[@noble/hashes](https://github.com/paulmillr/noble-hashes)** - Cryptographic hashing
- **[bs58](https://github.com/cryptocoinjs/bs58)** - Base58 encoding

### Inspiration

- **IPFS** - Content-addressed storage
- **Telegram** - TOON format inspiration
- **OpenAI** - AI memory concepts

---

## 📄 License

MIT License - see [LICENSE](./LICENSE) file for details.

---

## 🔗 Links

- **X1 Network**: https://x1.xyz
- **X1 Explorer**: https://explorer.x1ns.xyz
- **X1 Vault**: https://vault.x1.xyz
- **OpenClaw**: https://github.com/openclaw
- **Documentation**: [QUICK_START.md](./QUICK_START.md)

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/Xenian84/aegismemory/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Xenian84/aegismemory/discussions)
- **Repository**: [github.com/Xenian84/aegismemory](https://github.com/Xenian84/aegismemory)

---

**Built with ❤️ for the OpenClaw and X1 communities**
