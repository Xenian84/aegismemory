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
  search,
  export: exportMemory,
  view: viewMemory,
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
  
  // Check Solana balance
  try {
    const { execSync } = await import('child_process');
    const balance = execSync(`solana balance ${config.walletPubkey} --url ${config.anchorRpcUrl}`, { encoding: 'utf8' }).trim();
    console.log(`Balance: ${balance}`);
  } catch (error) {
    console.log(`Balance: Unable to check (solana CLI not available)`);
  }
  
  console.log(`Agent ID: ${config.agentId}`);
  console.log(`Vault URL: ${config.baseUrl}`);
  console.log(`Anchor Enabled: ${config.anchorEnabled}`);
  console.log(`Anchor RPC: ${config.anchorRpcUrl}`);
  console.log(`\nQueue:`);
  console.log(`  Total Jobs: ${queue.size()}`);
  console.log(`  Pending: ${queue.pendingCount()}`);
  
  console.log(`\nState:`);
  const agents = state.getAllAgents();
  let totalCIDs = 0;
  let totalAnchored = 0;
  
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
      
      // Count CIDs from branches
      if (agentState.branches && agentState.branches.main && agentState.branches.main.cids) {
        totalCIDs += agentState.branches.main.cids.length;
      }
      if (agentState.lastAnchoredDate && agentState.lastAnchoredDate !== 'never') {
        totalAnchored++;
      }
    }
  }
  
  console.log(`\nMetrics:`);
  const allMetrics = metrics.getAll();
  if (totalCIDs > 0 || totalAnchored > 0) {
    console.log(`  📊 ${totalCIDs} CIDs, ${totalAnchored} anchored`);
  }
  if (Object.keys(allMetrics.counters).length > 0) {
    console.log('  Counters:');
    for (const [key, value] of Object.entries(allMetrics.counters)) {
      console.log(`    ${key}: ${value}`);
    }
  }
  if (totalCIDs === 0 && Object.keys(allMetrics.counters).length === 0) {
    console.log('  No metrics yet');
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
    
    const encryptedText = await ipfsFetcher.fetch(cid);
    const encryptedPayload = JSON.parse(encryptedText);
    
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
      console.log(`\n💬 Messages (${doc.content.messages.length}):`);
      doc.content.messages.forEach((msg, i) => {
        const preview = msg.content?.substring(0, 150) || '';
        const keywords = preview.match(/\b[A-Z][a-z]+\b/g)?.slice(0, 5).join(', ') || 'N/A';
        console.log(`\n${i + 1}. [${msg.role}]`);
        console.log(`   ${preview}${msg.content.length > 150 ? '...' : ''}`);
        console.log(`   🔑 Keywords: ${keywords}`);
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
  // Support both --cid=QmX and --cid QmX formats
  let cid = args.find(a => a.startsWith('--cid='))?.split('=')[1];
  if (!cid) {
    const cidIndex = args.findIndex(a => a === '--cid');
    if (cidIndex >= 0 && args[cidIndex + 1]) {
      cid = args[cidIndex + 1];
    }
  }
  const checkRpc = args.includes('--rpc');
  
  if (!cid) {
    console.error('Usage: aegismemory verify --cid <cid> [--rpc]');
    console.error('   or: aegismemory verify --cid=<cid> [--rpc]');
    process.exit(1);
  }
  
  const { config, logger, state } = await init();
  
  console.log(`\nVerifying CID: ${cid}\n`);
  
  const ipfsFetcher = new IpfsFetcher(config.ipfsGatewayUrls, logger, metrics);
  
  // Fetch encrypted payload
  const encryptedText = await ipfsFetcher.fetch(cid);
  const encryptedPayload = JSON.parse(encryptedText);
  
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
      const prevEncryptedText = await ipfsFetcher.fetch(doc.prev_cid);
      const prevEncryptedPayload = JSON.parse(prevEncryptedText);
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
  // Support both --cid=QmX and --cid QmX formats
  let cid = args.find(a => a.startsWith('--cid='))?.split('=')[1];
  if (!cid) {
    const cidIndex = args.findIndex(a => a === '--cid');
    if (cidIndex >= 0 && args[cidIndex + 1] && !args[cidIndex + 1].startsWith('--')) {
      cid = args[cidIndex + 1];
    }
  }
  
  // Support both --out=file and --out file formats
  let outFile = args.find(a => a.startsWith('--out='))?.split('=')[1];
  if (!outFile) {
    const outIndex = args.findIndex(a => a === '--out');
    if (outIndex >= 0 && args[outIndex + 1]) {
      outFile = args[outIndex + 1];
    }
  }
  
  if (!cid) {
    console.error('Usage: aegismemory export --cid <cid> [--out <file>]');
    console.error('   or: aegismemory export --cid=<cid> [--out=<file>]');
    process.exit(1);
  }
  
  const { config, logger } = await init();
  
  console.log(`\nExporting CID: ${cid}\n`);
  
  const ipfsFetcher = new IpfsFetcher(config.ipfsGatewayUrls, logger, metrics);
  
  const encryptedText = await ipfsFetcher.fetch(cid);
  const encryptedPayload = JSON.parse(encryptedText);
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
 * View command - Create HTML chat dump and open in browser
 */
async function viewMemory(args) {
  // Support both --cid=QmX and --cid QmX formats
  let cid = args.find(a => a.startsWith('--cid='))?.split('=')[1];
  if (!cid) {
    const cidIndex = args.findIndex(a => a === '--cid');
    if (cidIndex >= 0 && args[cidIndex + 1] && !args[cidIndex + 1].startsWith('--')) {
      cid = args[cidIndex + 1];
    }
  }
  
  if (!cid) {
    console.error('Usage: aegismemory view --cid <cid>');
    console.error('   or: aegismemory view --cid=<cid>');
    process.exit(1);
  }
  
  const { config, logger } = await init();
  
  console.log(`\nFetching memory: ${cid}\n`);
  
  const ipfsFetcher = new IpfsFetcher(config.ipfsGatewayUrls, logger, metrics);
  
  const encryptedText = await ipfsFetcher.fetch(cid);
  const encryptedPayload = JSON.parse(encryptedText);
  const plaintext = await decryptPayload(
    encryptedPayload,
    config.walletSecretKeyBase58,
    config.cacheKeyTtlMs
  );
  
  // Parse based on format
  let doc;
  if (plaintext.startsWith('@aegismemory')) {
    const { fromTOON } = await import('../lib/toon.js');
    doc = fromTOON(plaintext);
  } else {
    doc = JSON.parse(plaintext);
  }
  
  // Generate HTML
  const html = generateChatHTML(doc, cid);
  
  // Save to /tmp/convo.html
  const { writeFileSync } = await import('fs');
  const outputPath = '/tmp/convo.html';
  writeFileSync(outputPath, html, 'utf8');
  
  console.log(`✅ Chat dump saved to: ${outputPath}\n`);
  
  // Open in browser
  try {
    const { execSync } = await import('child_process');
    const platform = process.platform;
    
    if (platform === 'darwin') {
      execSync(`open ${outputPath}`);
    } else if (platform === 'linux') {
      execSync(`xdg-open ${outputPath} 2>/dev/null || sensible-browser ${outputPath} 2>/dev/null || echo "Please open ${outputPath} manually"`);
    } else if (platform === 'win32') {
      execSync(`start ${outputPath}`);
    }
    
    console.log('🌐 Opening in browser...\n');
  } catch (error) {
    console.log(`⚠️  Could not auto-open browser. Please open manually:\n   file://${outputPath}\n`);
  }
}

/**
 * Generate HTML chat dump
 */
function generateChatHTML(doc, cid) {
  const messages = doc.content?.messages || [];
  const date = doc.date || 'Unknown date';
  const agentId = doc.agent_id || 'Unknown agent';
  
  // User color mapping
  const userColors = {
    'user': '#4A90E2',
    'assistant': '#7B68EE',
    'system': '#95A5A6',
    'Xenian': '#E74C3C',
    'Tachyon': '#2ECC71'
  };
  
  const messagesHTML = messages.map((msg, idx) => {
    const timestamp = msg.timestamp ? new Date(msg.timestamp).toLocaleString() : '';
    const role = msg.role || 'unknown';
    const userName = role === 'user' ? 'Xenian' : (role === 'assistant' ? 'Tachyon' : role);
    const color = userColors[userName] || userColors[role] || '#34495E';
    const content = (msg.content || '').replace(/\n/g, '<br>');
    
    return `
    <div class="message">
      <div class="message-header">
        <span class="username" style="color: ${color};">### ${userName}</span>
        <span class="timestamp">${timestamp}</span>
      </div>
      <div class="message-content">${content}</div>
    </div>`;
  }).join('\n');
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AegisMemory Chat - ${date}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    
    .container {
      max-width: 900px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      overflow: hidden;
    }
    
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    
    .header h1 {
      font-size: 28px;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
    }
    
    .header .shield {
      font-size: 32px;
    }
    
    .header .meta {
      font-size: 14px;
      opacity: 0.9;
      margin-top: 10px;
    }
    
    .header .cid {
      font-family: 'Courier New', monospace;
      font-size: 12px;
      opacity: 0.8;
      margin-top: 5px;
      word-break: break-all;
    }
    
    .messages {
      padding: 30px;
      max-height: 70vh;
      overflow-y: auto;
    }
    
    .message {
      margin-bottom: 25px;
      animation: fadeIn 0.3s ease-in;
    }
    
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    .message-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      padding-bottom: 5px;
      border-bottom: 2px solid #f0f0f0;
    }
    
    .username {
      font-weight: 600;
      font-size: 16px;
    }
    
    .timestamp {
      font-size: 12px;
      color: #95a5a6;
    }
    
    .message-content {
      padding: 15px;
      background: #f8f9fa;
      border-radius: 8px;
      line-height: 1.6;
      color: #2c3e50;
    }
    
    .footer {
      background: #f8f9fa;
      padding: 20px;
      text-align: center;
      color: #7f8c8d;
      font-size: 12px;
      border-top: 1px solid #e0e0e0;
    }
    
    .footer a {
      color: #667eea;
      text-decoration: none;
    }
    
    .footer a:hover {
      text-decoration: underline;
    }
    
    ::-webkit-scrollbar {
      width: 8px;
    }
    
    ::-webkit-scrollbar-track {
      background: #f1f1f1;
    }
    
    ::-webkit-scrollbar-thumb {
      background: #667eea;
      border-radius: 4px;
    }
    
    ::-webkit-scrollbar-thumb:hover {
      background: #764ba2;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>
        <span class="shield">🛡️</span>
        AegisMemory Chat
      </h1>
      <div class="meta">
        <strong>${agentId}</strong> • ${date} • ${messages.length} messages
      </div>
      <div class="cid">CID: ${cid}</div>
    </div>
    
    <div class="messages">
      ${messagesHTML || '<div class="message"><div class="message-content">No messages found</div></div>'}
    </div>
    
    <div class="footer">
      <p>Generated by <strong>AegisMemory</strong> 🛡️</p>
      <p>Encrypted memory storage with on-chain anchoring on X1 Blockchain</p>
      <p><a href="https://explorer.x1.xyz" target="_blank">View on X1 Explorer</a></p>
    </div>
  </div>
</body>
</html>`;
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
  // Support both --cid=QmX and --cid QmX formats
  let cid = args.find(a => a.startsWith('--cid='))?.split('=')[1];
  if (!cid) {
    const cidIndex = args.findIndex(a => a === '--cid');
    if (cidIndex >= 0 && args[cidIndex + 1]) {
      cid = args[cidIndex + 1];
    }
  }
  
  if (!cid) {
    console.error('Usage: aegismemory anchor --cid <cid>');
    console.error('   or: aegismemory anchor --cid=<cid>');
    process.exit(1);
  }
  
  const { config, logger, state } = await init();
  
  if (!config.anchorEnabled) {
    console.error('Anchoring is not enabled in config');
    process.exit(1);
  }
  
  console.log(`\nAnchoring CID: ${cid}\n`);
  
  const ipfsFetcher = new IpfsFetcher(config.ipfsGatewayUrls, logger, metrics);
  
  const encryptedText = await ipfsFetcher.fetch(cid);
  const encryptedPayload = JSON.parse(encryptedText);
  const plaintext = await decryptPayload(
    encryptedPayload,
    config.walletSecretKeyBase58,
    config.cacheKeyTtlMs
  );
  
  // Handle both JSON and TOON formats
  let doc;
  if (plaintext.startsWith('@aegismemory')) {
    const { fromTOON } = await import('../lib/toon.js');
    doc = fromTOON(plaintext);
  } else {
    doc = JSON.parse(plaintext);
  }
  
  const anchor = new AegisAnchor(config, logger, metrics, state);
  
  const result = await anchor.anchor(
    cid,
    doc.plaintext_sha256,
    doc.prev_plaintext_sha256,
    doc.date,
    config.walletPubkey,
    doc.agent_id
  );
  
  console.log('✅ Anchor submitted successfully!\n');
  console.log(`Transaction Signature:`);
  console.log(`  ${result.signature}\n`);
  console.log(`Slot: ${result.slot}`);
  console.log(`Block Time: ${result.blockTime}\n`);
  console.log(`🔍 View on Explorer:`);
  console.log(`  https://explorer.x1.xyz/tx/${result.signature}\n`);
  console.log(`📝 Memo Payload:`);
  const payload = anchor.buildPayload(cid, doc.plaintext_sha256, doc.prev_plaintext_sha256, doc.date);
  console.log(`  ${payload}\n`);
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
    --cid <cid>       CID to verify (required)
    --rpc             Also verify on-chain anchor
  
  search              Search memories by natural language query
    <query>           Search query (required)
    --limit N         Number of results (default: 10)
    --agent <id>      Filter by agent ID (optional)
    --min-score N     Minimum relevance score 0-1 (default: 0.5)
    --json            Output as JSON
  
  export              Export decrypted memory
    --cid <cid>       CID to export (required)
    --out <file>      Output file (optional, prints to stdout if omitted)
  
  view                View memory as HTML chat dump
    --cid <cid>       CID to view (required)
                      Saves to /tmp/convo.html and opens in browser
  
  replay-queue        Replay all pending queue jobs
  
  anchor              Manually anchor a memory
    --cid <cid>       CID to anchor (required)
  
  help                Show this help message

Environment:
  Set AEGISMEMORY_* environment variables or use ~/.openclaw/.env

Examples:
  aegismemory status
  aegismemory recall --limit 5
  aegismemory verify --cid Qm... --rpc
  aegismemory search "validator requirements" --limit 5
  aegismemory search "X1 network" --agent theo --min-score 0.7
  aegismemory export --cid Qm... --out memory.json
  aegismemory view --cid Qm...
  aegismemory anchor --cid Qm...

Note: Both --flag value and --flag=value formats are supported
`);
}

/**
 * Search command
 */
async function search(args) {
  const query = args.find(a => !a.startsWith('--'));
  if (!query) {
    console.error('Usage: aegismemory search <query> [--limit=N] [--agent=ID] [--min-score=N] [--json]');
    console.error('');
    console.error('Examples:');
    console.error('  aegismemory search "validator requirements"');
    console.error('  aegismemory search "X1 network" --limit=5');
    console.error('  aegismemory search "setup guide" --agent=theo');
    console.error('  aegismemory search "blockchain" --min-score=0.7');
    process.exit(1);
  }

  const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || 10;
  const agentId = args.find(a => a.startsWith('--agent='))?.split('=')[1];
  const minScore = parseFloat(args.find(a => a.startsWith('--min-score='))?.split('=')[1]) || 0.5;
  const jsonOutput = args.includes('--json');

  const { config, logger } = await init();

  // Initialize semantic search components
  const { EmbeddingGenerator } = await import('../lib/embeddings.js');
  const { VectorDB } = await import('../lib/vectorDB.js');
  const { SemanticSearch } = await import('../lib/search.js');
  const { IpfsFetcher } = await import('../lib/ipfsFetch.js');

  console.log('\n🔍 Initializing semantic search...\n');

  const embeddings = new EmbeddingGenerator(logger);
  await embeddings.init();

  const vectorDB = new VectorDB(config, logger);
  await vectorDB.init();

  const ipfsFetch = new IpfsFetcher(config, logger);
  const semanticSearch = new SemanticSearch(config, embeddings, vectorDB, ipfsFetch, logger);

  // Perform search
  console.log(`Searching for: "${query}"\n`);

  try {
    const results = await semanticSearch.search(query, { limit, agentId, minScore });

    if (jsonOutput) {
      console.log(JSON.stringify(results, null, 2));
      return;
    }

    if (results.length === 0) {
      console.log('No results found.');
      console.log('\nTips:');
      console.log('  - Try a different query');
      console.log('  - Lower --min-score (default: 0.5)');
      console.log('  - Check if memories are indexed (use "status" command)');
      return;
    }

    console.log(`Found ${results.length} memories:\n`);

    results.forEach((memory, i) => {
      const date = new Date(memory.timestamp).toISOString();
      const score = (memory.relevance_score * 100).toFixed(0);
      
      console.log(`${i + 1}. [${date}] (relevance: ${score}%)`);
      console.log(`   CID: ${memory.cid}`);
      
      if (memory.role) {
        console.log(`   Role: ${memory.role}`);
      }
      if (memory.name) {
        console.log(`   Name: ${memory.name}`);
      }
      
      if (memory.content) {
        const preview = memory.content.length > 200 
          ? memory.content.substring(0, 200) + '...'
          : memory.content;
        console.log(`   Content: ${preview}`);
      }
      
      console.log('');
    });

    console.log(`\nSearch complete. Use --json for full output.`);
  } catch (error) {
    console.error(`\n❌ Search failed: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
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
