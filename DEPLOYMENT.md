# AegisMemory Deployment Guide

Complete guide for deploying AegisMemory in production environments.

---

## 📋 Prerequisites

### System Requirements

- **OS**: Linux (Ubuntu 20.04+), macOS, or Windows WSL2
- **Node.js**: >= 18.0.0
- **Memory**: 512MB minimum, 2GB recommended
- **Disk**: 1GB for application + storage for memories
- **Network**: Stable internet connection for IPFS/RPC

### Required Software

1. **Node.js & npm**
2. **Solana CLI** (for wallet management and balance checks)
3. **OpenClaw** (for plugin integration)
4. **Git** (for installation)

---

## 🔧 Step 1: Install Dependencies

### Install Node.js

#### Ubuntu/Debian
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version  # Should be >= 18.0.0
```

#### macOS
```bash
brew install node@18
node --version
```

#### Verify Installation
```bash
node --version  # Should show v18.x.x or higher
npm --version   # Should show 9.x.x or higher
```

---

### Install Solana CLI

The Solana CLI is required for:
- Wallet management
- Balance checking
- Transaction verification

#### Linux & macOS
```bash
# Install Solana CLI
curl -sSfL https://release.solana.com/stable/install | sh

# Add to PATH (add to ~/.bashrc or ~/.zshrc for persistence)
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

# Reload shell configuration
source ~/.bashrc  # or source ~/.zshrc on macOS

# Verify installation
solana --version
```

#### Windows (WSL2)
```bash
# Same as Linux
curl -sSfL https://release.solana.com/stable/install | sh
source ~/.bashrc
solana --version
```

#### Verify Solana CLI
```bash
# Should show version 1.18.x or higher
solana --version

# Test RPC connection to X1 mainnet
solana cluster-version --url https://rpc.mainnet.x1.xyz
```

---

## 💰 Step 2: Create & Fund Wallet

### Create New Wallet

```bash
# Generate new keypair
solana-keygen new --outfile ~/.openclaw/solana-wallet.json

# IMPORTANT: Save the seed phrase securely!
# You'll need it to recover your wallet
```

### Get Wallet Address

```bash
# Display your wallet public key
solana-keygen pubkey ~/.openclaw/solana-wallet.json

# Example output: 9SksTs4MBiqpK3aBxDhzrVforfsR2u9hAaawdrFsNPjd
```

### Fund Wallet

You need XNT tokens for:
- Transaction fees (~0.000005 XNT per tx)
- Anchor costs (~0.002 XNT per anchor)

**Recommended starting balance: 1 XNT**

#### Option 1: Faucet (Testnet)
```bash
# For testnet only
solana airdrop 1 --url https://rpc.testnet.x1.xyz
```

#### Option 2: Exchange (Mainnet)
1. Buy XNT on supported exchanges
2. Withdraw to your wallet address
3. Wait for confirmation

### Check Balance

```bash
# Check mainnet balance
solana balance --url https://rpc.mainnet.x1.xyz

# Or use AegisMemory CLI (after installation)
cd /path/to/aegismemory
./bin/aegismemory.js status
```

---

## 📦 Step 3: Install AegisMemory

### Option A: Via OpenClaw (Recommended)

```bash
# Clone repository
git clone https://github.com/Xenian84/aegismemory.git
cd aegismemory

# Install dependencies
npm install

# Install as OpenClaw plugin
openclaw plugin install $(pwd)

# Verify installation
openclaw plugin list
```

### Option B: Standalone Installation

```bash
# Clone repository
git clone https://github.com/Xenian84/aegismemory.git
cd aegismemory

# Install dependencies
npm install

# Run tests
npm test

# Test CLI
./bin/aegismemory.js help
```

---

## ⚙️ Step 4: Configuration

### Environment Variables

Create `.env` file in project root:

```bash
# Copy example
cp .env.example .env

# Edit with your values
nano .env
```

**Required Variables:**

```bash
# Wallet Configuration
AEGISMEMORY_WALLET_PUBKEY="9SksTs4MBiqpK3aBxDhzrVforfsR2u9hAaawdrFsNPjd"
AEGISMEMORY_WALLET_SECRET_KEY="base58_encoded_secret_key"

# Agent Configuration
AEGISMEMORY_AGENT_ID="your_agent_name"

# X1 Vault Configuration
AEGISMEMORY_VAULT_URL="https://vault.x1.xyz/ipfs"
AEGISMEMORY_IPFS_GATEWAY_URLS="https://vault.x1.xyz/ipfs"

