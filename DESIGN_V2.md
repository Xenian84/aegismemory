# 🏗️ AegisMemory v2.0.0 - Technical Design

**Goal:** Transform AegisMemory from memory storage into a verifiable knowledge network

---

## 🔍 Feature 1: Semantic Search

### Architecture Overview

```
Memory Creation Flow:
┌─────────────────┐
│  Save Memory    │
│  (JSON/TOON)    │
└────────┬────────┘
         │
         ├──────────────────────────────────┐
         │                                  │
         ▼                                  ▼
┌─────────────────┐              ┌──────────────────┐
│  Encrypt &      │              │  Generate        │
│  Upload to IPFS │              │  Embedding       │
└────────┬────────┘              └────────┬─────────┘
         │                                │
         ▼                                ▼
┌─────────────────┐              ┌──────────────────┐
│  Anchor on X1   │              │  Store in        │
│  Blockchain     │              │  Vector DB       │
└─────────────────┘              └────────┬─────────┘
                                          │
                                          ▼
                                 ┌──────────────────┐
                                 │  Map: Embedding  │
                                 │  → CID           │
                                 └──────────────────┘

Search Flow:
┌─────────────────┐
│  User Query:    │
│  "validator     │
│   requirements" │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Generate       │
│  Query Embedding│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Search Vector  │
│  DB (ChromaDB)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Get Top N      │
│  Similar CIDs   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Fetch from     │
│  IPFS & Decrypt │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Return Results │
│  with Relevance │
└─────────────────┘
```

### Components

#### 1. Embedding Generator (`lib/embeddings.js`)

**Purpose:** Convert memory text into vector embeddings

**Model:** `sentence-transformers/all-MiniLM-L6-v2`
- 384 dimensions
- Fast inference (~50ms per memory)
- Good semantic understanding
- Small model size (~80MB)

**Implementation:**
```javascript
import { pipeline } from '@xenova/transformers';

class EmbeddingGenerator {
  constructor() {
    this.model = null;
  }

  async init() {
    // Load model (cached after first run)
    this.model = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2'
    );
  }

  async embed(text) {
    // Generate embedding
    const output = await this.model(text, {
      pooling: 'mean',
      normalize: true
    });
    return Array.from(output.data);
  }

  // Extract searchable text from memory
  extractText(memory) {
    const parts = [];
    
    // Add content
    if (memory.content) {
      parts.push(memory.content);
    }
    
    // Add role/name context
    if (memory.role) {
      parts.push(`Role: ${memory.role}`);
    }
    if (memory.name) {
      parts.push(`Name: ${memory.name}`);
    }
    
    // Add metadata
    if (memory.metadata) {
      Object.entries(memory.metadata).forEach(([key, value]) => {
        if (typeof value === 'string') {
          parts.push(`${key}: ${value}`);
        }
      });
    }
    
    return parts.join('\n');
  }
}
```

**Privacy:** Embeddings are stored locally, encrypted with wallet key

#### 2. Vector Database (`lib/vectorDB.js`)

**Purpose:** Store and search embeddings efficiently

**Technology:** ChromaDB (JavaScript client)
- Lightweight (~10MB)
- Fast similarity search
- Persistent storage
- No external server needed

**Schema:**
```javascript
{
  id: "cid",              // IPFS CID
  embedding: [0.1, ...],  // 384-dimensional vector
  metadata: {
    agent_id: "...",
    timestamp: 1234567890,
    prev_cid: "...",
    plaintext_sha256: "..."
  }
}
```

