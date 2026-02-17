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
  // Cyberdyne Profile commands
  'cyberdyne-create': cyberDyneCreate,
  'cyberdyne-get': cyberDyneGet,
  'cyberdyne-update': cyberDyneUpdate,
  'cyberdyne-list': cyberDyneList,
  'cyberdyne-stats': cyberDyneStats,
  'cyberdyne-export': cyberDyneExport,
  'cyberdyne-verify': cyberDyneVerify,
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

Cyberdyne Profile Commands:
  cyberdyne-create    Create a new Cyberdyne profile
    --telegram-id N   Telegram user ID (required)
    --username <str>  Username (required)
    --display-name    Display name (optional)
    --score N         Reputation score (default: 0)
    --rank N          Rank position (default: 0)
    --tier <str>      Tier name (default: ATTUNING)
    --xnt-entitlement Token allocation (default: 0)
    --wallet <addr>   Wallet address (optional)
    --contributions   JSON array of contributions
    --achievements    Comma-separated achievements
    --communities     Comma-separated communities
  
  cyberdyne-get       Get a profile
    --telegram-id N   Telegram user ID (required)
    --format <fmt>    Output format: pretty|json|toon (default: pretty)
    --wallet <addr>   Wallet address (optional)
  
  cyberdyne-update    Update a profile
    --telegram-id N   Telegram user ID (required)
    --score N         New score
    --rank N          New rank
    --tier <str>      New tier
    --xnt-entitlement New XNT allocation
    --add-contribution JSON contribution object
    --add-achievement Achievement text
    --wallet <addr>   Wallet address (optional)
  
  cyberdyne-list      List all profiles
    --wallet <addr>   Wallet address (optional)
  
  cyberdyne-stats     Show profile statistics
    --telegram-id N   Telegram user ID (required)
    --wallet <addr>   Wallet address (optional)
  
  cyberdyne-export    Export profile to file
    --telegram-id N   Telegram user ID (required)
    --output <file>   Output filename (default: profile_<id>.json)
    --format <fmt>    Format: json|toon (default: json)
    --wallet <addr>   Wallet address (optional)
  
  cyberdyne-verify    Verify profile integrity
    --cid <cid>       Profile CID (required)
  
  help                Show this help message

Environment:
  Set AEGISMEMORY_* environment variables or use ~/.openclaw/.env

Examples:
  # Memory commands
  aegismemory status
  aegismemory recall --limit 5
  aegismemory search "validator requirements"
  
  # Cyberdyne profile commands
  aegismemory cyberdyne-create --telegram-id 12345 --username skywalker --score 417 --rank 8 --tier HARMONIC
  aegismemory cyberdyne-get --telegram-id 12345 --format pretty
  aegismemory cyberdyne-update --telegram-id 12345 --score 450
  aegismemory cyberdyne-list
  aegismemory cyberdyne-stats --telegram-id 12345

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
 * Cyberdyne: Create profile
 */
async function cyberDyneCreate(args) {
  const { config, logger, state } = await init();
  const { ProfileManager } = await import('../lib/cyberdyne/profileManager.js');
  const { CryptoBox } = await import('../lib/cryptoBox.js');
  const { Metrics } = await import('../lib/metrics.js');
  
  const metrics = new Metrics();
  const vaultApi = new VaultApi(config.baseUrl, logger, metrics);
  const crypto = new CryptoBox(config.walletPubkey, config.walletSecretKeyBase58);
  const profiles = new ProfileManager(config, state, vaultApi, crypto, logger, metrics);
  
  // Parse arguments
  const telegramId = parseInt(getArg(args, '--telegram-id'));
  const username = getArg(args, '--username');
  const displayName = getArg(args, '--display-name') || username;
  const score = parseInt(getArg(args, '--score') || '0');
  const rank = parseInt(getArg(args, '--rank') || '0');
  const tier = getArg(args, '--tier') || 'ATTUNING';
  const xntEntitlement = parseInt(getArg(args, '--xnt-entitlement') || '0');
  const wallet = getArg(args, '--wallet');
  
  // Parse JSON arrays
  const contributions = getArg(args, '--contributions');
  const achievements = getArg(args, '--achievements');
  const communities = getArg(args, '--communities');
  
  if (!telegramId || !username) {
    console.error('❌ Required: --telegram-id and --username');
    process.exit(1);
  }
  
  // Build profile
  const profile = {
    schema: 'cyberdyne_profile_v2',
    version: '2',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    
    identity: {
      telegram_id: telegramId,
      username,
      display_name: displayName,
      handle: `@${username}`,
      wallet: wallet || null
    },
    
    reputation: {
      score,
      rank,
      tier,
      level: 0,
      xp: 0,
      xp_to_next: 100,
      xnt_entitlement: xntEntitlement
    },
    
    contributions: contributions ? JSON.parse(contributions) : [],
    achievements: achievements ? achievements.split(',').map(a => a.trim()) : [],
    communities: communities ? communities.split(',').map(c => c.trim()) : [],
    
    skills: {
      builder: 0,
      promoter: 0,
      ecosystem: 0,
      leadership: 0
    },
    
    badges: [],
    
    metadata: {
      auto_enhanced: true,
      source: 'aegismemory-cli',
      ipfs_cid: null
    },
    
    encryption: {
      algorithm: 'AES-256-GCM',
      key_derivation: 'wallet_signature',
      encrypted_at: new Date().toISOString()
    }
  };
  
  console.log('\n🛡️ Creating Cyberdyne Profile...\n');
  
  const result = await profiles.create(profile);
  
  console.log('✅ Profile created successfully!\n');
  console.log(`Schema:     ${profile.schema}`);
  console.log(`Telegram:   ${telegramId} (@${username})`);
  console.log(`Score:      ${score} (Rank #${rank})`);
  console.log(`Tier:       ${tier}`);
  console.log(`Level:      ${result.profile.reputation.level} (XP: ${result.profile.reputation.xp}/${result.profile.reputation.xp + result.profile.reputation.xp_to_next})`);
  console.log(`CID:        ${result.cid}`);
  console.log(`Size:       ${result.size} bytes (${result.format})`);
  console.log(`Cost:       $0 (IPFS only)`);
  console.log(`\nView: https://ipfs.io/ipfs/${result.cid}`);
  console.log('');
}

