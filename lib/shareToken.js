/**
 * @fileoverview Share token generation and parsing
 * Format: aegis://CID/WALLET/ENCRYPTED_KEY
 */

import { createEncryptedPayload, decryptPayload } from './cryptoBox.js';

/**
 * Generate a share token for a memory CID
 * @param {string} cid - IPFS CID to share
 * @param {string} walletPubkey - Sharing agent's wallet
 * @param {string} walletSecretKeyBase58 - Sharing agent's secret key
 * @param {string} recipientWallet - Recipient's wallet address
 * @returns {Promise<string>} Share token
 */
export async function generateShareToken(cid, walletPubkey, walletSecretKeyBase58, recipientWallet) {
  // Encrypt the wallet secret for the recipient
  // In a real system, you'd use the recipient's public key
  // For now, we'll encrypt with our own key (recipient needs to know the derivation)
  const encryptedKey = await createEncryptedPayload(
    walletSecretKeyBase58,
    walletPubkey,
    walletSecretKeyBase58,
    'SHARE_TOKEN_V1'
  );

  // Encode the encrypted key as base64
  const keyB64 = Buffer.from(JSON.stringify(encryptedKey)).toString('base64url');

  // Build token: aegis://CID/WALLET/KEY
  const token = `aegis://${cid}/${walletPubkey}/${keyB64}`;

  return token;
}

/**
 * Parse a share token
 * @param {string} token - Share token to parse
 * @returns {Object} Parsed token {cid, wallet, encryptedKey}
 */
export function parseShareToken(token) {
  if (!token.startsWith('aegis://')) {
    throw new Error('Invalid share token format');
  }

  const parts = token.replace('aegis://', '').split('/');
  if (parts.length !== 3) {
    throw new Error('Invalid share token structure');
  }

  const [cid, wallet, keyB64] = parts;

  // Decode the encrypted key
  const encryptedKey = JSON.parse(Buffer.from(keyB64, 'base64url').toString());

  return {
    cid,
    wallet,
    encryptedKey
  };
}

/**
 * Decrypt a share token's key
 * @param {string} token - Share token
 * @param {string} walletSecretKeyBase58 - Recipient's wallet secret
 * @returns {Promise<string>} Decrypted wallet secret
 */
export async function decryptShareToken(token, walletSecretKeyBase58) {
  const { encryptedKey } = parseShareToken(token);
  
  // Decrypt the shared key
  const sharedKey = await decryptPayload(encryptedKey, walletSecretKeyBase58);
  
  return sharedKey;
}

/**
 * Generate a simpler share token (CID + wallet only, requires pre-granted permission)
 * @param {string} cid - IPFS CID to share
 * @param {string} walletPubkey - Sharing agent's wallet
 * @returns {string} Simple share token
 */
export function generateSimpleShareToken(cid, walletPubkey) {
  return `aegis://${cid}/${walletPubkey}`;
}

/**
 * Parse a simple share token
 * @param {string} token - Simple share token
 * @returns {Object} {cid, wallet}
 */
export function parseSimpleShareToken(token) {
  if (!token.startsWith('aegis://')) {
    throw new Error('Invalid share token format');
  }

  const parts = token.replace('aegis://', '').split('/');
  if (parts.length < 2) {
    throw new Error('Invalid share token structure');
  }

  const [cid, wallet] = parts;

  return { cid, wallet };
}
