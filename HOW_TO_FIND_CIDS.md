# How to Locate and Access Your CIDs

## ✅ Current Status: WORKING!

**Latest CID**: `QmRGWYBH1LKwwKYq67DteK3FVfNan7cTd5vU997RGgBsrj`  
**Created**: 2026-02-17 20:27:52 UTC  
**Messages**: 2 (user + assistant)  
**Status**: ✅ Encrypted and stored on IPFS

---

## 🔍 Method 1: Check Status (Quickest)

```bash
cd /root/aegismemory && ./bin/aegismemory.js status
```

**Output shows:**
```
State:
  tg:
    Last CID: QmRGWYBH1LKwwKYq67DteK3FVfNan7cTd5vU997RGgBsrj  ← YOUR LATEST CID
    Last SHA256: 334c7f20e2e26bf1...
    Last Anchored: 2026-02-17
```

---

## 📖 Method 2: Read Latest Memory

```bash
cd /root/aegismemory && ./bin/aegismemory.js recall
```

**Shows:**
- Latest 10 memories
- Decrypted content
- User and assistant messages
- Timestamps

---

## 🔗 Method 3: Access via IPFS Gateway

### Your CID is accessible at multiple gateways:

**Primary (X1 Vault):**
```
https://vault.x1.xyz/ipfs/QmRGWYBH1LKwwKYq67DteK3FVfNan7cTd5vU997RGgBsrj
```

**Public IPFS Gateways:**
```
https://ipfs.io/ipfs/QmRGWYBH1LKwwKYq67DteK3FVfNan7cTd5vU997RGgBsrj
https://cloudflare-ipfs.com/ipfs/QmRGWYBH1LKwwKYq67DteK3FVfNan7cTd5vU997RGgBsrj
https://dweb.link/ipfs/QmRGWYBH1LKwwKYq67DteK3FVfNan7cTd5vU997RGgBsrj
```

⚠️ **Note**: Content is **encrypted** - you'll see JSON with encrypted data, not plaintext.

---

## 🔐 Method 4: View Decrypted Content

```bash
cd /root/aegismemory && ./bin/aegismemory.js recall --cid QmRGWYBH1LKwwKYq67DteK3FVfNan7cTd5vU997RGgBsrj
```

**Shows decrypted:**
- Schema version
- Timestamp
- Session ID
- All messages (user + assistant)
- Keywords

---

## 📂 Method 5: Check Local State File

```bash
cat ~/.openclaw/aegismemory/state.json | jq
```

**Contains:**
```json
{
  "agents": {
    "9SksTs4MBiqpK3aBxDhzrVforfsR2u9hAaawdrFsNPjd:tg": {
      "lastCid": "QmRGWYBH1LKwwKYq67DteK3FVfNan7cTd5vU997RGgBsrj",
      "lastPlaintextSha256": "334c7f20e2e26bf1...",
      "lastAnchoredDate": "2026-02-17",
      "branches": { ... }
    }
  }
}
```

---

## ⛓️ Method 6: Check On-Chain (Anchored CIDs Only)

```bash
curl -s "https://rpc.mainnet.x1.xyz" -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"getSignaturesForAddress",
    "params":["9SksTs4MBiqpK3aBxDhzrVforfsR2u9hAaawdrFsNPjd",{"limit":5}]
  }' | jq -r '.result[] | "\(.blockTime | strftime("%Y-%m-%d %H:%M:%S")) - \(.signature)"'
```

**Shows recent transactions** with CIDs anchored to X1 blockchain.

---

## 🔄 Method 7: List All CIDs for Agent

```bash
cat ~/.openclaw/aegismemory/state.json | jq -r '.agents."9SksTs4MBiqpK3aBxDhzrVforfsR2u9hAaawdrFsNPjd:tg"'
```

---

## 🧪 Method 8: Test IPFS Availability

```bash
# Check if CID exists on IPFS
curl -s "https://vault.x1.xyz/ipfs/api/v0/cat?arg=QmRGWYBH1LKwwKYq67DteK3FVfNan7cTd5vU997RGgBsrj" -X POST | head -c 200

# Check file size
curl -s "https://vault.x1.xyz/ipfs/api/v0/cat?arg=QmRGWYBH1LKwwKYq67DteK3FVfNan7cTd5vU997RGgBsrj" -X POST | wc -c
```

---

## 📊 Method 9: Watch Live Updates

```bash
# Terminal 1: Watch state file
watch -n 2 'cat ~/.openclaw/aegismemory/state.json | jq -r ".agents.\"9SksTs4MBiqpK3aBxDhzrVforfsR2u9hAaawdrFsNPjd:tg\".lastCid"'

# Terminal 2: Watch gateway logs
tail -f /tmp/openclaw-gateway.log | grep -E "🔥|Memory saved|CID"
```

---

## 🎯 Quick Reference

| What | Command |
|------|---------|
| **Latest CID** | `./bin/aegismemory.js status \| grep "Last CID"` |
| **Read latest** | `./bin/aegismemory.js recall` |
| **Read specific CID** | `./bin/aegismemory.js recall --cid <CID>` |
| **View raw encrypted** | `curl -s "https://vault.x1.xyz/ipfs/api/v0/cat?arg=<CID>" -X POST` |
| **Check on-chain** | See Method 6 above |
| **List all agents** | `cat ~/.openclaw/aegismemory/state.json \| jq '.agents \| keys'` |

---

## 🔍 Troubleshooting

### "No CID found"
```bash
# Check if gateway is running
ps aux | grep openclaw-gateway

# Check queue status
./bin/aegismemory.js status | grep -A2 "Queue:"

# Check gateway logs
tail -50 /tmp/openclaw-gateway.log | grep -E "🔥|aegis|error"
```

### "CID not on IPFS"
```bash
# Try different gateway
curl -s "https://ipfs.io/ipfs/<CID>" -X POST

# Check if upload succeeded
./bin/aegismemory.js status | grep "Total Jobs"
```

### "Can't decrypt"
```bash
# Verify wallet matches
cat ~/.openclaw/aegismemory/state.json | jq -r '.agents | keys[]'

# Check encryption key derivation
echo $AEGISMEMORY_WALLET_SECRET_KEY | wc -c  # Should be 88 chars
```

---

## ✅ Verification Checklist

- [x] Gateway running: `ps aux | grep openclaw-gateway`
- [x] Latest CID exists: `./bin/aegismemory.js status`
- [x] CID on IPFS: `curl https://vault.x1.xyz/ipfs/<CID>`
- [x] Can decrypt: `./bin/aegismemory.js recall`
- [x] Auto-capture working: Send test message, check for new CID
- [x] Queue processing: `./bin/aegismemory.js status` shows 0 pending

---

## 🎉 Current Status

**Everything is working!**

✅ Auto-capture: Every conversation turn  
✅ IPFS upload: Immediate  
✅ Encryption: AES-256-GCM  
✅ CID chain: Intact  
✅ On-chain anchor: Daily (last: 2026-02-17 02:25 UTC)

**Latest proof:**
- CID: `QmRGWYBH1LKwwKYq67DteK3FVfNan7cTd5vU997RGgBsrj`
- Time: 20:27:52 UTC
- Messages: 2 captured
- IPFS: ✅ Available
- Encrypted: ✅ Yes

Send another message to your Telegram bot and run `./bin/aegismemory.js status` to see a new CID appear!
