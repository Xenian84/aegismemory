#!/usr/bin/env node

import { readFileSync } from 'fs';
import { loadConfig } from '../lib/config.js';
import { createLogger } from '../lib/logger.js';
import { State } from '../lib/state.js';
import { Queue } from '../lib/queue.js';
import { VaultApi } from '../lib/vaultApi.js';
import { IpfsFetcher } from '../lib/ipfsFetch.js';
import { AegisAnchor } from '../lib/anchor.js';
import { decryptPayload, sha256 } from '../lib/cryptoBox.js';
import { verifyMemoryDocument } from '../lib/verify.js';
import { canonicalStringify } from '../lib/util.js';
import { metrics } from '../lib/metrics.js';

/**
 * AegisMemory CLI
 */

const commands = {
  status,
  recall,
  verify,
  export: exportMemory,
  'replay-queue': replayQueue,
  anchor: manualAnchor,
  help
};

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  
  if (!commands[command]) {
    console.error(`Unknown command: ${command}`);
    help();
    process.exit(1);
  }
  
  try {
    await commands[command](args.slice(1));
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Status command
 */
async function status() {
  const { config, logger, state, queue } = await init();
  
  console.log('\n=== AegisMemory Status ===\n');
  console.log(`Wallet: ${config.walletPubkey}`);
  console.log(`Agent ID: ${config.agentId}`);
  console.log(`Vault URL: ${config.baseUrl}`);
  console.log(`Anchor Enabled: ${config.anchorEnabled}`);
  console.log(`Anchor RPC: ${config.anchorRpcUrl}`);
  console.log(`\nQueue:`);
  console.log(`  Total Jobs: ${queue.size()}`);
  console.log(`  Pending: ${queue.pendingCount()}`);
  
  console.log(`\nState:`);
  const agents = state.getAllAgents();
  if (agents.length === 0) {
    console.log('  No agents tracked yet');
  } else {
    for (const agentKey of agents) {
      const [wallet, agentId] = agentKey.split(':');
      const agentState = state.getAgent(wallet, agentId);
      console.log(`  ${agentId}:`);
      console.log(`    Last CID: ${agentState.lastCid || 'none'}`);
      console.log(`    Last SHA256: ${agentState.lastPlaintextSha256?.slice(0, 16) || 'none'}...`);
      console.log(`    Last Anchored: ${agentState.lastAnchoredDate || 'never'}`);
    }
  }
  
  console.log(`\nMetrics:`);
  const allMetrics = metrics.getAll();
  if (Object.keys(allMetrics.counters).length === 0) {
    console.log('  No metrics yet');
  } else {
    console.log('  Counters:');
    for (const [key, value] of Object.entries(allMetrics.counters)) {
      console.log(`    ${key}: ${value}`);
    }
  }
  
  console.log();
}

/**
 * Recall command
 */
async function recall(args) {
  const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || 10;
  
  const { config, logger, state } = await init();
  
  console.log(`\nRecalling last ${limit} memories...\n`);
  
  // Get CIDs from state
  const wallet = config.walletPubkey;
  const agentId = config.agentId;
  const agentKey = `${wallet}:${agentId}`;
  
  if (!state.data.agents || !state.data.agents[agentKey]) {
    console.log('No memories found in state.');
    console.log('Hint: Memories are saved after conversations. Try chatting with your bot first.');
    return;
  }
  
  const agentState = state.data.agents[agentKey];
  if (!agentState.lastCid) {
    console.log('No CID found in state.');
    return;
  }
  
  console.log(`Found memory for agent ${agentId}:\n`);
  
  const ipfsFetcher = new IpfsFetcher(config.ipfsGatewayUrls, logger, metrics);
  
  // Fetch and decrypt the memory
  try {
    const cid = agentState.lastCid;
    console.log(`CID: ${cid}`);
    console.log(`Date: ${agentState.lastAnchoredDate || 'Not anchored yet'}`);
    console.log(`\nFetching from IPFS...\n`);
    
    const encryptedJson = await ipfsFetcher.fetch(cid);
    const encryptedPayload = JSON.parse(encryptedJson);
    
    console.log('Decrypting...\n');
    const plaintext = await decryptPayload(
      encryptedPayload,
      config.walletSecretKeyBase58,
      'IPFS_ENCRYPTION_KEY_V1'
    );
    
    // Parse based on format
    let doc;
    if (plaintext.startsWith('@aegismemory')) {
      const { fromTOON } = await import('../lib/toon.js');
      doc = fromTOON(plaintext);
    } else {
      doc = JSON.parse(plaintext);
    }
    
    console.log('=== Memory Content ===\n');
    console.log(`Schema: ${doc.schema}`);
    console.log(`Timestamp: ${doc.timestamp}`);
    console.log(`Session: ${doc.session_id || 'N/A'}`);
    
    if (doc.content && doc.content.messages) {
      console.log(`\nMessages (${doc.content.messages.length}):`);
      doc.content.messages.forEach((msg, i) => {
        console.log(`\n${i + 1}. ${msg.role}:`);
        console.log(`   ${msg.content.substring(0, 200)}${msg.content.length > 200 ? '...' : ''}`);
      });
    }
    
    console.log();
  } catch (error) {
    console.error(`Error recalling memory: ${error.message}`);
  }
}

/**
 * Verify command
 */
async function verify(args) {
  const cid = args.find(a => a.startsWith('--cid='))?.split('=')[1];
  const checkRpc = args.includes('--rpc');
  
  if (!cid) {
    console.error('Usage: aegismemory verify --cid=<cid> [--rpc]');
    process.exit(1);
  }
  
  const { config, logger, state } = await init();
  
  console.log(`\nVerifying CID: ${cid}\n`);
  
  const ipfsFetcher = new IpfsFetcher(config.ipfsGatewayUrls, logger, metrics);
  
  // Fetch encrypted payload
  const encryptedJson = await ipfsFetcher.fetch(cid);
  const encryptedPayload = JSON.parse(encryptedJson);
  
  // Get previous document if available
  const plaintext = await decryptPayload(
    encryptedPayload,
    config.walletSecretKeyBase58,
    config.cacheKeyTtlMs
  );
  
  // Parse based on format (TOON or JSON)
  let doc;
  if (plaintext.startsWith('@aegismemory')) {
    // TOON format
    const { fromTOON } = await import('../lib/toon.js');
    doc = fromTOON(plaintext);
  } else {
    // JSON format
    doc = JSON.parse(plaintext);
  }
  
  let previousDoc = null;
  if (doc.prev_cid) {
    try {
      const prevEncryptedJson = await ipfsFetcher.fetch(doc.prev_cid);
      const prevEncryptedPayload = JSON.parse(prevEncryptedJson);
      const prevPlaintext = await decryptPayload(
        prevEncryptedPayload,
        config.walletSecretKeyBase58,
        config.cacheKeyTtlMs
      );
      
      // Parse previous doc based on format
      if (prevPlaintext.startsWith('@aegismemory')) {
        const { fromTOON } = await import('../lib/toon.js');
        previousDoc = fromTOON(prevPlaintext);
      } else {
        previousDoc = JSON.parse(prevPlaintext);
      }
      previousDoc.cid = doc.prev_cid;
    } catch (error) {
      console.warn(`Warning: Could not fetch previous CID: ${error.message}`);
    }
  }
  
  // Initialize anchor module if needed
  let anchorModule = null;
  if (checkRpc && config.anchorEnabled) {
    anchorModule = new AegisAnchor(config, logger, metrics, state);
  }
  
  // Verify
  const results = await verifyMemoryDocument(
    cid,
    encryptedPayload,
    config.walletSecretKeyBase58,
    previousDoc,
    anchorModule,
    config.cacheKeyTtlMs
  );
  
  console.log('=== Verification Results ===\n');
  console.log(`Overall: ${results.overall ? '✓ VALID' : '✗ INVALID'}\n`);
  
  console.log(`Decryption: ${results.decryption.valid ? '✓' : '✗'}`);
  if (results.decryption.errors?.length > 0) {
    results.decryption.errors.forEach(e => console.log(`  - ${e}`));
  }
  
  console.log(`\nHash: ${results.hash.valid ? '✓' : '✗'}`);
  if (results.hash.sha256) {
    console.log(`  SHA256: ${results.hash.sha256}`);
  }
  
  console.log(`\nChain: ${results.chain.valid ? '✓' : '✗'}`);
  if (results.chain.errors?.length > 0) {
    results.chain.errors.forEach(e => console.log(`  - ${e}`));
  }
  if (results.chain.note) {
    console.log(`  Note: ${results.chain.note}`);
  }
  
  console.log(`\nAnchor: ${results.anchor.valid ? '✓' : '✗'}`);
  if (results.anchor.signature) {
    console.log(`  Signature: ${results.anchor.signature}`);
    console.log(`  Slot: ${results.anchor.slot || 'N/A'}`);
  }
  if (results.anchor.errors?.length > 0) {
    results.anchor.errors.forEach(e => console.log(`  - ${e}`));
  }
  if (results.anchor.note) {
    console.log(`  Note: ${results.anchor.note}`);
  }
  
  console.log();
  
  if (!results.overall) {
    process.exit(1);
  }
}

/**
 * Export command
 */
async function exportMemory(args) {
  const cid = args.find(a => a.startsWith('--cid='))?.split('=')[1];
  const outFile = args.find(a => a.startsWith('--out='))?.split('=')[1];
  
  if (!cid) {
    console.error('Usage: aegismemory export --cid=<cid> --out=<file>');
    process.exit(1);
  }
  
  const { config, logger } = await init();
  
  console.log(`\nExporting CID: ${cid}\n`);
  
  const ipfsFetcher = new IpfsFetcher(config.ipfsGatewayUrls, logger, metrics);
  
  const encryptedJson = await ipfsFetcher.fetch(cid);
  const encryptedPayload = JSON.parse(encryptedJson);
  const plaintext = await decryptPayload(
    encryptedPayload,
    config.walletSecretKeyBase58,
    config.cacheKeyTtlMs
  );
  
  if (outFile) {
    const { writeFileSync } = await import('fs');
    writeFileSync(outFile, plaintext, 'utf8');
    console.log(`Exported to: ${outFile}`);
  } else {
    console.log(plaintext);
  }
}

/**
 * Replay queue command
 */
async function replayQueue() {
  const { config, logger, state, queue } = await init();
  
  console.log(`\nReplaying queue (${queue.size()} jobs)...\n`);
  
  const { AegisMemory } = await import('../lib/aegisMemory.js');
  const aegisMemory = new AegisMemory(config, logger, metrics, state, queue);
  
  let processed = 0;
  let failed = 0;
  
  while (queue.pendingCount() > 0) {
    const job = queue.getNext();
    if (!job) break;
    
    queue.markProcessing(job.id);
    
    try {
      if (job.type === 'UPLOAD_MEMORY') {
        await aegisMemory.processUploadJob(job);
      } else if (job.type === 'ANCHOR_MEMORY') {
        await aegisMemory.processAnchorJob(job);
      }
      
      queue.complete(job.id);
      processed++;
      console.log(`✓ Processed job ${job.id} (${job.type})`);
    } catch (error) {
      queue.fail(job.id, error);
      failed++;
      console.error(`✗ Failed job ${job.id}: ${error.message}`);
    }
  }
  
  console.log(`\nDone: ${processed} processed, ${failed} failed`);
}

/**
 * Manual anchor command
 */
async function manualAnchor(args) {
  const cid = args.find(a => a.startsWith('--cid='))?.split('=')[1];
  
  if (!cid) {
    console.error('Usage: aegismemory anchor --cid=<cid>');
    process.exit(1);
  }
  
  const { config, logger, state } = await init();
  
  if (!config.anchorEnabled) {
    console.error('Anchoring is not enabled in config');
    process.exit(1);
  }
  
  console.log(`\nAnchoring CID: ${cid}\n`);
  
  const ipfsFetcher = new IpfsFetcher(config.ipfsGatewayUrls, logger, metrics);
  
  const encryptedJson = await ipfsFetcher.fetch(cid);
  const encryptedPayload = JSON.parse(encryptedJson);
  const plaintext = await decryptPayload(
    encryptedPayload,
    config.walletSecretKeyBase58,
    config.cacheKeyTtlMs
  );
  const doc = JSON.parse(plaintext);
  
  const anchor = new AegisAnchor(config, logger, metrics, state);
  
  const result = await anchor.anchor(
    cid,
    doc.plaintext_sha256,
    doc.prev_plaintext_sha256,
    doc.date,
    config.walletPubkey,
    doc.agent_id
  );
  
  console.log('Anchor submitted:');
  console.log(`  Signature: ${result.signature}`);
  console.log(`  Slot: ${result.slot}`);
  console.log(`  Block Time: ${result.blockTime}`);
  console.log();
}

/**
 * Help command
 */
function help() {
  console.log(`
AegisMemory CLI - Production encrypted memory storage

Usage: aegismemory <command> [options]

Commands:
  status              Show AegisMemory status (queue, state, metrics)
  recall              Recall recent memories
    --limit=N         Number of memories to recall (default: 10)
  
  verify              Verify a memory document
    --cid=<cid>       CID to verify (required)
    --rpc             Also verify on-chain anchor
  
  export              Export decrypted memory
    --cid=<cid>       CID to export (required)
    --out=<file>      Output file (optional, prints to stdout if omitted)
  
  replay-queue        Replay all pending queue jobs
  
  anchor              Manually anchor a memory
    --cid=<cid>       CID to anchor (required)
  
  help                Show this help message

Environment:
  Set AEGISMEMORY_* environment variables or use ~/.openclaw/.env

Examples:
  aegismemory status
  aegismemory recall --limit=5
  aegismemory verify --cid=Qm... --rpc
  aegismemory export --cid=Qm... --out=memory.json
  aegismemory anchor --cid=Qm...
`);
}

/**
 * Initialize config and components
 */
async function init() {
  const config = loadConfig();
  const logger = createLogger({ 
    name: 'aegismemory-cli',
    level: process.env.LOG_LEVEL || 'warn',
    json: false
  });
  const state = new State(config.statePath, logger);
  const queue = new Queue(config.queuePath, logger);
  
  return { config, logger, state, queue };
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