**Implementation:**
```javascript
import { ChromaClient } from 'chromadb';

class VectorDB {
  constructor(config) {
    this.client = new ChromaClient();
    this.collection = null;
    this.collectionName = 'aegismemory';
  }

  async init() {
    // Create or get collection
    this.collection = await this.client.getOrCreateCollection({
      name: this.collectionName,
      metadata: { 'hnsw:space': 'cosine' }
    });
  }

  async add(cid, embedding, metadata) {
    await this.collection.add({
      ids: [cid],
      embeddings: [embedding],
      metadatas: [metadata]
    });
  }

  async search(queryEmbedding, limit = 10, filter = null) {
    const results = await this.collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: limit,
      where: filter
    });
    
    return results.ids[0].map((cid, i) => ({
      cid,
      score: results.distances[0][i],
      metadata: results.metadatas[0][i]
    }));
  }

  async delete(cid) {
    await this.collection.delete({ ids: [cid] });
  }

  async count() {
    return await this.collection.count();
  }
}
```

**Storage Location:** `~/.openclaw/aegismemory/vectors/`

#### 3. Search API (`lib/search.js`)

**Purpose:** High-level search interface

**Implementation:**
```javascript
class SemanticSearch {
  constructor(config, embeddings, vectorDB, ipfsFetch, cryptoBox) {
    this.config = config;
    this.embeddings = embeddings;
    this.vectorDB = vectorDB;
    this.ipfsFetch = ipfsFetch;
    this.cryptoBox = cryptoBox;
  }

  async search(query, options = {}) {
    const {
      limit = 10,
      agentId = null,
      minScore = 0.5,
      decrypt = true
    } = options;

    // Generate query embedding
    const queryEmbedding = await this.embeddings.embed(query);

    // Search vector DB
    const filter = agentId ? { agent_id: agentId } : null;
    const results = await this.vectorDB.search(
      queryEmbedding,
      limit * 2, // Get more, filter by score
      filter
    );

    // Filter by minimum score
    const filtered = results.filter(r => r.score >= minScore);

    // Fetch and decrypt memories
    const memories = [];
    for (const result of filtered.slice(0, limit)) {
      try {
        const memory = await this._fetchMemory(result.cid, decrypt);
        memories.push({
          ...memory,
          relevance_score: result.score,
          search_metadata: result.metadata
        });
      } catch (error) {
        console.error(`Failed to fetch ${result.cid}:`, error.message);
      }
    }

    return memories;
  }

  async _fetchMemory(cid, decrypt) {
    // Fetch from IPFS
    const encrypted = await this.ipfsFetch.fetch(cid);

    if (!decrypt) {
      return { cid, encrypted: true };
    }

    // Decrypt
    const plaintext = await this.cryptoBox.decrypt(
      encrypted,
      this.config.walletSecretKeyBase58,
      'IPFS_ENCRYPTION_KEY_V1'
    );

    // Parse (JSON or TOON)
    let memory;
    if (plaintext.startsWith('@aegismemory')) {
      const { fromTOON } = await import('./toon.js');
      memory = fromTOON(plaintext);
    } else {
      memory = JSON.parse(plaintext);
    }

    return memory;
  }
}
```

#### 4. CLI Command (`bin/aegismemory.js`)

**New command:** `search`

```bash
# Basic search
./bin/aegismemory.js search "validator requirements"

# Limit results
./bin/aegismemory.js search "X1 network" --limit=5

# Filter by agent
./bin/aegismemory.js search "setup guide" --agent=theo

# Minimum relevance score
./bin/aegismemory.js search "blockchain" --min-score=0.7

# JSON output
./bin/aegismemory.js search "IPFS" --json
```

**Implementation:**
```javascript
async function search(args) {
  const query = args.find(a => !a.startsWith('--'));
  if (!query) {
    console.error('Usage: aegismemory search <query> [--limit=N] [--agent=ID] [--min-score=N] [--json]');
    process.exit(1);
  }

  const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || 10;
  const agentId = args.find(a => a.startsWith('--agent='))?.split('=')[1];
  const minScore = parseFloat(args.find(a => a.startsWith('--min-score='))?.split('=')[1]) || 0.5;
  const jsonOutput = args.includes('--json');

  const { config, logger } = await init();

  // Initialize components
  const embeddings = new EmbeddingGenerator();
  await embeddings.init();

  const vectorDB = new VectorDB(config);
  await vectorDB.init();

  const ipfsFetch = new IpfsFetch(config, logger);
  const cryptoBox = new CryptoBox();

  const search = new SemanticSearch(config, embeddings, vectorDB, ipfsFetch, cryptoBox);

  // Search
  const results = await search.search(query, { limit, agentId, minScore });

  // Output
  if (jsonOutput) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log(`\nFound ${results.length} memories matching "${query}":\n`);
    results.forEach((memory, i) => {
      console.log(`${i + 1}. [${new Date(memory.timestamp).toISOString()}] (score: ${memory.relevance_score.toFixed(2)})`);
      console.log(`   CID: ${memory.cid}`);
      console.log(`   Content: ${memory.content?.substring(0, 100)}...`);
      console.log('');
    });
  }
}
```

