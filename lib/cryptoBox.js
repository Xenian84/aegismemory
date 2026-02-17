import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { sha512 } from '@noble/hashes/sha2.js';
import * as ed25519 from '@noble/ed25519';

// Initialize ed25519 with SHA-512
ed25519.etc.sha512Sync = (...m) => sha512(ed25519.etc.concatBytes(...m));

/**
 * AES-256-GCM encryption/decryption with key derivation
 */

// Key cache: { wallet: { derivationMsg: { key, expiresAt } } }
const keyCache = new Map();

/**
 * Derive AES key from wallet signature
 */
export async function deriveKey(walletSecretKeyBase58, derivationMsg, cacheTtlMs = 600000) {
  // Check cache
  const cacheKey = `${walletSecretKeyBase58.slice(0, 10)}:${derivationMsg}`;
  const cached = keyCache.get(cacheKey);
  
  if (cached && cached.expiresAt > Date.now()) {
    return cached.key;
  }
  
  // Derive key
  const secretKey = bs58.decode(walletSecretKeyBase58);
  const keypair = Keypair.fromSecretKey(secretKey);
  
  // Sign the derivation message
  const messageBytes = Buffer.from(derivationMsg, 'utf8');
  const signature = await signMessage(keypair, messageBytes);
  
  // Hash signature to get 32-byte AES key
  const key = createHash('sha256').update(signature).digest();
  
  // Cache
  keyCache.set(cacheKey, {
    key,
    expiresAt: Date.now() + cacheTtlMs
  });
  
  return key;
}

/**
 * Sign message with keypair (ed25519)
 */
async function signMessage(keypair, message) {
  // Use ed25519 signing (already initialized above)
  return await ed25519.sign(message, keypair.secretKey.slice(0, 32));
}

/**
 * Encrypt plaintext with AES-256-GCM
 */
export function encrypt(plaintext, key) {
  const iv = randomBytes(12); // 12 bytes for GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  
  let ciphertext = cipher.update(plaintext, 'utf8');
  ciphertext = Buffer.concat([ciphertext, cipher.final()]);
  
  const authTag = cipher.getAuthTag(); // 16 bytes
  
  // Concatenate: IV (12) + ciphertext + authTag (16)
  const combined = Buffer.concat([iv, ciphertext, authTag]);
  
  return combined.toString('base64');
}

/**
 * Decrypt ciphertext with AES-256-GCM
 */
export function decrypt(encryptedBase64, key) {
  const combined = Buffer.from(encryptedBase64, 'base64');
  
  // Extract components
  const iv = combined.slice(0, 12);
  const authTag = combined.slice(-16);
  const ciphertext = combined.slice(12, -16);
  
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  
  let plaintext = decipher.update(ciphertext);
  plaintext = Buffer.concat([plaintext, decipher.final()]);
  
  return plaintext.toString('utf8');
}

/**
 * Create encrypted payload for X1 Vault
 */
export async function createEncryptedPayload(plaintext, walletPubkey, walletSecretKeyBase58, derivationMsg, cacheTtlMs) {
  const key = await deriveKey(walletSecretKeyBase58, derivationMsg, cacheTtlMs);
  const encryptedData = encrypt(plaintext, key);
  
  return {
    version: 1,
    algorithm: 'AES-256-GCM',
    wallet: walletPubkey,
    derivationMsg: derivationMsg,
    data: encryptedData
  };
}

/**
 * Decrypt payload from X1 Vault
 */
export async function decryptPayload(payload, walletSecretKeyBase58, cacheTtlMs) {
  if (payload.version !== 1) {
    throw new Error(`Unsupported payload version: ${payload.version}`);
  }
  
  if (payload.algorithm !== 'AES-256-GCM') {
    throw new Error(`Unsupported algorithm: ${payload.algorithm}`);
  }
  
  const key = await deriveKey(walletSecretKeyBase58, payload.derivationMsg, cacheTtlMs);
  return decrypt(payload.data, key);
}

/**
 * Compute SHA256 hash
 */
export function sha256(data) {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

/**
 * Compute MD5 hash (for X-Content-MD5 header)
 */
export function md5(data) {
  return createHash('md5').update(data, 'utf8').digest('hex');
}

/**
 * CryptoBox class wrapper for convenience
 */
export class CryptoBox {
  constructor(walletPubkey, walletSecretKeyBase58, derivationMsg = 'IPFS_ENCRYPTION_KEY_V1', cacheTtlMs = 600000) {
    this.walletPubkey = walletPubkey;
    this.walletSecretKeyBase58 = walletSecretKeyBase58;
    this.derivationMsg = derivationMsg;
    this.cacheTtlMs = cacheTtlMs;
  }
  
  async encrypt(plaintext) {
    const payload = await createEncryptedPayload(
      plaintext,
      this.walletPubkey,
      this.walletSecretKeyBase58,
      this.derivationMsg,
      this.cacheTtlMs
    );
    return payload;
  }
  
  async decrypt(payload) {
    return await decryptPayload(payload, this.walletSecretKeyBase58, this.cacheTtlMs);
  }
}
