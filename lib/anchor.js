import { Transaction, TransactionInstruction, PublicKey } from '@solana/web3.js';
import { RpcClient, MEMO_PROGRAM_ID } from './rpc.js';
import { sha256 } from './cryptoBox.js';

/**
 * AegisAnchor module - on-chain anchoring
 */
export class AegisAnchor {
  constructor(config, logger, metrics, state) {
    this.config = config;
    this.logger = logger;
    this.metrics = metrics;
    this.state = state;
    
    // Build RPC URLs array with primary + fallbacks
    const rpcUrls = config.anchorRpcFallbackUrls || [config.anchorRpcUrl];
    
    this.rpcClient = new RpcClient(
      rpcUrls,
      logger,
      metrics
    );
  }

  /**
   * Check if anchor is needed
   */
  shouldAnchor(wallet, agentId, date) {
    if (!this.config.anchorEnabled) {
      return false;
    }
    
    if (this.config.anchorFrequency === 'every_save') {
      return true;
    }
    
    if (this.config.anchorFrequency === 'daily') {
      const lastAnchoredDate = this.state.getLastAnchoredDate(wallet, agentId);
      return lastAnchoredDate !== date;
    }
    
    return false;
  }

  /**
   * Build anchor payload
   */
  buildPayload(cid, plaintextSha256, prevPlaintextSha256, date) {
    // Format: "AegisMemory|v1|YYYY-MM-DD|CID|sha256|prevSha256"
    const parts = [
      'AegisMemory',
      'v1',
      date,
      cid,
      plaintextSha256,
      prevPlaintextSha256 || 'null'
    ];
    
    return parts.join('|');
  }

  /**
   * Submit anchor transaction
   */
  async anchor(cid, plaintextSha256, prevPlaintextSha256, date, wallet, agentId) {
    const startTime = Date.now();
    
    try {
      // Build payload
      const payload = this.buildPayload(cid, plaintextSha256, prevPlaintextSha256, date);
      
      this.logger.info('Submitting anchor', { cid, date, payloadLength: payload.length });
      
      // Get wallet keypair
      const walletSecretKey = this.config.anchorWalletSecretKeyBase58 || this.config.walletSecretKeyBase58;
      const keypair = this.rpcClient.keypairFromBase58(walletSecretKey);
      
      // Get recent blockhash
      const { blockhash } = await this.rpcClient.getRecentBlockhash();
      
      // Create memo instruction
      const memoInstruction = new TransactionInstruction({
        keys: [],
        programId: new PublicKey(MEMO_PROGRAM_ID),
        data: Buffer.from(payload, 'utf8')
      });
      
      // Build transaction
      const transaction = new Transaction({
        recentBlockhash: blockhash,
        feePayer: keypair.publicKey
      });
      
      transaction.add(memoInstruction);
      
      // Add priority fee if configured
      if (this.config.priorityFeeMicrolamports) {
        // Note: Priority fees require compute budget program
        // For simplicity, we'll skip this in the basic implementation
        this.logger.debug('Priority fees not implemented in this version');
      }
      
      // Send and confirm
      const signature = await this.rpcClient.sendAndConfirmTransaction(
        transaction,
        [keypair],
        this.config.confirmCommitment,
        this.config.anchorTimeoutMs
      );
      
      // Get transaction details
      const txDetails = await this.rpcClient.getTransaction(signature);
      
      const result = {
        signature,
        slot: txDetails?.slot || null,
        blockTime: txDetails?.blockTime || null
      };
      
      this.logger.info('Anchor submitted successfully', { 
        cid, 
        signature, 
        slot: result.slot 
      });
      
      this.metrics.inc('anchor.success');
      this.metrics.recordTime('anchor.duration', Date.now() - startTime);
      
      // Update state
      this.state.setLastAnchoredDate(wallet, agentId, date);
      
      return result;
    } catch (error) {
      this.metrics.inc('anchor.error');
      this.logger.error('Anchor failed', { cid, error: error.message });
      throw error;
    }
  }

  /**
   * Verify anchor on-chain
   */
  async verifyAnchor(signature, expectedPayload) {
    try {
      const tx = await this.rpcClient.getTransaction(signature);
      
      if (!tx) {
        return {
          valid: false,
          error: 'Transaction not found'
        };
      }
      
      // Extract memo from transaction
      const memoInstruction = tx.transaction.message.instructions.find(ix => {
        const programId = tx.transaction.message.accountKeys[ix.programIdIndex];
        return programId.toBase58() === MEMO_PROGRAM_ID;
      });
      
      if (!memoInstruction) {
        return {
          valid: false,
          error: 'No memo instruction found'
        };
      }
      
      const memoData = Buffer.from(memoInstruction.data).toString('utf8');
      
      if (expectedPayload && memoData !== expectedPayload) {
        return {
          valid: false,
          error: 'Payload mismatch',
          expected: expectedPayload,
          actual: memoData
        };
      }
      
      return {
        valid: true,
        signature,
        slot: tx.slot,
        blockTime: tx.blockTime,
        payload: memoData
      };
    } catch (error) {
      this.logger.error('Verify anchor failed', { signature, error: error.message });
      return {
        valid: false,
        error: error.message
      };
    }
  }
}