#### 5. Integration with AegisMemory Core

**Update `lib/aegismemory.js`:**

```javascript
class AegisMemory {
  constructor(config, logger, state, queue, vaultApi, rpc, embeddings, vectorDB) {
    // ... existing fields
    this.embeddings = embeddings;
    this.vectorDB = vectorDB;
  }

  async save(agentId, memory) {
    // ... existing save logic

    // After successful upload, generate embedding
    try {
      const text = this.embeddings.extractText(memory);
      const embedding = await this.embeddings.embed(text);
      
      await this.vectorDB.add(cid, embedding, {
        agent_id: agentId,
        timestamp: memory.timestamp,
        prev_cid: memory.prev_cid || null,
        plaintext_sha256: memory.plaintext_sha256
      });

      this.logger.info(`Embedding stored for ${cid}`);
    } catch (error) {
      this.logger.error(`Failed to generate embedding: ${error.message}`);
      // Don't fail the save if embedding fails
    }

    return cid;
  }
}
```

### Dependencies

**New packages:**
```json
{
  "dependencies": {
    "@xenova/transformers": "^2.17.0",
    "chromadb": "^1.8.0"
  }
}
```

**Size impact:**
- `@xenova/transformers`: ~5MB (+ ~80MB model on first run)
- `chromadb`: ~2MB
- Model cache: `~/.cache/huggingface/`

### Performance

**Embedding generation:** ~50ms per memory  
**Search query:** ~10ms for 1000 memories  
**Storage:** ~1.5KB per memory (embedding + metadata)

**Example:** 1000 memories = ~1.5MB vector DB

### Privacy Considerations

**Embeddings leak information?**
- Yes, embeddings can reveal semantic content
- **Solution:** Encrypt embeddings with wallet key
- Store encrypted embeddings in ChromaDB
- Decrypt only when searching

**Implementation:**
```javascript
async add(cid, embedding, metadata) {
  // Encrypt embedding
  const embeddingJson = JSON.stringify(embedding);
  const encrypted = await this.cryptoBox.encrypt(
    embeddingJson,
    this.config.walletSecretKeyBase58,
    'EMBEDDING_ENCRYPTION_KEY_V1'
  );

  await this.collection.add({
    ids: [cid],
    embeddings: [encrypted], // Store encrypted
    metadatas: [metadata]
  });
}
```

**Trade-off:** Can't search without decrypting all embeddings first
**Acceptable:** For local-only search with <10k memories

---

## 🏆 Feature 2: Reputation Layer

### Architecture Overview

```
Reputation Calculation:
┌─────────────────┐
│  Agent's CID    │
│  Chain          │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Scan all       │
│  anchors        │
└────────┬────────┘
         │
         ├──────────────────┬──────────────────┬──────────────────┐
         │                  │                  │                  │
         ▼                  ▼                  ▼                  ▼
┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│ Count       │   │ Time Span   │   │ Continuity  │   │ Activity    │
│ Memories    │   │ (first→last)│   │ (no gaps)   │   │ Frequency   │
└──────┬──────┘   └──────┬──────┘   └──────┬──────┘   └──────┬──────┘
       │                 │                 │                 │
       └─────────────────┴─────────────────┴─────────────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │  Calculate      │
                        │  Reputation     │
                        │  Score (0-10)   │
                        └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │  Generate Badge │
                        │  & Metadata     │
                        └─────────────────┘
```