/**
 * Cyberdyne: Get profile
 */
async function cyberDyneGet(args) {
  const { config, logger, state } = await init();
  const { ProfileManager } = await import('../lib/cyberdyne/profileManager.js');
  const { CryptoBox } = await import('../lib/cryptoBox.js');
  const { Metrics } = await import('../lib/metrics.js');
  
  const metrics = new Metrics();
  const vaultApi = new VaultApi(config.baseUrl, logger, metrics);
  const crypto = new CryptoBox(config.walletPubkey, config.walletSecretKeyBase58);
  const profiles = new ProfileManager(config, state, vaultApi, crypto, logger, metrics);
  
  const telegramId = parseInt(getArg(args, '--telegram-id'));
  const format = getArg(args, '--format') || 'pretty';
  const wallet = getArg(args, '--wallet');
  
  if (!telegramId) {
    console.error('❌ Required: --telegram-id');
    process.exit(1);
  }
  
  console.log(`\n🔍 Fetching profile for Telegram ID: ${telegramId}...\n`);
  
  const profile = await profiles.get(telegramId, wallet);
  
  if (!profile) {
    console.log('❌ Profile not found');
    process.exit(1);
  }
  
  if (format === 'json') {
    console.log(JSON.stringify(profile, null, 2));
  } else if (format === 'toon') {
    const { profileToTOON } = await import('../lib/cyberdyne/profileToon.js');
    console.log(profileToTOON(profile));
  } else {
    // Pretty format
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║              CYBERDYNE PROFILE                               ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    
    console.log(`👤 ${profile.identity.display_name} (@${profile.identity.username})`);
    console.log(`   Telegram ID: ${profile.identity.telegram_id}`);
    if (profile.identity.wallet) {
      console.log(`   Wallet: ${profile.identity.wallet}`);
    }
    console.log('');
    
    console.log('📊 REPUTATION');
    console.log(`   Score:  ${profile.reputation.score} points`);
    console.log(`   Rank:   #${profile.reputation.rank}`);
    console.log(`   Tier:   ${profile.reputation.tier}`);
    console.log(`   Level:  ${profile.reputation.level} (XP: ${profile.reputation.xp}/${profile.reputation.xp + profile.reputation.xp_to_next})`);
    if (profile.reputation.xnt_entitlement) {
      console.log(`   XNT:    ${profile.reputation.xnt_entitlement} tokens`);
    }
    console.log('');
    
    if (profile.contributions && profile.contributions.length > 0) {
      console.log('🏆 CONTRIBUTIONS');
      for (const contrib of profile.contributions) {
        console.log(`   [${contrib.type}] ${contrib.name} (${contrib.score} pts)`);
        if (contrib.description) {
          console.log(`      ${contrib.description}`);
        }
      }
      console.log('');
    }
    
    if (profile.achievements && profile.achievements.length > 0) {
      console.log('🎯 ACHIEVEMENTS');
      for (const achievement of profile.achievements) {
        console.log(`   ${achievement}`);
      }
      console.log('');
    }
    
    if (profile.communities && profile.communities.length > 0) {
      console.log('🌐 COMMUNITIES');
      for (const community of profile.communities) {
        console.log(`   - ${community}`);
      }
      console.log('');
    }
    
    if (profile.badges && profile.badges.length > 0) {
      console.log('🏅 BADGES');
      for (const badge of profile.badges) {
        console.log(`   ${badge}`);
      }
      console.log('');
    }
    
    console.log('📦 METADATA');
    console.log(`   CID:     ${profile.metadata.ipfs_cid}`);
    console.log(`   Version: ${profile.version}`);
    console.log(`   Created: ${profile.created_at}`);
    console.log(`   Updated: ${profile.updated_at}`);
    console.log('');
  }
}

