/**
 * CID chain and plaintext hash chain management
 */

/**
 * Validate chain continuity
 */
export function validateChain(currentDoc, previousDoc) {
  const errors = [];
  
  // Check prev_cid matches
  if (previousDoc && currentDoc.prev_cid !== previousDoc.cid) {
    errors.push(`prev_cid mismatch: expected ${previousDoc.cid}, got ${currentDoc.prev_cid}`);
  }
  
  // Check prev_plaintext_sha256 matches
  if (previousDoc && currentDoc.prev_plaintext_sha256 !== previousDoc.plaintext_sha256) {
    errors.push(`prev_plaintext_sha256 mismatch: expected ${previousDoc.plaintext_sha256}, got ${currentDoc.prev_plaintext_sha256}`);
  }
  
  // Check wallet consistency
  if (previousDoc && currentDoc.wallet !== previousDoc.wallet) {
    errors.push(`wallet mismatch: expected ${previousDoc.wallet}, got ${currentDoc.wallet}`);
  }
  
  // Check agent_id consistency
  if (previousDoc && currentDoc.agent_id !== previousDoc.agent_id) {
    errors.push(`agent_id mismatch: expected ${previousDoc.agent_id}, got ${currentDoc.agent_id}`);
  }
  
  // Check date ordering
  if (previousDoc) {
    const prevDate = new Date(previousDoc.timestamp);
    const currDate = new Date(currentDoc.timestamp);
    
    if (currDate < prevDate) {
      errors.push(`timestamp out of order: ${currentDoc.timestamp} < ${previousDoc.timestamp}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Build chain from list of documents
 */
export function buildChain(documents) {
  // Sort by timestamp
  const sorted = [...documents].sort((a, b) => {
    return new Date(a.timestamp) - new Date(b.timestamp);
  });
  
  const chain = [];
  let prevDoc = null;
  
  for (const doc of sorted) {
    const validation = validateChain(doc, prevDoc);
    
    chain.push({
      cid: doc.cid,
      timestamp: doc.timestamp,
      date: doc.date,
      prev_cid: doc.prev_cid,
      plaintext_sha256: doc.plaintext_sha256,
      prev_plaintext_sha256: doc.prev_plaintext_sha256,
      valid: validation.valid,
      errors: validation.errors
    });
    
    prevDoc = doc;
  }
  
  return chain;
}

/**
 * Find chain breaks
 */
export function findChainBreaks(chain) {
  const breaks = [];
  
  for (let i = 0; i < chain.length; i++) {
    const entry = chain[i];
    
    if (!entry.valid) {
      breaks.push({
        index: i,
        cid: entry.cid,
        errors: entry.errors
      });
    }
  }
  
  return breaks;
}

/**
 * Verify chain integrity
 */
export function verifyChainIntegrity(documents) {
  const chain = buildChain(documents);
  const breaks = findChainBreaks(chain);
  
  return {
    totalDocuments: documents.length,
    chainLength: chain.length,
    breaks: breaks.length,
    valid: breaks.length === 0,
    chain,
    breakDetails: breaks
  };
}