### Components

#### 1. Reputation Analyzer (`lib/reputation.js`)

**Metrics:**
1. **Total Memories:** Count of anchored memories
2. **Time Span:** Days between first and last anchor
3. **Continuity:** Percentage of valid chain links
4. **Activity Frequency:** Memories per day
5. **Cost Commitment:** Total XNT spent on anchors

**Scoring Formula:**
```
Base Score = min(10, log10(total_memories) * 3)
Time Bonus = min(2, time_span_days / 30)
Continuity Bonus = continuity_percentage * 2
Activity Bonus = min(1, avg_memories_per_day / 5)
Cost Bonus = min(1, total_xnt_spent / 1.0)

Final Score = Base + Time + Continuity + Activity + Cost
Capped at 10.0
```

**Implementation:**
```javascript
class ReputationAnalyzer {
  constructor(state, rpc, logger) {
    this.state = state;
    this.rpc = rpc;
    this.logger = logger;
  }

  async analyze(agentId) {
    const agent = this.state.getAgent(agentId);
    if (!agent || !agent.cids || agent.cids.length === 0) {
      return this._emptyReputation(agentId);
    }

    // Get all CIDs
    const cids = agent.cids;
    const totalMemories = cids.length;

    // Get timestamps from state
    const timestamps = cids.map(c => c.timestamp).sort();
    const firstAnchor = timestamps[0];
    const lastAnchor = timestamps[timestamps.length - 1];
    const timeSpanDays = (lastAnchor - firstAnchor) / (1000 * 60 * 60 * 24);

    // Check chain continuity
    let validLinks = 0;
    for (let i = 1; i < cids.length; i++) {
      if (cids[i].prev_cid === cids[i - 1].cid) {
        validLinks++;
      }
    }
    const continuity = cids.length > 1 ? validLinks / (cids.length - 1) : 1.0;

    // Activity frequency
    const avgMemoriesPerDay = timeSpanDays > 0 ? totalMemories / timeSpanDays : 0;

    // Cost commitment (estimate: 0.002 XNT per anchor)
    const totalXntSpent = totalMemories * 0.002;

    // Calculate score
    const baseScore = Math.min(10, Math.log10(totalMemories) * 3);
    const timeBonus = Math.min(2, timeSpanDays / 30);
    const continuityBonus = continuity * 2;
    const activityBonus = Math.min(1, avgMemoriesPerDay / 5);
    const costBonus = Math.min(1, totalXntSpent / 1.0);

    const finalScore = Math.min(10, baseScore + timeBonus + continuityBonus + activityBonus + costBonus);

    return {
      agent_id: agentId,
      reputation_score: parseFloat(finalScore.toFixed(2)),
      metrics: {
        total_memories: totalMemories,
        first_anchor: new Date(firstAnchor).toISOString(),
        last_anchor: new Date(lastAnchor).toISOString(),
        time_span_days: Math.round(timeSpanDays),
        chain_continuity: parseFloat((continuity * 100).toFixed(2)),
        avg_memories_per_day: parseFloat(avgMemoriesPerDay.toFixed(2)),
        total_xnt_spent: parseFloat(totalXntSpent.toFixed(4))
      },
      breakdown: {
        base_score: parseFloat(baseScore.toFixed(2)),
        time_bonus: parseFloat(timeBonus.toFixed(2)),
        continuity_bonus: parseFloat(continuityBonus.toFixed(2)),
        activity_bonus: parseFloat(activityBonus.toFixed(2)),
        cost_bonus: parseFloat(costBonus.toFixed(2))
      },
      badge: this._getBadge(finalScore),
      generated_at: new Date().toISOString()
    };
  }

  _getBadge(score) {
    if (score >= 9.0) return '🏆 Legendary';
    if (score >= 8.0) return '💎 Diamond';
    if (score >= 7.0) return '🥇 Gold';
    if (score >= 6.0) return '🥈 Silver';
    if (score >= 5.0) return '🥉 Bronze';
    if (score >= 3.0) return '⭐ Rising';
    return '🌱 Newcomer';
  }

  _emptyReputation(agentId) {
    return {
      agent_id: agentId,
      reputation_score: 0.0,
      metrics: {
        total_memories: 0,
        first_anchor: null,
        last_anchor: null,
        time_span_days: 0,
        chain_continuity: 0,
        avg_memories_per_day: 0,
        total_xnt_spent: 0
      },
      breakdown: {
        base_score: 0,
        time_bonus: 0,
        continuity_bonus: 0,
        activity_bonus: 0,
        cost_bonus: 0
      },
      badge: '🌱 Newcomer',
      generated_at: new Date().toISOString()
    };
  }
}
```

