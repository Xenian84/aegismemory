# AegisMemory Anchor & IPFS Status

## Current Configuration

### Anchoring
- **Status**: ✅ Enabled (`AEGISMEMORY_ANCHOR_ENABLED=true`)
- **Frequency**: 📅 Daily (once per calendar day)
- **Program**: Solana Memo Program
- **RPC**: https://rpc.mainnet.x1.xyz
- **Wallet**: `9SksTs4MBiqpK3aBxDhzrVforfsR2u9hAaawdrFsNPjd`

### IPFS Storage
- **Vault**: https://vault.x1.xyz/ipfs
- **Encryption**: AES-256-GCM (wallet-derived key)
- **Format**: TOON (compact JSON)
- **Status**: ✅ Working

## How It Works

### Every Conversation Turn
1. ✅ **Capture**: Messages extracted from OpenClaw `agent_end` hook
2. ✅ **Encrypt**: AES-256-GCM with wallet-derived key
3. ✅ **Upload**: Saved to IPFS immediately
4. ✅ **Chain**: New CID links to previous CID (`prev_cid`)
5. ✅ **State**: Local state updated with latest CID

### Daily Anchoring
1. 🔍 **Check**: `shouldAnchor()` compares `lastAnchoredDate` vs current date
2. ⚓ **Anchor**: If different day, enqueue `ANCHOR_MEMORY` job
3. 📝 **Memo**: CID + SHA256 written to Solana Memo Program
4. ⛓️ **Confirm**: Transaction confirmed on X1 blockchain
5. 💾 **Update**: `lastAnchoredDate` updated to current date

## Current Status (2026-02-17 19:51 UTC)

### Latest Memory
- **CID**: `QmU9u1n7qmWJz2KJkjkdNoz2KwNUqdeVR1rRptbTsyVWXF`
- **Created**: 2026-02-17 19:50:57 UTC
- **Messages**: 2 (user + assistant)
- **IPFS**: ✅ Uploaded (1,110 bytes encrypted)
- **Anchored**: ⏸️ Not yet (waiting for next day)

### Last Anchor
- **Date**: 2026-02-17 02:25:06 UTC
- **Transaction**: `2nagVkthrvTudsLD...`
- **Next Anchor**: Tomorrow (2026-02-18)

## Frequency Options

You can change anchoring frequency by setting `AEGISMEMORY_ANCHOR_FREQUENCY`:

### `daily` (default)
- Anchors once per calendar day
- Cost: ~0.000005 SOL/day
- Best for: Regular usage, cost-efficient

### `every_save`
- Anchors every conversation turn
- Cost: ~0.000005 SOL per conversation
- Best for: High-security, immediate proof

### Example
```bash
# In ~/.openclaw/.env
AEGISMEMORY_ANCHOR_FREQUENCY=every_save
```

Then restart gateway:
```bash
pkill -f openclaw-gateway && openclaw gateway &
```

## Verification

### Check IPFS
```bash
curl -s "https://vault.x1.xyz/ipfs/api/v0/cat?arg=QmU9u1n7qmWJz2KJkjkdNoz2KwNUqdeVR1rRptbTsyVWXF" -X POST
```

### Check On-Chain
```bash
curl -s "https://rpc.mainnet.x1.xyz" -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getSignaturesForAddress","params":["9SksTs4MBiqpK3aBxDhzrVforfsR2u9hAaawdrFsNPjd",{"limit":5}]}'
```

### Check Status
```bash
cd /root/aegismemory && ./bin/aegismemory.js status
```

## Summary

✅ **Working Perfectly:**
- Auto-capture on every turn
- IPFS upload immediate
- Encryption secure
- CID chain intact

📅 **Daily Anchoring:**
- Already anchored today at 02:25 UTC
- Next anchor: Tomorrow (2026-02-18)
- All new CIDs saved to IPFS (just not anchored yet)

💡 **To anchor more frequently:** Change `AEGISMEMORY_ANCHOR_FREQUENCY=every_save`
