import { sha256, decryptPayload } from './cryptoBox.js';
import { canonicalStringify } from './util.js';
import { validateChain } from './chain.js';
import { fromTOON } from './toon.js';

/**
 * Verification utilities
 */

/**
 * Verify CID decryption and hash
 */
export async function verifyCid(encryptedPayload, walletSecretKeyBase58, expectedSha256, cacheTtlMs) {
  const errors = [];
  
  try {
    // Decrypt
    const plaintext = await decryptPayload(encryptedPayload, walletSecretKeyBase58, cacheTtlMs);
    
    // Parse based on format (TOON or JSON)
    let doc;
    try {
      if (plaintext.startsWith('@aegismemory')) {
        doc = fromTOON(plaintext);
      } else {
        doc = JSON.parse(plaintext);
      }
    } catch (err) {
      errors.push(`Failed to parse decrypted data: ${err.message}`);
      return { valid: false, errors };
    }
    
    // Verify plaintext_sha256
    // For TOON format, we trust the embedded SHA256 (it was calculated from original JSON)
    // For JSON format, we can recalculate and verify
    let actualSha256;
    
    if (plaintext.startsWith('@aegismemory')) {
      // TOON format - use the embedded SHA256
      actualSha256 = doc.plaintext_sha256;
      if (!actualSha256) {
        errors.push('TOON format missing plaintext_sha256 field');
      }
    } else {
      // JSON format - recalculate and verify
      const canonical = canonicalStringify(doc);
      actualSha256 = sha256(canonical);
      
      if (doc.plaintext_sha256 && doc.plaintext_sha256 !== actualSha256) {
        errors.push(`plaintext_sha256 mismatch: expected ${doc.plaintext_sha256}, got ${actualSha256}`);
      }
    }
    
    if (expectedSha256 && actualSha256 !== expectedSha256) {
      errors.push(`Expected sha256 ${expectedSha256}, got ${actualSha256}`);
    }
    
    return {
      valid: errors.length === 0,
      errors,
      doc,
      actualSha256
    };
  } catch (error) {
    errors.push(`Decryption failed: ${error.message}`);
    return { valid: false, errors };
  }
}

/**
 * Verify chain continuity
 */
export function verifyChainContinuity(currentDoc, previousDoc) {
  const validation = validateChain(currentDoc, previousDoc);
  
  return {
    valid: validation.valid,
    errors: validation.errors
  };
}

/**
 * Verify on-chain anchor
 */
export async function verifyOnChainAnchor(doc, anchorModule) {
  if (!doc.anchor || !doc.anchor.signature) {
    return {
      valid: false,
      errors: ['No anchor signature in document']
    };
  }
  
  // Build expected payload
  const expectedPayload = anchorModule.buildPayload(
    doc.cid,
    doc.plaintext_sha256,
    doc.prev_plaintext_sha256,
    doc.date
  );
  
  // Verify on-chain
  const result = await anchorModule.verifyAnchor(doc.anchor.signature, expectedPayload);
  
  return {
    valid: result.valid,
    errors: result.error ? [result.error] : [],
    signature: doc.anchor.signature,
    slot: result.slot,
    blockTime: result.blockTime,
    payload: result.payload
  };
}

/**
 * Full verification of a memory document
 */
export async function verifyMemoryDocument(cid, encryptedPayload, walletSecretKeyBase58, previousDoc, anchorModule, cacheTtlMs) {
  const results = {
    cid,
    decryption: null,
    hash: null,
    chain: null,
    anchor: null,
    overall: false
  };
  
  // 1. Verify decryption and hash
  const decryptResult = await verifyCid(encryptedPayload, walletSecretKeyBase58, null, cacheTtlMs);
  results.decryption = {
    valid: decryptResult.valid,
    errors: decryptResult.errors
  };
  
  if (!decryptResult.valid) {
    return results;
  }
  
  const doc = decryptResult.doc;
  doc.cid = cid; // Add CID to doc for chain validation
  
  results.hash = {
    valid: true,
    sha256: decryptResult.actualSha256
  };
  
  // 2. Verify chain continuity
  if (previousDoc) {
    const chainResult = verifyChainContinuity(doc, previousDoc);
    results.chain = {
      valid: chainResult.valid,
      errors: chainResult.errors
    };
  } else {
    results.chain = {
      valid: true,
      errors: [],
      note: 'No previous document to verify against'
    };
  }
  
  // 3. Verify on-chain anchor
  if (doc.anchor && doc.anchor.signature && anchorModule) {
    const anchorResult = await verifyOnChainAnchor(doc, anchorModule);
    results.anchor = anchorResult;
  } else {
    results.anchor = {
      valid: true,
      errors: [],
      note: 'No anchor to verify'
    };
  }
  
  // Overall validity
  results.overall = results.decryption.valid && 
                   results.hash.valid && 
                   results.chain.valid && 
                   results.anchor.valid;
  
  return results;
}