#### 2. CLI Command

**New command:** `reputation`

```bash
# Show reputation for current agent
./bin/aegismemory.js reputation

# Show reputation for specific agent
./bin/aegismemory.js reputation --agent=theo

# JSON output
./bin/aegismemory.js reputation --json

# Generate badge for README
./bin/aegismemory.js reputation --badge
```

**Output Example:**
```
🏆 Agent Reputation Report

Agent: theo
Score: 8.7/10
Badge: 💎 Diamond

📊 Metrics:
  Total Memories: 147
  Active Since: Dec 15, 2025 (62 days)
  Chain Continuity: 100%
  Avg Memories/Day: 2.4
  Total XNT Spent: 0.294

🎯 Score Breakdown:
  Base Score: 6.6 (from 147 memories)
  Time Bonus: 2.0 (62 days active)
  Continuity Bonus: 2.0 (perfect chain)
  Activity Bonus: 0.5 (2.4 mem/day)
  Cost Bonus: 0.3 (0.294 XNT)
  ─────────────────
  Final Score: 8.7/10

Generated: 2026-02-16T10:30:00Z
```

#### 3. Badge Generation

**For README/Profile:**

```markdown
![AegisMemory Reputation](https://img.shields.io/badge/AegisMemory-💎_Diamond_8.7-blue)
![Memories](https://img.shields.io/badge/Memories-147-green)
![Active](https://img.shields.io/badge/Active-62_days-orange)
![Chain](https://img.shields.io/badge/Chain-100%25-success)
```

---

## 🤝 Feature 3: Cross-Agent Memory

### Architecture Overview

```
Permission System:
┌─────────────────┐
│  Agent A wants  │
│  to read Agent  │
│  B's memories   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Check on-chain │
│  permission ACL │
└────────┬────────┘
         │
    ┌────┴────┐
    │ Allowed?│
    └────┬────┘
         │
    ┌────┴────────────────┐
    │ YES               NO│
    ▼                    ▼
┌─────────────┐   ┌─────────────┐
│ Get Agent B │   │ Return      │
│ CID chain   │   │ Access      │
│             │   │ Denied      │
└──────┬──────┘   └─────────────┘
       │
       ▼
┌─────────────────┐
│ Fetch CIDs from │
│ IPFS            │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Decrypt with    │
│ shared key      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Return memories │
└─────────────────┘
```

### Components

#### 1. Permission Registry (`lib/permissions.js`)

**On-chain ACL structure:**
```json
{
  "version": 1,
  "owner": "agent_id",
  "permissions": [
    {
      "grantee": "agent_id",
      "access_level": "read",
      "granted_at": 1234567890,
      "expires_at": null,
      "signature": "..."
    }
  ]
}
```