/**
 * Cyberdyne: Update profile
 */
async function cyberDyneUpdate(args) {
  const { config, logger, state } = await init();
  const { ProfileManager } = await import('../lib/cyberdyne/profileManager.js');
  const { CryptoBox } = await import('../lib/cryptoBox.js');
  const { Metrics } = await import('../lib/metrics.js');
  
  const metrics = new Metrics();
  const vaultApi = new VaultApi(config.baseUrl, logger, metrics);
  const crypto = new CryptoBox(config.walletPubkey, config.walletSecretKeyBase58);
  const profiles = new ProfileManager(config, state, vaultApi, crypto, logger, metrics);
  
  const telegramId = parseInt(getArg(args, '--telegram-id'));
  const wallet = getArg(args, '--wallet');
  
  if (!telegramId) {
    console.error('❌ Required: --telegram-id');
    process.exit(1);
  }
  
  // Build updates object
  const updates = {};
  
  if (getArg(args, '--score')) {
    updates.reputation = { score: parseInt(getArg(args, '--score')) };
  }
  if (getArg(args, '--rank')) {
    updates.reputation = { ...updates.reputation, rank: parseInt(getArg(args, '--rank')) };
  }
  if (getArg(args, '--tier')) {
    updates.reputation = { ...updates.reputation, tier: getArg(args, '--tier') };
  }
  if (getArg(args, '--xnt-entitlement')) {
    updates.reputation = { ...updates.reputation, xnt_entitlement: parseInt(getArg(args, '--xnt-entitlement')) };
  }
  
  const addContribution = getArg(args, '--add-contribution');
  if (addContribution) {
    updates.contributions = JSON.parse(addContribution);
    updates.addContribution = true;
  }
  
  const addAchievement = getArg(args, '--add-achievement');
  if (addAchievement) {
    updates.achievements = [addAchievement];
    updates.addAchievement = true;
  }
  
  console.log(`\n🔄 Updating profile for Telegram ID: ${telegramId}...\n`);
  
  const result = await profiles.update(telegramId, updates, wallet);
  
  console.log('✅ Profile updated successfully!\n');
  console.log(`New CID:    ${result.cid}`);
  console.log(`Version:    ${result.profile.version}`);
  console.log(`Size:       ${result.size} bytes`);
  console.log('');
}

/**
 * Cyberdyne: List profiles
 */
async function cyberDyneList(args) {
  const { config, logger, state } = await init();
  const { ProfileManager } = await import('../lib/cyberdyne/profileManager.js');
  const { CryptoBox } = await import('../lib/cryptoBox.js');
  const { Metrics } = await import('../lib/metrics.js');
  
  const metrics = new Metrics();
  const vaultApi = new VaultApi(config.baseUrl, logger, metrics);
  const crypto = new CryptoBox(config.walletPubkey, config.walletSecretKeyBase58);
  const profiles = new ProfileManager(config, state, vaultApi, crypto, logger, metrics);
  
  const wallet = getArg(args, '--wallet');
  
  console.log('\n📋 Cyberdyne Profiles:\n');
  
  const list = profiles.listProfiles(wallet);
  
  if (list.length === 0) {
    console.log('No profiles found.');
    return;
  }
  
  console.log(`Found ${list.length} profile(s):\n`);
  
  for (const p of list) {
    console.log(`👤 ${p.username || 'Unknown'} (ID: ${p.telegram_id})`);
    console.log(`   Score: ${p.score} | Rank: #${p.rank} | Tier: ${p.tier}`);
    console.log(`   CID: ${p.cid}`);
    console.log(`   Updated: ${p.updated_at}`);
    console.log('');
  }
}

/**
 * Cyberdyne: Get stats
 */
