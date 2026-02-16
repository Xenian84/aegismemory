import { Connection, Keypair, Transaction, TransactionInstruction, sendAndConfirmTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { retry, isRetryableError, withTimeout } from './util.js';

/**
 * X1/Solana RPC client with rate limiting and fallback support
 */
export class RpcClient {
  constructor(rpcUrls, logger, metrics) {
    // Support both single URL (string) or array of URLs
    if (typeof rpcUrls === 'string') {
      this.rpcUrls = [rpcUrls];
    } else if (Array.isArray(rpcUrls)) {
      this.rpcUrls = rpcUrls;
    } else {
      // Default X1 RPC endpoints (official)
      this.rpcUrls = [
        'https://rpc.mainnet.x1.xyz',
        'https://rpc.testnet.x1.xyz'
      ];
    }
    
    this.currentRpcIndex = 0;
    this.rpcUrl = this.rpcUrls[0];
    this.connection = new Connection(this.rpcUrl, 'confirmed');
    this.logger = logger;
    this.metrics = metrics;
    
    // Rate limiting
    this.lastRequestTime = 0;
    this.minRequestInterval = 100; // 100ms between requests
    
    this.logger.info('RPC client initialized', { 
      primaryRpc: this.rpcUrl, 
      fallbackCount: this.rpcUrls.length - 1 
    });
  }
  
  /**
   * Switch to next RPC endpoint
   */
  _switchToNextRpc() {
    this.currentRpcIndex = (this.currentRpcIndex + 1) % this.rpcUrls.length;
    this.rpcUrl = this.rpcUrls[this.currentRpcIndex];
    this.connection = new Connection(this.rpcUrl, 'confirmed');
    this.logger.warn('Switched to fallback RPC', { rpcUrl: this.rpcUrl, index: this.currentRpcIndex });
  }

  /**
   * Rate limit requests
   */
  async _rateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }

  /**
   * Get recent blockhash
   */
  async getRecentBlockhash(maxRetries = 3) {
    await this._rateLimit();
    
    let lastError;
    
    // Try all RPC endpoints
    for (let rpcAttempt = 0; rpcAttempt < this.rpcUrls.length; rpcAttempt++) {
      try {
        return await retry(
          async () => {
            const result = await this.connection.getLatestBlockhash();
            return result;
          },
          {
            maxRetries,
            shouldRetry: isRetryableError,
            onRetry: (error, attempt, backoffMs) => {
              this.logger.warn('Get blockhash retry', { 
                rpcUrl: this.rpcUrl,
                attempt, 
                backoffMs, 
                error: error.message 
              });
            }
          }
        );
      } catch (error) {
        lastError = error;
        this.logger.error('Get blockhash failed on RPC', { 
          rpcUrl: this.rpcUrl, 
          error: error.message 
        });
        
        // Try next RPC if available
        if (rpcAttempt < this.rpcUrls.length - 1) {
          this._switchToNextRpc();
        }
      }
    }
    
    throw lastError || new Error('All RPC endpoints failed');
  }

  /**
   * Send and confirm transaction
   */
  async sendAndConfirmTransaction(transaction, signers, commitment = 'confirmed', timeoutMs = 30000, maxRetries = 3) {
    await this._rateLimit();
    
    const startTime = Date.now();
    
    try {
      const signature = await retry(
        async () => {
          return await withTimeout(
            async () => {
              return await sendAndConfirmTransaction(
                this.connection,
                transaction,
                signers,
                { commitment }
              );
            },
            timeoutMs,
            new Error(`Transaction confirmation timeout after ${timeoutMs}ms`)
          );
        },
        {
          maxRetries,
          shouldRetry: (error) => {
            // Don't retry if transaction was already sent
            if (error.message?.includes('already been processed')) {
              return false;
            }
            return isRetryableError(error);
          },
          onRetry: (error, attempt, backoffMs) => {
            this.logger.warn('Send transaction retry', { attempt, backoffMs, error: error.message });
          }
        }
      );
      
      this.metrics.inc('rpc.transaction.success');
      this.metrics.recordTime('rpc.transaction.duration', Date.now() - startTime);
      
      return signature;
    } catch (error) {
      this.metrics.inc('rpc.transaction.error');
      this.logger.error('Transaction failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Get transaction details
   */
  async getTransaction(signature, maxRetries = 3) {
    await this._rateLimit();
    
    return await retry(
      async () => {
        const tx = await this.connection.getTransaction(signature, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0
        });
        return tx;
      },
      {
        maxRetries,
        shouldRetry: isRetryableError,
        onRetry: (error, attempt, backoffMs) => {
          this.logger.warn('Get transaction retry', { signature, attempt, backoffMs, error: error.message });
        }
      }
    );
  }

  /**
   * Create keypair from base58 secret key
   */
  keypairFromBase58(secretKeyBase58) {
    const secretKey = bs58.decode(secretKeyBase58);
    return Keypair.fromSecretKey(secretKey);
  }
}

/**
 * Memo program constants
 */
export const MEMO_PROGRAM_ID = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