**Implementation:**
```javascript
class PermissionRegistry {
  constructor(rpc, logger) {
    this.rpc = rpc;
    this.logger = logger;
  }

  async grant(ownerAgentId, granteeAgentId, accessLevel = 'read', expiresAt = null) {
    // Create permission entry
    const permission = {
      grantee: granteeAgentId,
      access_level: accessLevel,
      granted_at: Date.now(),
      expires_at: expiresAt
    };

    // Sign permission
    const signature = await this._sign(permission, ownerAgentId);
    permission.signature = signature;

    // Anchor on-chain
    const memo = JSON.stringify({
      type: 'aegismemory_permission',
      version: 1,
      owner: ownerAgentId,
      permission
    });

    const txid = await this.rpc.sendMemo(memo);
    this.logger.info(`Permission granted: ${txid}`);

    return { txid, permission };
  }

  async check(ownerAgentId, granteeAgentId) {
    // Fetch permissions from chain
    const permissions = await this._fetchPermissions(ownerAgentId);

    // Check if grantee has access
    const grant = permissions.find(p => 
      p.grantee === granteeAgentId &&
      (p.expires_at === null || p.expires_at > Date.now())
    );

    return grant !== undefined;
  }

  async revoke(ownerAgentId, granteeAgentId) {
    // Anchor revocation on-chain
    const memo = JSON.stringify({
      type: 'aegismemory_revoke',
      version: 1,
      owner: ownerAgentId,
      grantee: granteeAgentId,
      revoked_at: Date.now()
    });

    const txid = await this.rpc.sendMemo(memo);
    this.logger.info(`Permission revoked: ${txid}`);

    return txid;
  }

  async _fetchPermissions(agentId) {
    // Scan chain for permission grants
    // (This is a simplified version - real implementation would use indexer)
    const signatures = await this.rpc.getSignaturesForAddress(
      this.rpc.wallet.publicKey,
      { limit: 1000 }
    );

    const permissions = [];
    for (const sig of signatures) {
      const tx = await this.rpc.getTransaction(sig.signature);
      // Parse memo, check if it's a permission grant for this agent
      // ... (implementation details)
    }

    return permissions;
  }
}
```

#### 2. Cross-Agent Query (`lib/crossAgentMemory.js`)