# Anchoring Configuration
AEGISMEMORY_ANCHOR_ENABLED="true"
AEGISMEMORY_ANCHOR_RPC_URL="https://rpc.mainnet.x1.xyz"
AEGISMEMORY_ANCHOR_RPC_FALLBACK_URLS="https://rpc.mainnet.x1.xyz,https://rpc.testnet.x1.xyz"
AEGISMEMORY_ANCHOR_FREQUENCY="every_save"  # or "daily"

# Memory Configuration
AEGISMEMORY_MEMORY_FORMAT="toon"  # or "json"
AEGISMEMORY_RECALL_ENABLED="true"
AEGISMEMORY_ADD_ENABLED="true"
```

### Get Base58 Secret Key

```bash
# Convert JSON wallet to base58
cat ~/.openclaw/solana-wallet.json | jq -r '.[0:32] | @base64'

# Or use Solana CLI
solana-keygen pubkey ~/.openclaw/solana-wallet.json --outfile /tmp/pubkey.txt
# Then manually encode the private key
```

### OpenClaw Configuration

Add to `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "aegismemory": {
        "walletPubkey": "YOUR_WALLET_PUBKEY",
        "walletSecretKeyBase58": "YOUR_SECRET_KEY_BASE58",
        "agentId": "your_agent_id",
        "memoryFormat": "toon",
        "anchorEnabled": true,
        "anchorRpcUrl": "https://rpc.mainnet.x1.xyz",
        "anchorFrequency": "every_save",
        "recallEnabled": true,
        "addEnabled": true
      }
    }
  }
}
```

---

## ✅ Step 5: Verify Installation

### Test CLI

```bash
cd /path/to/aegismemory

# Check status (should show wallet balance)
./bin/aegismemory.js status

# Expected output:
# Wallet: 9SksTs4MBiqpK3aBxDhzrVforfsR2u9hAaawdrFsNPjd
# Balance: 0.982 SOL
# Anchor Enabled: true
```

### Test Memory Save

```bash
# Save a test memory
node test-save-memory.js

# Process queue
./bin/aegismemory.js replay-queue

# Check status again
./bin/aegismemory.js status
```

### Test Anchor

```bash
# Get latest CID from status
./bin/aegismemory.js status

# Anchor it manually
./bin/aegismemory.js anchor --cid QmYourCidHere

# Should show:
# ✅ Anchor submitted successfully!
# Transaction Signature: ...
# 🔍 View on Explorer: https://explorer.x1.xyz/tx/...
```

### Verify on Explorer

1. Copy transaction signature from anchor output
2. Visit: `https://explorer.x1.xyz/tx/YOUR_SIGNATURE`
3. Verify memo payload contains: `AegisMemory|v1|...`

---

## 🚀 Step 6: Production Deployment

### Systemd Service (Linux)

Create `/etc/systemd/system/aegismemory-worker.service`:

```ini
[Unit]
Description=AegisMemory Queue Worker
After=network.target

[Service]
Type=simple
User=your_user
WorkingDirectory=/path/to/aegismemory
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node /path/to/aegismemory/bin/aegismemory.js replay-queue
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable aegismemory-worker
sudo systemctl start aegismemory-worker
sudo systemctl status aegismemory-worker
```

### PM2 (Process Manager)

```bash
# Install PM2
npm install -g pm2

# Start worker
pm2 start bin/aegismemory.js --name aegismemory-worker -- replay-queue

# Save configuration
pm2 save

# Setup startup script
pm2 startup
```

### Docker Deployment

Create `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .

CMD ["node", "bin/aegismemory.js", "replay-queue"]
```

Build and run:

```bash
docker build -t aegismemory .
docker run -d --name aegismemory \
  -e AEGISMEMORY_WALLET_PUBKEY="..." \
  -e AEGISMEMORY_WALLET_SECRET_KEY="..." \
  aegismemory
```

---

## 📊 Monitoring

### Check Logs

```bash
# Systemd
sudo journalctl -u aegismemory-worker -f

# PM2
pm2 logs aegismemory-worker

# Docker
docker logs -f aegismemory
```

### Monitor Status

```bash
# Check status
./bin/aegismemory.js status

# Check recent transactions
solana transaction-history $(solana-keygen pubkey ~/.openclaw/solana-wallet.json) \
  --url https://rpc.mainnet.x1.xyz
```

### Set Up Alerts

Monitor for:
- Low wallet balance (< 0.1 XNT)
- Failed anchor transactions
- Queue backlog
- RPC connection failures

