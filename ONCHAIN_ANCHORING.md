# On-Chain Anchoring with Solana Memo Program

## Current Configuration

**Frequency:** 📅 **DAILY** (default)  
**Status:** ✅ Enabled  
**Program:** Solana Memo Program (`MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`)  
**Network:** X1 Blockchain (Solana fork)  
**RPC:** https://rpc.mainnet.x1.xyz  
**Wallet:** `9SksTs4MBiqpK3aBxDhzrVforfsR2u9hAaawdrFsNPjd`

---

## How It Works

### Every Conversation Turn
1. ✅ **Capture** messages from agent
2. ✅ **Encrypt** with AES-256-GCM
3. ✅ **Upload** to IPFS (vault.x1.xyz)
4. ✅ **Get CID** (e.g., `QmRGWYBH1...`)
5. 📝 **Save locally** to state.json

### Daily Anchor (Once Per Day)
6. 🔍 **Check** if already anchored today
7. ⚓ **If new day:** Create anchor job
8. 📝 **Write** CID + SHA256 to Solana Memo
9. ⛓️ **Confirm** transaction on X1
10. 💾 **Update** `lastAnchoredDate`

---

## Anchor Frequency Options

### 1. Daily (Current - Default)
```bash
# In ~/.openclaw/.env (or leave unset for default)
AEGISMEMORY_ANCHOR_FREQUENCY=daily
```

**Behavior:**
- Anchors **once per calendar day** (UTC)
- First conversation of the day triggers anchor
- All subsequent conversations that day: IPFS only
- Next day: New anchor created

**Cost:** ~0.000005 SOL/day (~$0.0001/day)

**Timeline Example:**
```
2026-02-17 02:25:06 UTC - ⚓ Anchored (first conversation of day)
2026-02-17 19:50:57 UTC - 💾 IPFS only (same day)
2026-02-17 20:27:52 UTC - 💾 IPFS only (same day)
2026-02-18 00:01:00 UTC - ⚓ Anchored (new day)
```

### 2. Every Save
```bash
# In ~/.openclaw/.env
AEGISMEMORY_ANCHOR_FREQUENCY=every_save
```

**Behavior:**
- Anchors **every single conversation turn**
- Immediate on-chain proof for each interaction
- Maximum security and verifiability

**Cost:** ~0.000005 SOL per conversation (~$0.0001 per turn)

**Timeline Example:**
```
2026-02-17 19:50:57 UTC - ⚓ Anchored
2026-02-17 20:27:52 UTC - ⚓ Anchored
2026-02-17 20:35:10 UTC - ⚓ Anchored
```

---

## Recent On-Chain Activity

**Last 5 Anchors:**
```
2026-02-17 02:25:06 UTC - Slot: 30522778 - ✅ Finalized
2026-02-16 23:34:18 UTC - Slot: 30495964 - ✅ Finalized
2026-02-16 23:26:36 UTC - Slot: 30494757 - ✅ Finalized
2026-02-16 23:24:58 UTC - Slot: 30494502 - ✅ Finalized
2026-02-16 23:18:48 UTC - Slot: 30493532 - ✅ Finalized
```

**Pattern:** Multiple anchors on 2026-02-16 (testing phase), then daily anchor on 2026-02-17.

---

## Current Status

**Today (2026-02-17):**
- ⚓ **Anchored:** 02:25:06 UTC (18 hours ago)
- 💾 **IPFS Saves:** 2+ conversations (not anchored yet)
- 🔜 **Next Anchor:** Tomorrow (2026-02-18) on first conversation

**Latest CID:** `QmRGWYBH1LKwwKYq67DteK3FVfNan7cTd5vU997RGgBsrj`
- Created: 20:27:52 UTC
- Status: ✅ On IPFS, ⏸️ Pending anchor (tomorrow)

---

## What Gets Anchored

Each anchor transaction writes to Solana Memo Program:

```
CID: Qm... (IPFS content identifier)
SHA256: abc123... (plaintext hash for verification)
Date: 2026-02-17
Wallet: 9SksTs4MBiqpK3aBxDhzrVforfsR2u9hAaawdrFsNPjd
Agent: tg
```

