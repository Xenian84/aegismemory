# AegisMemory 🛡️

**Production-grade encrypted memory storage for OpenClaw with CID chaining and on-chain anchoring on X1 Blockchain**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![Status](https://img.shields.io/badge/status-production-success)](https://github.com/Xenian84/aegismemory)

---

## 🚀 Features

- 🔐 **End-to-End Encryption**: AES-256-GCM with wallet-derived keys
- ⛓️ **On-Chain Anchoring**: Immutable proofs on X1 Blockchain
- 💾 **IPFS Storage**: Free decentralized storage via X1 Vault
- 📦 **TOON Format**: 46% space savings with human-readable format
- 🔄 **CID Chaining**: Cryptographically linked memory history
- ⚡ **Durable Queue**: Persistent job queue with automatic retries
- 🎯 **OpenClaw Integration**: Seamless memory slot provider
- 💰 **Cost Effective**: Only 0.002 XNT per memory anchor

---

## 📋 Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [CLI Usage](#cli-usage)
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
./bin/aegismemory.js recall --limit=5
```

Fetches and decrypts recent memories.

### Export

```bash
./bin/aegismemory.js export > backup.json
```

Exports state to JSON for backup.

### Replay Queue

```bash
./bin/aegismemory.js replay-queue
```

Manually processes pending queue jobs.

### Anchor

```bash
./bin/aegismemory.js anchor --cid=<CID> --sha256=<SHA256>
```

Manually anchors a memory to X1 Blockchain.

---

## 🏗️ Architecture

### Two-Layer Storage

1. **X1 Vault (IPFS)**: Stores encrypted memory data
   - Free, decentralized storage
   - Content-addressed (CID)
   - Encrypted with AES-256-GCM

2. **X1 Blockchain**: Stores cryptographic proofs
   - Immutable on-chain anchoring
   - Small memo transactions (0.002 XNT)
   - Verifiable integrity

### Memory Flow

```
Chat Turn → Capture → Encrypt → Queue → IPFS Upload → X1 Anchor → State Update
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

- **Transaction Fee**: 0.002 XNT (flat rate)
- **IPFS Storage**: FREE (X1 Vault)
- **Example**: 0.01 SOL = ~5 transactions

### Space Efficiency

- **JSON Format**: ~1,370 bytes per memory
- **TOON Format**: ~742 bytes per memory
- **Savings**: 46% reduction

### Capacity Calculation

```
Wallet Balance: 0.988 SOL
Cost per TX: 0.002 XNT
Capacity: ~494 transactions
```

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
