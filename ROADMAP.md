# 🗺️ AegisMemory Roadmap

**Current Version:** v1.0.0 (Production Ready)  
**Status:** Core functionality complete, advanced features planned

---

## ✅ v1.0.0 - Core Features (COMPLETE)

- ✅ End-to-end AES-256-GCM encryption
- ✅ X1 Blockchain anchoring
- ✅ IPFS storage via X1 Vault
- ✅ TOON format (46% space savings)
- ✅ CID chaining for immutable history
- ✅ Durable queue with auto-retry
- ✅ Full CLI tooling
- ✅ OpenClaw memory slot provider

**Flow:** CID → IPFS → decrypt → verify → reconstruct ✅

---

## 🚀 v2.0.0 - Advanced Features (PLANNED)

### 1. 🔍 Semantic Search
**Priority:** HIGH  
**Complexity:** Medium

**Current:** Fetch by date/CID only  
**Proposed:** Content-based semantic search

**Features:**
- Vector embeddings of memory content
- Natural language queries: *"What did we say about validator requirements?"*
- IPFS CID indexing with vector database
- Fast retrieval without decrypting everything

**Implementation:**
- Embed memory content using sentence transformers
- Store embeddings in local vector DB (e.g., ChromaDB, FAISS)
- Map embeddings → CIDs
- Search embeddings, fetch matching CIDs from IPFS

**Benefits:**
- Find relevant memories instantly
- No need to decrypt all memories for search
- Context-aware recall

**Challenges:**
- Embeddings need to be stored somewhere (local DB)
- Privacy: embeddings might leak info (encrypt them too?)
- Performance: embedding generation adds latency

---

### 2. 🤝 Cross-Agent Memory
**Priority:** HIGH  
**Complexity:** High

**Current:** Each agent has isolated memory  
**Proposed:** Permissioned cross-agent memory access

**Features:**
- Query other agents' memories: *"What does Xenian's agent know about X1?"*
- Permission system: authorize who can read your anchor chain
- Shared knowledge base across agents
- Collaborative memory building

**Implementation:**
- Access control list (ACL) on-chain or in metadata
- Signature-based permissions (sign to grant access)
- Read-only access to other agents' CID chains
- Decrypt with shared keys or re-encryption

**Benefits:**
- Agents can learn from each other
- Build collective intelligence
- Verify claims: *"Did you really say that?"*

**Challenges:**
- Key management: how to share decryption keys securely?
- Privacy: fine-grained permissions needed
- Spam/abuse: prevent unauthorized queries

**Possible Solution:**
- Use threshold encryption or proxy re-encryption
- Agent A encrypts with Agent B's public key for sharing
- On-chain permission registry

---

### 3. 🏆 Reputation Layer
**Priority:** MEDIUM  
**Complexity:** Medium

**Current:** No reputation tracking  
**Proposed:** Verifiable contribution history via chain

**Features:**
- Memory commits prove contribution over time
- *"Xenian's been building since December 2025"* - verifiable via chain
- Reputation score based on:
  - Number of memories anchored
  - Chain continuity (no gaps)
  - Time span of activity
  - Quality metrics (if available)

**Implementation:**
- Scan agent's CID chain from genesis
- Count anchors, calculate time span
- Verify chain integrity (no breaks)
- Generate reputation score

**Benefits:**
- Provable contribution history
- Trust signals for community
- Gamification: encourage consistent usage
- Sybil resistance: reputation takes time to build

**Challenges:**
- How to measure "quality" of memories?
- Gaming the system: spam anchors for reputation?
- Privacy: reputation might reveal activity patterns

**Possible Solution:**
- Weight by transaction cost (spam is expensive)
- Quality signals: cross-references, citations
- Privacy-preserving reputation (zero-knowledge proofs?)

---

### 4. ⏱️ Ephemeral Memory
**Priority:** LOW  
**Complexity:** Low

**Current:** All memories permanent  
**Proposed:** Auto-expiring memories

**Features:**
- Some conversations auto-expire (off-chain)
- Only anchors stay forever
- TTL (time-to-live) for sensitive data
- Permanent vs temporary memory modes