This creates an **immutable timestamp proof** that:
1. The CID existed at this time
2. The content hash matches
3. The wallet signed the transaction

---

## Verification

### Check Latest Anchor
```bash
curl -s "https://rpc.mainnet.x1.xyz" -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"getSignaturesForAddress",
    "params":["9SksTs4MBiqpK3aBxDhzrVforfsR2u9hAaawdrFsNPjd",{"limit":1}]
  }' | jq -r '.result[0] | "\(.blockTime | strflocaltime("%Y-%m-%d %H:%M:%S")) - \(.signature)"'
```

### View Transaction Details
```bash
# Get signature from above, then:
curl -s "https://rpc.mainnet.x1.xyz" -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"getTransaction",
    "params":["<SIGNATURE>",{"encoding":"jsonParsed"}]
  }' | jq '.result.transaction.message.instructions[] | select(.programId=="MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr")'
```

### Check AegisMemory Status
```bash
cd /root/aegismemory && ./bin/aegismemory.js status
```

---

## Change Anchor Frequency

### Switch to Every Save (Immediate Anchoring)
```bash
echo "AEGISMEMORY_ANCHOR_FREQUENCY=every_save" >> ~/.openclaw/.env
pkill -f openclaw-gateway
openclaw gateway &
```

### Switch Back to Daily
```bash
# Remove or comment out the line in ~/.openclaw/.env
sed -i '/AEGISMEMORY_ANCHOR_FREQUENCY/d' ~/.openclaw/.env
pkill -f openclaw-gateway
openclaw gateway &
```

---

## Cost Analysis

### Daily Anchoring (Current)
- **Frequency:** 1 anchor per day
- **Cost:** ~0.000005 SOL/day
- **Monthly:** ~0.00015 SOL (~$0.003/month)
- **Yearly:** ~0.0018 SOL (~$0.036/year)

### Every Save Anchoring
- **Frequency:** 1 anchor per conversation
- **Cost:** ~0.000005 SOL per turn
- **Example:** 100 conversations/day = 0.0005 SOL/day (~$0.01/day)
- **Monthly:** ~0.015 SOL (~$0.30/month)

**Current Balance:** 0.976 SOL (~$19.52)
- Daily mode: ~2,666 days of anchoring
- Every-save mode (100/day): ~65 days

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Conversation Turn                     │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │  Capture Messages      │
              │  (OpenClaw hook)       │
              └────────────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │  Encrypt (AES-256-GCM) │
              │  Wallet-derived key    │
              └────────────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │  Upload to IPFS        │
              │  vault.x1.xyz API      │
              └────────────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │  Get CID               │
              │  QmRGWYBH1...          │
              └────────────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │  shouldAnchor()?       │
              │  Check frequency       │
              └────────────────────────┘
                           │
                ┌──────────┴──────────┐
                │                     │
                ▼                     ▼
         ┌──────────┐          ┌──────────┐
         │   YES    │          │    NO    │
         │ (daily)  │          │ (daily)  │
         └──────────┘          └──────────┘
                │                     │
                ▼                     ▼
    ┌────────────────────┐    ┌──────────────┐
    │ Enqueue ANCHOR job │    │ Done (IPFS)  │
    └────────────────────┘    └──────────────┘
                │
                ▼
    ┌────────────────────┐
    │ Write Memo to X1   │
    │ CID + SHA256       │
    └────────────────────┘
                │
                ▼
    ┌────────────────────┐
    │ Update state       │
    │ lastAnchoredDate   │
    └────────────────────┘
```

---

## Summary

✅ **On-Chain Anchoring: WORKING**

**Current Mode:** Daily (once per day)
- ⚓ Last anchor: 2026-02-17 02:25:06 UTC
- 💾 IPFS saves: Continuous (every conversation)
- 🔜 Next anchor: 2026-02-18 (first conversation)

**All conversations are saved to IPFS immediately.**  
**On-chain anchoring provides daily timestamp proof.**

To anchor every conversation, change frequency to `every_save`.