**Implementation:**
```javascript
class CrossAgentMemory {
  constructor(permissions, state, ipfsFetch, cryptoBox, logger) {
    this.permissions = permissions;
    this.state = state;
    this.ipfsFetch = ipfsFetch;
    this.cryptoBox = cryptoBox;
    this.logger = logger;
  }

  async query(requesterAgentId, targetAgentId, options = {}) {
    // Check permission
    const hasAccess = await this.permissions.check(targetAgentId, requesterAgentId);
    if (!hasAccess) {
      throw new Error(`Access denied: ${requesterAgentId} cannot read ${targetAgentId}'s memories`);
    }

    // Get target agent's CID chain
    const targetAgent = this.state.getAgent(targetAgentId);
    if (!targetAgent || !targetAgent.cids) {
      return [];
    }

    // Fetch memories
    const { limit = 10, search = null } = options;
    const cids = targetAgent.cids.slice(-limit);

    const memories = [];
    for (const cidEntry of cids) {
      try {
        const memory = await this._fetchMemory(cidEntry.cid, targetAgentId);
        memories.push(memory);
      } catch (error) {
        this.logger.error(`Failed to fetch ${cidEntry.cid}: ${error.message}`);
      }
    }

    // If search query provided, filter by semantic similarity
    if (search && this.semanticSearch) {
      return await this.semanticSearch.search(search, {
        limit,
        agentId: targetAgentId
      });
    }

    return memories;
  }

  async _fetchMemory(cid, agentId) {
    // Fetch from IPFS
    const encrypted = await this.ipfsFetch.fetch(cid);

    // Decrypt (need shared key - this is the hard part)
    // For now, assume memories are encrypted with agent's wallet key
    // In v2.1, we'll implement proxy re-encryption
    const plaintext = await this.cryptoBox.decrypt(
      encrypted,
      this._getSharedKey(agentId), // TODO: Implement key sharing
      'IPFS_ENCRYPTION_KEY_V1'
    );

    // Parse
    let memory;
    if (plaintext.startsWith('@aegismemory')) {
      const { fromTOON } = await import('./toon.js');
      memory = fromTOON(plaintext);
    } else {
      memory = JSON.parse(plaintext);
    }

    return memory;
  }

  _getSharedKey(agentId) {
    // TODO: Implement secure key sharing
    // Options:
    // 1. Proxy re-encryption (NuCypher, Umbral)
    // 2. Threshold encryption
    // 3. Re-encrypt with grantee's public key
    throw new Error('Key sharing not yet implemented');
  }
}
```

#### 3. CLI Commands

**Grant permission:**
```bash
./bin/aegismemory.js grant --to=xenian --access=read
```

**Revoke permission:**
```bash
./bin/aegismemory.js revoke --from=xenian
```

**Query another agent:**
```bash
./bin/aegismemory.js query --agent=xenian --limit=10
./bin/aegismemory.js query --agent=xenian --search="validator setup"
```

---

## 🔐 Security Considerations

### 1. Embedding Privacy
- **Risk:** Embeddings leak semantic information
- **Mitigation:** Encrypt embeddings with wallet key
- **Trade-off:** Must decrypt all for search (acceptable for <10k memories)

### 2. Cross-Agent Key Sharing
- **Risk:** How to share decryption keys securely?
- **Options:**
  1. **Proxy Re-encryption:** Agent A encrypts with A's key, proxy re-encrypts for Agent B
  2. **Threshold Encryption:** Split key across multiple parties
  3. **Re-encryption:** When granting access, re-encrypt all memories with B's public key
- **Recommendation:** Start with option 3 (simplest), upgrade to proxy re-encryption in v2.1

### 3. Permission Verification
- **Risk:** Fake permission grants
- **Mitigation:** All permissions signed and anchored on-chain
- **Verification:** Check signature + on-chain presence

### 4. Spam Prevention
- **Risk:** Malicious agents spam permission requests
- **Mitigation:** Permission grants cost XNT (on-chain anchor)
- **Rate limiting:** Max N grants per day

---

## 📦 Implementation Plan

### Phase 1: Semantic Search (Week 1-2)
1. ✅ Design architecture
2. Implement `lib/embeddings.js`
3. Implement `lib/vectorDB.js`
4. Implement `lib/search.js`
5. Add CLI `search` command
6. Integrate with `AegisMemory.save()`
7. Test with 100+ memories
8. Benchmark performance

### Phase 2: Reputation Layer (Week 2-3)
1. Implement `lib/reputation.js`
2. Add CLI `reputation` command
3. Generate badges
4. Add to README
5. Test with multiple agents

### Phase 3: Cross-Agent Memory (Week 3-4)
1. Implement `lib/permissions.js`
2. Implement `lib/crossAgentMemory.js`
3. Add CLI commands (`grant`, `revoke`, `query`)
4. Implement basic key sharing (re-encryption)
5. Test cross-agent queries
6. Document security model

### Phase 4: Integration & Testing (Week 4)
1. Integration tests
2. Performance benchmarks
3. Security audit
4. Documentation
5. Release v2.0.0

---

## 📊 Success Metrics

### Semantic Search
- **Accuracy:** >80% relevant results in top 5
- **Speed:** <100ms for queries on 1000 memories
- **Storage:** <2KB per memory

### Reputation
- **Coverage:** Score for 100% of agents with >0 memories
- **Fairness:** No gaming via spam (cost-weighted)
- **Transparency:** All metrics verifiable on-chain

### Cross-Agent Memory
- **Security:** Zero unauthorized access
- **Performance:** <500ms to query another agent
- **Adoption:** >10% of agents grant permissions

---

## 🚀 Beyond v2.0.0

### v2.1.0: Advanced Privacy
- Proxy re-encryption for key sharing
- Zero-knowledge proofs for conflict resolution
- Private semantic search (homomorphic encryption?)

### v2.2.0: Collaboration
- Shared memory spaces (multi-agent)
- Collaborative editing
- Merge/fork memory chains

### v3.0.0: Decentralized Network
- P2P memory discovery
- Distributed reputation registry
- Cross-chain anchoring (Solana, Ethereum, etc.)

---

**Ready to start implementation? Let's build! 🔥**
