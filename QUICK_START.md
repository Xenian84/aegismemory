# Quick Start Guide

Get AegisMemory running in 5 minutes!

## Prerequisites

- ✅ Node.js >= 18.0.0
- ✅ OpenClaw installed
- ✅ X1 wallet with XNT tokens

## Installation

```bash
# 1. Clone the repository
git clone https://github.com/Xenian84/aegismemory.git
cd aegismemory

# 2. Install dependencies
npm install

# 3. Configure your wallet
cp .env.example .env
nano .env  # Add your wallet credentials
```

## Configuration

Edit `.env` file:

```bash
AEGISMEMORY_WALLET_PUBKEY=your_wallet_public_key
AEGISMEMORY_WALLET_SECRET_KEY=your_wallet_secret_key_base58
AEGISMEMORY_AGENT_ID=tg
```

## Install Plugin

```bash
# Install in OpenClaw
openclaw plugins install .

# Enable the plugin
openclaw plugins enable aegismemory

# Restart gateway
openclaw gateway restart
```

## Verify Installation

```bash
# Check plugin status
openclaw plugins list | grep AegisMemory

# Check AegisMemory status
./bin/aegismemory.js status
```

Expected output:
```
=== AegisMemory Status ===
Wallet: 9Sks...NPjd
Agent ID: tg
Vault URL: https://vault.x1.xyz/ipfs
Anchor Enabled: true
```

## Test It

Send a message to your OpenClaw bot (e.g., via Telegram), then:

```bash
./bin/aegismemory.js status
```

You should see:
- Last CID: `Qm...`
- Last Anchored: `2026-02-16`

## View On-Chain

Check your transaction on X1 Explorer:
```bash
# Get wallet address
solana address

# View transactions
https://explorer.x1ns.xyz/address/<your-wallet-address>
```

## Troubleshooting

### Plugin not loading?
```bash
openclaw doctor --fix
openclaw plugins enable aegismemory
```

### No memories saved?
Check logs:
```bash
tail -f ~/.openclaw/logs/gateway.log | grep aegismemory
```

### Queue not processing?
```bash
cat ~/.openclaw/aegismemory/queue.jsonl
./bin/aegismemory.js replay-queue
```

## Next Steps

- Read [README.md](./README.md) for full documentation
- Check [STORAGE_ARCHITECTURE.md](./STORAGE_ARCHITECTURE.md) for technical details
- See [CONTRIBUTING.md](./CONTRIBUTING.md) to contribute

## Support

- Issues: [GitHub Issues](https://github.com/yourusername/aegismemory/issues)
- OpenClaw: https://openclaw.ai/
- X1 Blockchain: https://x1.xyz/

---

**You're all set! 🚀**
