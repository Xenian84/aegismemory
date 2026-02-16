import { createReadStream, writeFileSync, unlinkSync } from 'fs';
import { md5 } from './cryptoBox.js';
import { retry, isRetryableError } from './util.js';

/**
 * X1 Vault API client
 */
export class VaultApi {
  constructor(baseUrl, logger, metrics) {
    this.baseUrl = baseUrl;
    this.logger = logger;
    this.metrics = metrics;
  }

  /**
   * Upload encrypted file to Vault
   */
  async add(encryptedPayload, filename, walletPubkey, plaintextForMd5, maxRetries = 3) {
    const startTime = Date.now();
    
    try {
      const result = await retry(
        async () => {
          return await this._uploadMultipart(encryptedPayload, filename, walletPubkey, plaintextForMd5);
        },
        {
          maxRetries,
          shouldRetry: isRetryableError,
          onRetry: (error, attempt, backoffMs) => {
            this.logger.warn('Vault upload retry', { 
              attempt, 
              backoffMs, 
              error: error.message 
            });
          }
        }
      );
      
      this.metrics.inc('vault.upload.success');
      this.metrics.recordTime('vault.upload.duration', Date.now() - startTime);
      
      return result;
    } catch (error) {
      this.metrics.inc('vault.upload.error');
      this.logger.error('Vault upload failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Upload multipart form
   */
  async _uploadMultipart(encryptedPayload, filename, walletPubkey, plaintextForMd5) {
    const payloadJson = JSON.stringify(encryptedPayload);
    const contentMd5 = md5(plaintextForMd5);
    
    // Create form data
    const boundary = `----AegisMemory${Date.now()}`;
    const formData = this._buildMultipartForm(payloadJson, boundary);
    
    const url = `${this.baseUrl}/api/v0/add?pin=true`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'X-Pubkey': walletPubkey,
        'X-Filename': filename,
        'X-Content-MD5': contentMd5
      },
      body: formData
    });
    
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Vault upload failed: ${response.status} ${text}`);
    }
    
    const result = await response.json();
    
    if (!result.Hash && !result.cid) {
      throw new Error('Vault response missing CID');
    }
    
    const cid = result.Hash || result.cid;
    
    this.logger.info('Vault upload success', { cid, filename });
    
    return { cid, ...result };
  }

  /**
   * Build multipart form data
   */
  _buildMultipartForm(content, boundary) {
    const parts = [];
    
    parts.push(`--${boundary}\r\n`);
    parts.push(`Content-Disposition: form-data; name="file"; filename="encrypted.json"\r\n`);
    parts.push(`Content-Type: application/json\r\n\r\n`);
    parts.push(content);
    parts.push(`\r\n--${boundary}--\r\n`);
    
    return parts.join('');
  }

  /**
   * List files for wallet
   */
  async listFiles(walletPubkey) {
    try {
      const url = `${this.baseUrl}/index/files?pubkey=${walletPubkey}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`List files failed: ${response.status}`);
      }
      
      const result = await response.json();
      return result.files || result || [];
    } catch (error) {
      this.logger.error('List files failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(cid) {
    try {
      const url = `${this.baseUrl}/index/file/${cid}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Get metadata failed: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      this.logger.error('Get metadata failed', { cid, error: error.message });
      throw error;
    }
  }
}
