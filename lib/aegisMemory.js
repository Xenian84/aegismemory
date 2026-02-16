import { VaultApi } from './vaultApi.js';
import { IpfsFetcher } from './ipfsFetch.js';
import { createEncryptedPayload, decryptPayload, sha256 } from './cryptoBox.js';
import { canonicalStringify, parallelLimit } from './util.js';
import { captureMemory } from './capture.js';
import { formatMemories } from './format.js';
import { AegisAnchor } from './anchor.js';
import { toTOON, fromTOON, calculateSavings } from './toon.js';

/**
 * AegisMemory core orchestration
 */
export class AegisMemory {
  constructor(config, logger, metrics, state, queue) {
    this.config = config;
    this.logger = logger;
    this.metrics = metrics;
    this.state = state;
    this.queue = queue;
    
    this.vaultApi = new VaultApi(config.baseUrl, logger, metrics);
    this.ipfsFetcher = new IpfsFetcher(config.ipfsGatewayUrls, logger, metrics);
    
    if (config.anchorEnabled) {
      this.anchor = new AegisAnchor(config, logger, metrics, state);
    }
  }

  /**
   * Recall memories (for before_agent_start)
   */
  async recall(ctx) {
    if (!this.config.recallEnabled) {
      this.logger.debug('Recall disabled');
      return null;
    }
    
    const startTime = Date.now();
    const wallet = this.config.walletPubkey;
    const agentId = ctx.agentId || this.config.agentId;
    
    try {
      this.logger.info('Recalling memories', { wallet, agentId, limit: this.config.memoryLimitNumber });
      
      // Get list of memory files
      const files = await this.vaultApi.listFiles(wallet);
      
      // Filter by prefix and sort by date (newest first)
      const memoryFiles = files
        .filter(f => f.filename?.startsWith(this.config.memoryPrefix))
        .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
        .slice(0, this.config.memoryLimitNumber);
      
      if (memoryFiles.length === 0) {
        this.logger.info('No memories found');
        return null;
      }
      
      // Fetch and decrypt in parallel
      const memories = await parallelLimit(
        memoryFiles,
        this.config.fetchConcurrency,
        async (file) => {
          try {
            const encryptedJson = await this.ipfsFetcher.fetch(file.cid);
            const encryptedPayload = JSON.parse(encryptedJson);
            const plaintext = await decryptPayload(
              encryptedPayload,
              this.config.walletSecretKeyBase58,
              this.config.cacheKeyTtlMs
            );
            
            // Parse based on format
            let doc;
            if (this.config.memoryFormat === 'toon') {
              doc = fromTOON(plaintext);
            } else {
              doc = JSON.parse(plaintext);
            }
            
            doc.cid = file.cid; // Add CID for reference
            return doc;
          } catch (error) {
            this.logger.error('Failed to fetch/decrypt memory', { 
              cid: file.cid, 
              error: error.message 
            });
            this.metrics.inc('recall.decrypt_error');
            return null;
          }
        }
      );
      
      // Filter out nulls
      const validMemories = memories.filter(m => m !== null);
      
      if (validMemories.length === 0) {
        this.logger.warn('No valid memories after decryption');
        return null;
      }
      
      // Format for context
      const formattedContext = formatMemories(validMemories, this.config.maxPrependChars);
      
      this.metrics.inc('recall.success');
      this.metrics.recordTime('recall.duration', Date.now() - startTime);
      
      this.logger.info('Recall complete', { 
        memoriesFound: validMemories.length,
        contextLength: formattedContext.length 
      });
      
      return {
        prependContext: formattedContext,
        memories: validMemories
      };
    } catch (error) {
      this.metrics.inc('recall.error');
      this.logger.error('Recall failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Save memory (for agent_end)
   */
  async save(ctx) {
    if (!this.config.addEnabled) {
      this.logger.debug('Add disabled');
      return;
    }
    
    const wallet = this.config.walletPubkey;
    const agentId = ctx.agentId || this.config.agentId;
    const date = new Date().toISOString().split('T')[0];
    
    try {
      this.logger.info('Saving memory', { wallet, agentId, date });
      
      // Capture memory content
      const content = captureMemory(ctx, this.config.captureStrategy, this.config.maxMessageChars);
      
      // Get previous CID and sha256
      const prevCid = this.state.getLastCid(wallet, agentId);
      const prevSha256 = this.state.getAgent(wallet, agentId).lastPlaintextSha256;
      
      // Build memory document
      const doc = {
        schema: 'aegismemory.v1',
        agent_id: agentId,
        wallet: wallet,
        timestamp: new Date().toISOString(),
        date: date,
        session_id: ctx.sessionId || null,
        prev_cid: prevCid,
        prev_plaintext_sha256: prevSha256,
        plaintext_sha256: null, // Will be computed
        content: content,
        anchor: {
          enabled: this.config.anchorEnabled,
          program: this.config.anchorProgram,
          signature: null,
          slot: null,
          blockTime: null
        }
      };
      
      // Compute plaintext_sha256
      // Always use canonical JSON for hash (consistent regardless of storage format)
      const canonical = canonicalStringify(doc);
      doc.plaintext_sha256 = sha256(canonical);
      
      // Log size savings if using TOON
      if (this.config.memoryFormat === 'toon') {
        const savings = calculateSavings(doc);
        this.logger.debug('TOON format savings', savings);
      }
      
      // Enqueue upload job
      const jobKey = `${wallet}:${agentId}:${date}:${doc.plaintext_sha256}`;
      
      this.queue.enqueue('UPLOAD_MEMORY', {
        key: jobKey,
        doc,
        wallet,
        agentId,
        date
      }, { key: jobKey, maxRetries: this.config.maxRetries });
      
      this.logger.info('Memory save job enqueued', { jobKey });
      
      this.metrics.inc('save.enqueued');
    } catch (error) {
      this.metrics.inc('save.error');
      this.logger.error('Save failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Process upload job
   */
  async processUploadJob(job) {
    const { doc, wallet, agentId, date } = job.payload;
    
    try {
      // Serialize based on format
      let plaintext;
      if (this.config.memoryFormat === 'toon') {
        plaintext = toTOON(doc);
        this.logger.debug('Using TOON format for storage');
      } else {
        plaintext = canonicalStringify(doc);
      }
      
      // Create encrypted payload
      const encryptedPayload = await createEncryptedPayload(
        plaintext,
        wallet,
        this.config.walletSecretKeyBase58,
        this.config.derivationMsg,
        this.config.cacheKeyTtlMs
      );
      
      // Upload to Vault
      const filename = `${this.config.memoryPrefix}${date}.json`;
      const result = await this.vaultApi.add(
        encryptedPayload,
        filename,
        wallet,
        canonicalStringify(doc),
        this.config.maxRetries
      );
      
      const cid = result.cid;
      
      // Update state
      this.state.setLastCid(wallet, agentId, cid, doc.plaintext_sha256);
      
      this.logger.info('Memory uploaded', { cid, wallet, agentId, date });
      
      // Check if anchor is needed
      if (this.anchor && this.anchor.shouldAnchor(wallet, agentId, date)) {
        this.logger.info('Enqueueing anchor job', { cid, date });
        
        this.queue.enqueue('ANCHOR_MEMORY', {
          cid,
          plaintextSha256: doc.plaintext_sha256,
          prevPlaintextSha256: doc.prev_plaintext_sha256,
          date,
          wallet,
          agentId
        }, { maxRetries: this.config.maxRetries });
      }
      
      return { success: true, cid };
    } catch (error) {
      this.logger.error('Upload job failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Process anchor job
   */
  async processAnchorJob(job) {
    const { cid, plaintextSha256, prevPlaintextSha256, date, wallet, agentId } = job.payload;
    
    try {
      const result = await this.anchor.anchor(
        cid,
        plaintextSha256,
        prevPlaintextSha256,
        date,
        wallet,
        agentId
      );
      
      this.logger.info('Anchor job complete', { cid, signature: result.signature });
      
      return { success: true, ...result };
    } catch (error) {
      this.logger.error('Anchor job failed', { cid, error: error.message });
      throw error;
    }
  }
}
