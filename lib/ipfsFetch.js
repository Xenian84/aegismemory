import { retry, isRetryableError } from './util.js';
import { sha256 } from './cryptoBox.js';

/**
 * IPFS gateway fetching with retries and fallback
 */
export class IpfsFetcher {
  constructor(gatewayUrls, logger, metrics) {
    this.gatewayUrls = gatewayUrls;
    this.logger = logger;
    this.metrics = metrics;
  }

  /**
   * Fetch CID from IPFS with gateway fallback
   */
  async fetch(cid, maxRetries = 3) {
    const startTime = Date.now();
    
    let lastError;
    
    for (let index = 0; index < this.gatewayUrls.length; index++) {
      const gatewayUrl = this.gatewayUrls[index];
      try {
        const result = await retry(
          async () => {
            return await this._fetchFromGateway(cid, gatewayUrl);
          },
          {
            maxRetries,
            shouldRetry: isRetryableError,
            onRetry: (error, attempt, backoffMs) => {
              this.logger.warn('IPFS fetch retry', { 
                cid, 
                gateway: gatewayUrl, 
                attempt, 
                backoffMs, 
                error: error.message 
              });
            }
          }
        );
        
        this.metrics.inc('ipfs.fetch.success', 1, { gateway: index });
        this.metrics.recordTime('ipfs.fetch.duration', Date.now() - startTime);
        
        return result;
      } catch (error) {
        lastError = error;
        this.metrics.inc('ipfs.fetch.error', 1, { gateway: index });
        this.logger.warn('IPFS fetch failed on gateway', { 
          cid, 
          gateway: gatewayUrl, 
          error: error.message 
        });
        
        // Try next gateway
        continue;
      }
    }
    
    // All gateways failed
    this.logger.error('IPFS fetch failed on all gateways', { cid });
    throw lastError || new Error('All IPFS gateways failed');
  }

  /**
   * Fetch from specific gateway
   */
  async _fetchFromGateway(cid, gatewayUrl) {
    // X1 Vault endpoint: https://vault.x1.xyz/ipfs/api/v0/cat?arg=<CID>
    // gatewayUrl is: "https://vault.x1.xyz/ipfs"
    const url = `${gatewayUrl}/api/v0/cat?arg=${cid}`;
    
    this.logger.debug('Fetching from IPFS', { cid, url });
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`IPFS fetch failed: ${response.status} ${response.statusText}`);
    }
    
    const text = await response.text();
    
    // Return raw text (caller will parse if needed)
    return text;
  }

  /**
   * Fetch and verify checksum
   */
  async fetchWithChecksum(cid, expectedSha256, maxRetries = 3) {
    const content = await this.fetch(cid, maxRetries);
    
    if (expectedSha256) {
      const actualSha256 = sha256(content);
      if (actualSha256 !== expectedSha256) {
        this.metrics.inc('ipfs.checksum.mismatch');
        throw new Error(`Checksum mismatch for CID ${cid}: expected ${expectedSha256}, got ${actualSha256}`);
      }
    }
    
    return content;
  }
}