async function cyberDyneStats(args) {
  const { config, logger, state } = await init();
  const { ProfileManager } = await import('../lib/cyberdyne/profileManager.js');
  const { CryptoBox } = await import('../lib/cryptoBox.js');
  const { Metrics } = await import('../lib/metrics.js');
  
  const metrics = new Metrics();
  const vaultApi = new VaultApi(config.baseUrl, logger, metrics);
  const crypto = new CryptoBox(config.walletPubkey, config.walletSecretKeyBase58);
  const profiles = new ProfileManager(config, state, vaultApi, crypto, logger, metrics);
  
  const telegramId = parseInt(getArg(args, '--telegram-id'));
  const wallet = getArg(args, '--wallet');
  
  if (!telegramId) {
    console.error('❌ Required: --telegram-id');
    process.exit(1);
  }
  
  const stats = await profiles.getStats(telegramId, wallet);
  
  if (!stats) {
    console.log('❌ Profile not found');
    process.exit(1);
  }
  
  console.log('\n📊 Profile Statistics:\n');
  console.log(`User:           @${stats.username} (${stats.telegram_id})`);
  console.log(`Score:          ${stats.score} points`);
  console.log(`Rank:           #${stats.rank}`);
  console.log(`Tier:           ${stats.tier}`);
  console.log(`Level:          ${stats.level} (XP: ${stats.xp}/${stats.xp + stats.xp_to_next})`);
  console.log(`Contributions:  ${stats.total_contributions}`);
  console.log(`Achievements:   ${stats.total_achievements}`);
  console.log(`Communities:    ${stats.communities_count}`);
  console.log(`Badges:         ${stats.badges_count}`);
  console.log(`CID:            ${stats.cid}`);
  console.log(`Version:        ${stats.version}`);
  console.log('');
}

/**
 * Cyberdyne: Export profile
 */
async function cyberDyneExport(args) {
  const { config, logger, state } = await init();
  const { ProfileManager } = await import('../lib/cyberdyne/profileManager.js');
  const { CryptoBox } = await import('../lib/cryptoBox.js');
  const { Metrics } = await import('../lib/metrics.js');
  const { writeFileSync } = await import('fs');
  
  const metrics = new Metrics();
  const vaultApi = new VaultApi(config.baseUrl, logger, metrics);
  const crypto = new CryptoBox(config.walletPubkey, config.walletSecretKeyBase58);
  const profiles = new ProfileManager(config, state, vaultApi, crypto, logger, metrics);
  
  const telegramId = parseInt(getArg(args, '--telegram-id'));
  const output = getArg(args, '--output') || `profile_${telegramId}.json`;
  const format = getArg(args, '--format') || 'json';
  const wallet = getArg(args, '--wallet');
  
  if (!telegramId) {
    console.error('❌ Required: --telegram-id');
    process.exit(1);
  }
  
  const profile = await profiles.export(telegramId, { walletAddress: wallet });
  
  if (!profile) {
    console.log('❌ Profile not found');
    process.exit(1);
  }
  
  let content;
  if (format === 'toon') {
    const { profileToTOON } = await import('../lib/cyberdyne/profileToon.js');
    content = profileToTOON(profile);
  } else {
    content = JSON.stringify(profile, null, 2);
  }
  
  writeFileSync(output, content, 'utf8');
  
  console.log(`\n✅ Profile exported to: ${output}`);
  console.log(`Format: ${format}`);
  console.log(`Size: ${content.length} bytes\n`);
}

/**
 * Cyberdyne: Verify profile
 */
async function cyberDyneVerify(args) {
  const { config, logger, state } = await init();
  const { ProfileManager } = await import('../lib/cyberdyne/profileManager.js');
  const { CryptoBox } = await import('../lib/cryptoBox.js');
  const { Metrics } = await import('../lib/metrics.js');
  
  const metrics = new Metrics();
  const vaultApi = new VaultApi(config.baseUrl, logger, metrics);
  const crypto = new CryptoBox(config.walletPubkey, config.walletSecretKeyBase58);
  const profiles = new ProfileManager(config, state, vaultApi, crypto, logger, metrics);
  
  const cid = getArg(args, '--cid');
  
  if (!cid) {
    console.error('❌ Required: --cid');
    process.exit(1);
  }
  
  console.log(`\n🔍 Verifying profile: ${cid}...\n`);
  
  const result = await profiles.verify(cid);
  
  if (result.valid) {
    console.log('✅ Profile verified successfully!\n');
    console.log(`Schema:   ${result.profile.schema}`);
    console.log(`Version:  ${result.profile.version}`);
    console.log(`User:     @${result.profile.identity.username}`);
    console.log(`Score:    ${result.profile.reputation.score}`);
    console.log(`CID:      ${cid}`);
    console.log('');
  } else {
    console.log('❌ Profile verification failed!\n');
    for (const error of result.errors) {
      console.log(`   - ${error}`);
    }
    console.log('');
    process.exit(1);
  }
}

/**
 * Helper: Parse argument (supports --flag value and --flag=value)
 */
function getArg(args, flag) {
  // Try --flag=value format
  const equalFormat = args.find(a => a.startsWith(`${flag}=`));
  if (equalFormat) {
    return equalFormat.split('=')[1];
  }
  
  // Try --flag value format
  const flagIndex = args.indexOf(flag);
  if (flagIndex !== -1 && flagIndex + 1 < args.length) {
    return args[flagIndex + 1];
  }
  
  return null;
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