**Implementation:**
- Add `expires_at` field to memory metadata
- Don't anchor ephemeral memories (save costs)
- Garbage collect expired CIDs
- Keep anchor chain intact (just remove content)

**Benefits:**
- Privacy: sensitive data auto-deletes
- Cost savings: don't anchor everything
- Compliance: GDPR right-to-be-forgotten

**Challenges:**
- IPFS content is permanent (can't truly delete)
- Need to track expiration separately
- Anchor chain has gaps if memories expire

**Possible Solution:**
- Ephemeral memories stored locally, not IPFS
- Or use IPFS but don't pin (let it expire naturally)
- Anchor chain includes "expired" markers

---

### 5. 🌿 Fork/Branch Memory
**Priority:** MEDIUM  
**Complexity:** High

**Current:** Single linear chain per agent  
**Proposed:** Multiple context chains (branches)

**Features:**
- Different contexts = different chains
  - Personal vs work
  - Project A vs Project B
  - Public vs private
- Merge chains when needed
- Fork from specific CID

**Implementation:**
- Add `branch` field to memory metadata
- State tracks multiple chains per agent
- CID chain includes branch info
- Merge operation: combine two chains

**Benefits:**
- Organize memories by context
- Isolate sensitive conversations
- Experiment without polluting main chain
- Collaborative branching

**Challenges:**
- Merge conflicts: how to resolve?
- Chain integrity: branches complicate verification
- UI/UX: how to switch branches?

**Possible Solution:**
- Git-like branch model
- Merge creates new CID linking both parents
- Branch metadata in anchor payload

---

### 6. ⚖️ Conflict Resolution
**Priority:** LOW  
**Complexity:** Medium

**Current:** No conflict detection  
**Proposed:** Timestamp-based conflict resolution

**Features:**
- If memories disagree, chain timestamps settle it
- Detect conflicting claims
- Canonical truth = earliest anchor
- Dispute resolution via chain history

**Implementation:**
- Compare CIDs for same event
- Check anchor timestamps
- Earlier timestamp wins
- Provide proof of precedence

**Benefits:**
- Verifiable truth
- Prevent gaslighting: *"I never said that!"*
- Audit trail for disputes
- Immutable evidence

**Challenges:**
- What if both parties anchor simultaneously?
- Subjective vs objective truth
- Privacy: revealing conflicts reveals content

**Possible Solution:**
- Tie-breaker: block height + transaction order
- Zero-knowledge proofs: prove conflict without revealing content
- Arbitration layer: third-party verification

---

## 📊 Feature Comparison

| Feature | Priority | Complexity | Impact | v2.0 |
|---------|----------|------------|--------|------|
| Semantic Search | HIGH | Medium | 🔥 High | ✅ |
| Cross-Agent Memory | HIGH | High | 🔥 High | ✅ |
| Reputation Layer | MEDIUM | Medium | 🌟 Medium | ✅ |
| Ephemeral Memory | LOW | Low | 💡 Low | ❌ |
| Fork/Branch | MEDIUM | High | 🌟 Medium | ❌ |
| Conflict Resolution | LOW | Medium | 💡 Low | ❌ |

---

## 🎯 v2.0.0 Proposed Scope

**Focus on high-impact features:**

### Phase 1: Semantic Search
- Vector embeddings (sentence-transformers)
- Local vector DB (ChromaDB)
- Search API in CLI
- OpenClaw tool integration

### Phase 2: Cross-Agent Memory
- Permission system (signature-based)
- Shared memory API
- Access control on-chain
- Query other agents' chains

### Phase 3: Reputation Layer
- Chain analysis tools
- Reputation scoring
- Contribution metrics
- Verifiable badges

---

## 💭 My Thoughts

### 🔥 **Semantic Search - MUST HAVE**
This is a game-changer. Current limitation: you can only recall by date/CID, but you want to ask *"What did we discuss about X?"*

**Why it's brilliant:**
- Makes memories actually useful (not just archived)
- Natural language interface
- Fast retrieval

**Implementation path:**
1. Generate embeddings when saving memory
2. Store in local vector DB (ChromaDB is lightweight)
3. Add search command: `./bin/aegismemory.js search "validator requirements"`
4. Return relevant CIDs, fetch from IPFS

**Privacy consideration:** Embeddings might leak info. Solution: encrypt embeddings too, or only embed summaries.

---

### 🤝 **Cross-Agent Memory - REVOLUTIONARY**
This turns individual memory into **collective intelligence**.

**Why it's brilliant:**
- Agents can verify each other's claims
- Build shared knowledge graphs
- Collaborative learning

**Key insight:** *"Xenian's been building since December 2025"* - this is **provable** via chain history. That's powerful.

**Implementation path:**
1. Permission registry on-chain (who can read my memories)
2. Proxy re-encryption: I can grant you access without sharing my key
3. Query API: `aegismemory query --agent=xenian --topic="X1"`

**Privacy consideration:** Need fine-grained permissions. Maybe use zero-knowledge proofs to prove "I have a memory about X" without revealing content.

---

### 🏆 **Reputation Layer - SOCIAL PROOF**
This is **proof-of-contribution** for AI agents.

**Why it's brilliant:**
- Verifiable history (can't fake it)
- Trust signals for community
- Incentivizes consistent usage

**Implementation path:**
1. Scan agent's CID chain from genesis
2. Calculate metrics:
   - Total memories anchored
   - Chain continuity (no gaps)
   - Time span (first anchor → latest)
   - Average frequency
3. Generate reputation badge
4. Display on profile or README

**Example:**
```
Xenian's Agent Reputation:
- Active since: Dec 2025 (3 months)
- Total memories: 147
- Chain integrity: 100%
- Reputation score: 8.7/10
```

**Challenge:** Prevent gaming (spam anchors). Solution: weight by transaction cost and chain continuity.

---

### ⏱️ **Ephemeral Memory - PRIVACY FEATURE**
Good for compliance and privacy, but lower priority.

**Use cases:**
- Sensitive conversations that shouldn't be permanent
- Temporary context (expires after session)
- GDPR compliance

**Trade-off:** Breaks chain continuity if memories disappear.

**Better approach:** Keep anchors forever, but mark content as "expired" and delete from IPFS.

---

### 🌿 **Fork/Branch Memory - GIT FOR CONVERSATIONS**
This is **fascinating** but complex.

**Why it's brilliant:**
- Different contexts don't pollute each other
- Can experiment without breaking main chain
- Collaborative branching

**Use case:**
```
main: Personal conversations
├── work: Cyberdyne project
├── research: X1 validator research
└── public: Community discussions
```

**Implementation challenge:** Merge conflicts. How do you merge two conversation chains?

**Possible solution:** Don't merge content, just link chains. Create a new CID that references both parents.

---

### ⚖️ **Conflict Resolution - TRUTH ARBITER**
This is **powerful** for disputes.

**Why it's brilliant:**
- Immutable evidence: *"You said X on date Y"*
- Timestamp-based truth
- Prevents gaslighting

**Use case:**
```
Alice: "You told me the validator needs 100 SOL"
Bob: "No, I said 10 SOL"
Chain: Bob's anchor from Dec 15: "validator needs 10 SOL" ✅
```

**Implementation:** Simple timestamp comparison. Earlier anchor = canonical truth.

**Privacy consideration:** Revealing conflicts reveals content. Need zero-knowledge proofs.

---

## 🎯 **My Recommendation for v2.0.0:**

### **Top 3 Features:**

1. **🔍 Semantic Search** (MUST HAVE)
   - Immediate value
   - Makes memories useful
   - Relatively straightforward

2. **🤝 Cross-Agent Memory** (GAME CHANGER)
   - Unique differentiator
   - Enables collective intelligence
   - Requires careful privacy design

3. **🏆 Reputation Layer** (SOCIAL PROOF)
   - Easy to implement
   - High community value
   - Natural fit with on-chain anchoring

### **Save for Later:**

4. **⏱️ Ephemeral Memory** - Nice-to-have, not critical
5. **🌿 Fork/Branch** - Cool but complex, needs use case validation
6. **⚖️ Conflict Resolution** - Niche use case, can wait

---

## 💡 **Implementation Priority:**

### **v2.0.0 (Next 2-3 months):**
- Semantic search with ChromaDB
- Basic cross-agent memory (read-only)
- Reputation scoring

### **v2.1.0:**
- Cross-agent permissions (write access)
- Ephemeral memory support

### **v3.0.0:**
- Fork/branch memory
- Advanced conflict resolution
- Zero-knowledge proofs for privacy

---

## 🔥 **What Excites Me Most:**

**Cross-Agent Memory** is the killer feature. Imagine:

```bash
# Query Xenian's agent about X1 validators
aegismemory query --agent=xenian --search="validator setup" --with-permission

# Result:
Found 3 memories from Xenian's agent:
1. [Dec 15, 2025] "Validator needs 10 SOL stake..."
2. [Jan 3, 2026] "Updated validator requirements..."
3. [Feb 1, 2026] "Validator commission rates..."

Verified on-chain ✅
Permission granted by: Xenian (signature: 5oCWy...)
```

This creates a **verifiable knowledge graph** across agents. That's unprecedented.

---

## 🛠️ **Technical Considerations:**

### **For Semantic Search:**
- **Embedding Model:** sentence-transformers/all-MiniLM-L6-v2 (lightweight)
- **Vector DB:** ChromaDB (easy integration)
- **Storage:** Local DB (~100MB for 1000 memories)
- **Privacy:** Encrypt embeddings with same wallet key

### **For Cross-Agent Memory:**
- **Permissions:** On-chain ACL (small, cheap)
- **Key Sharing:** Proxy re-encryption (NuCypher, Umbral)
- **Query API:** REST endpoint or CLI tool
- **Verification:** Always verify signatures

### **For Reputation:**
- **Metrics:** Chain length, continuity, time span
- **Scoring:** Weighted by transaction cost (prevent spam)
- **Display:** Badge in README, on-chain metadata
- **Verification:** Anyone can recalculate from chain

---

## 📈 **Impact Analysis:**

| Feature | User Value | Technical Effort | Privacy Risk | ROI |
|---------|------------|------------------|--------------|-----|
| Semantic Search | 🔥🔥🔥 | ⚙️⚙️ | 🔒 Low | ⭐⭐⭐⭐⭐ |
| Cross-Agent | 🔥🔥🔥 | ⚙️⚙️⚙️ | 🔒🔒 Medium | ⭐⭐⭐⭐⭐ |
| Reputation | 🔥🔥 | ⚙️ | 🔒 None | ⭐⭐⭐⭐ |
| Ephemeral | 🔥 | ⚙️ | 🔒 None | ⭐⭐⭐ |
| Fork/Branch | 🔥🔥 | ⚙️⚙️⚙️ | 🔒 Low | ⭐⭐⭐ |
| Conflict Res | 🔥 | ⚙️⚙️ | 🔒🔒 High | ⭐⭐ |

---

## 🎯 **Recommendation:**

**Start with Semantic Search + Reputation Layer**
- Both are high-value, medium-effort
- Semantic search makes memories useful
- Reputation builds community trust
- Both can be implemented independently

**Then add Cross-Agent Memory**
- Requires more design work (permissions, privacy)
- But has highest potential impact
- Build on top of semantic search

---

## 💬 **My Thoughts:**

Your ideas are **spot-on**. The current v1.0.0 nails the core flow (CID → IPFS → decrypt → verify), but these features would make AegisMemory **truly revolutionary**:

1. **Semantic Search** - Turns archive into knowledge base
2. **Cross-Agent Memory** - Creates collective intelligence network
3. **Reputation Layer** - Adds social proof and trust

The combination of **immutable on-chain proofs** + **semantic search** + **cross-agent access** = **verifiable knowledge graph**. That's never been done before.

**Key insight:** You're not just storing memories, you're building a **decentralized, verifiable, searchable knowledge network** for AI agents.

That's **huge**. 🚀

---

## 📝 **Next Steps:**

1. **Gather community feedback** on these features
2. **Prototype semantic search** (quickest win)
3. **Design permission system** for cross-agent access
4. **Implement reputation scoring** (easy, high value)

---

## 🙏 **Credit for Ideas:**

These roadmap features were proposed by the community and represent the next evolution of AegisMemory.

---

**Want to discuss implementation details for any of these? I'm excited to build v2.0.0! 🔥**