---

## 🔒 Security Best Practices

### Wallet Security

1. **Never commit wallet files to git**
   ```bash
   # Add to .gitignore
   echo "*.json" >> .gitignore
   echo ".env" >> .gitignore
   ```

2. **Use dedicated wallet for anchoring**
   - Separate wallet for production
   - Limit funds to operational needs
   - Regular balance monitoring

3. **Backup seed phrase**
   - Store offline in secure location
   - Never share or expose
   - Test recovery process

### Environment Security

1. **Restrict file permissions**
   ```bash
   chmod 600 ~/.openclaw/solana-wallet.json
   chmod 600 .env
   ```

2. **Use environment variables**
   - Never hardcode secrets
   - Use `.env` files (not committed)
   - Rotate keys regularly

3. **Network security**
   - Use HTTPS for all connections
   - Verify SSL certificates
   - Monitor for suspicious activity

---

## 🐛 Troubleshooting

### Common Issues

#### 1. "Insufficient funds" error
```bash
# Check balance
solana balance --url https://rpc.mainnet.x1.xyz

# Fund wallet if needed
```

#### 2. "RPC connection failed"
```bash
# Test RPC connectivity
curl -X POST https://rpc.mainnet.x1.xyz \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'

# Try fallback RPC
export AEGISMEMORY_ANCHOR_RPC_URL="https://rpc.testnet.x1.xyz"
```

#### 3. "Queue jobs failing"
```bash
# Check queue status
./bin/aegismemory.js status

# Replay queue manually
./bin/aegismemory.js replay-queue

# Check logs for errors
```

#### 4. "Solana CLI not found"
```bash
# Verify installation
which solana

# If not found, reinstall
curl -sSfL https://release.solana.com/stable/install | sh
source ~/.bashrc
```

---

## 📈 Performance Tuning

### Optimize for High Volume

```bash
# Increase worker interval (faster processing)
export AEGISMEMORY_WORKER_INTERVAL_MS=1000

# Increase fetch concurrency
export AEGISMEMORY_FETCH_CONCURRENCY=8

# Increase max retries
export AEGISMEMORY_MAX_RETRIES=10
```

### Reduce Costs

```bash
# Use daily anchoring instead of every_save
export AEGISMEMORY_ANCHOR_FREQUENCY="daily"

# Use TOON format (46% smaller)
export AEGISMEMORY_MEMORY_FORMAT="toon"

# Disable anchoring for non-critical memories
export AEGISMEMORY_ANCHOR_ENABLED="false"
```

---

## 🔄 Maintenance

### Regular Tasks

**Daily:**
- Check wallet balance
- Monitor transaction success rate
- Review error logs

**Weekly:**
- Verify anchor transactions on explorer
- Check queue backlog
- Update dependencies

**Monthly:**
- Rotate wallet keys (if required)
- Review and optimize costs
- Update AegisMemory version

### Backup Strategy

```bash
# Backup state files
cp ~/.openclaw/aegismemory/state.json ~/backups/state-$(date +%Y%m%d).json

# Backup queue
cp ~/.openclaw/aegismemory/queue.jsonl ~/backups/queue-$(date +%Y%m%d).jsonl

# Backup wallet
cp ~/.openclaw/solana-wallet.json ~/backups/wallet-$(date +%Y%m%d).json
```

---

## 📞 Support

### Resources

- **Documentation**: [README.md](./README.md)
- **GitHub Issues**: https://github.com/Xenian84/aegismemory/issues
- **X1 Docs**: https://docs.x1.xyz
- **Explorer**: https://explorer.x1.xyz

### Getting Help

1. Check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
2. Search existing GitHub issues
3. Join community Discord/Telegram
4. Create new GitHub issue with:
   - AegisMemory version
   - Node.js version
   - Error logs
   - Steps to reproduce

---

## ✅ Deployment Checklist

- [ ] Node.js >= 18.0.0 installed
- [ ] Solana CLI installed and in PATH
- [ ] Wallet created and funded (>= 1 XNT)
- [ ] AegisMemory cloned and dependencies installed
- [ ] Environment variables configured
- [ ] OpenClaw configuration updated
- [ ] Test memory save successful
- [ ] Test anchor transaction successful
- [ ] Verified transaction on explorer
- [ ] Production service configured (systemd/PM2/Docker)
- [ ] Monitoring and alerts set up
- [ ] Backup strategy implemented
- [ ] Security best practices followed

---

**Deployment Complete!** 🎉

Your AegisMemory instance is now ready for production use.
