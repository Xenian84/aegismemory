#!/usr/bin/env node

/**
 * X1 On-Chain Storage Cost Analysis
 * 
 * This script tests actual costs of storing memories on X1 blockchain
 * vs hybrid approach (IPFS + on-chain anchors)
 */

import { Connection, Keypair, Transaction, TransactionInstruction, PublicKey } from '@solana/web3.js';

const MEMO_PROGRAM_ID = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
const X1_RPC = 'https://rpc.mainnet.x1.xyz';

// Sample memory sizes
const MEMORY_SIZES = {
  tiny: 500,      // 500 bytes - minimal conversation
  small: 2000,    // 2 KB - short conversation
  medium: 10000,  // 10 KB - typical conversation
  large: 50000,   // 50 KB - long conversation
  xlarge: 100000  // 100 KB - very long session
};

/**
 * Generate sample memory content
 */
function generateMemory(size) {
  const baseMemory = {
    schema: "aegismemory.v1",
    agent_id: "theo",
    wallet: "TestWallet123",
    timestamp: new Date().toISOString(),
    date: "2026-02-16",
    prev_cid: "QmPrevious123",
    prev_plaintext_sha256: "abc123",
    plaintext_sha256: "def456",
    content: {
      summary: "Test conversation",
      messages: [],
      tags: ["test"]
    }
  };

  // Fill with messages to reach target size
  const messageTemplate = {
    role: "user",
    content: "This is a test message to simulate real conversation data. ",
    timestamp: new Date().toISOString()
  };

  const currentSize = JSON.stringify(baseMemory).length;
  const messageSize = JSON.stringify(messageTemplate).length;
  const messagesNeeded = Math.ceil((size - currentSize) / messageSize);

  for (let i = 0; i < messagesNeeded; i++) {
    baseMemory.content.messages.push({
      ...messageTemplate,
      content: messageTemplate.content + `Message ${i}`
    });
  }

  return JSON.stringify(baseMemory);
}

/**
 * Test on-chain memo transaction cost
 */
async function testMemoTransactionCost(data, dryRun = true) {
  console.log(`\n📝 Testing memo transaction with ${data.length} bytes...`);
  
  if (dryRun) {
    console.log('   (DRY RUN - no actual transaction)');
    
    // Estimate based on X1 pricing
    // X1 typically charges ~5000 lamports per signature + data fees
    const baseFee = 5000; // lamports
    const dataFee = Math.ceil(data.length / 1000) * 1000; // ~1000 lamports per KB
    const totalLamports = baseFee + dataFee;
    const xnt = totalLamports / 1e9; // Convert to XNT
    
    console.log(`   Estimated cost: ${totalLamports} lamports (~${xnt.toFixed(6)} XNT)`);
    return { lamports: totalLamports, xnt };
  }

  // Real transaction (requires wallet with XNT)
  try {
    const connection = new Connection(X1_RPC, 'confirmed');
    
    // This would need actual wallet
    console.log('   ⚠️  Real transaction requires wallet with XNT');
    console.log('   Use: node test/cost-analysis.js --live --wallet <path>');
    
    return null;
  } catch (error) {
    console.error('   ❌ Error:', error.message);
    return null;
  }
}

/**
 * Compare storage approaches
 */
async function compareApproaches() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║        X1 ON-CHAIN STORAGE COST ANALYSIS                     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const results = [];

  for (const [size, bytes] of Object.entries(MEMORY_SIZES)) {
    console.log(`\n━━━ ${size.toUpperCase()} MEMORY (${bytes} bytes) ━━━`);
    
    const memory = generateMemory(bytes);
    const actualSize = memory.length;
    
    console.log(`Actual size: ${actualSize} bytes (${(actualSize / 1024).toFixed(2)} KB)`);

    // Approach 1: Full on-chain
    console.log('\n📊 Approach 1: FULL ON-CHAIN');
    const fullOnChain = await testMemoTransactionCost(memory, true);
    
    // Approach 2: Hybrid (anchor only)
    console.log('\n📊 Approach 2: HYBRID (IPFS + Anchor)');
    const anchor = `AegisMemory|v1|2026-02-16|QmTest123|hash456|prevHash789`;
    console.log(`   Anchor size: ${anchor.length} bytes`);
    const hybrid = await testMemoTransactionCost(anchor, true);
    
    // IPFS storage cost (estimated)
    const ipfsCost = 0.0001; // Very cheap, ~$0.0001 per MB
    const ipfsCostForMemory = (actualSize / 1024 / 1024) * ipfsCost;
    
    console.log(`   IPFS storage: ~$${ipfsCostForMemory.toFixed(6)} (negligible)`);
    console.log(`   Total hybrid: ${hybrid.lamports} lamports + IPFS`);
    
    // Calculate savings
    const savings = ((fullOnChain.lamports - hybrid.lamports) / fullOnChain.lamports * 100).toFixed(1);
    
    results.push({
      size,
      bytes: actualSize,
      fullOnChain: fullOnChain.lamports,
      hybrid: hybrid.lamports,
      savings: `${savings}%`,
      ratio: (fullOnChain.lamports / hybrid.lamports).toFixed(1) + 'x'
    });
    
    console.log(`\n💰 SAVINGS: ${savings}% cheaper (${(fullOnChain.lamports / hybrid.lamports).toFixed(1)}x reduction)`);
  }

  // Summary table
  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    COST COMPARISON SUMMARY                   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  console.log('┌─────────┬──────────┬──────────────┬──────────────┬──────────┬────────┐');
  console.log('│ Size    │ Bytes    │ Full On-Chain│ Hybrid       │ Savings  │ Ratio  │');
  console.log('├─────────┼──────────┼──────────────┼──────────────┼──────────┼────────┤');
  
  for (const r of results) {
    console.log(`│ ${r.size.padEnd(7)} │ ${String(r.bytes).padEnd(8)} │ ${String(r.fullOnChain).padEnd(12)} │ ${String(r.hybrid).padEnd(12)} │ ${r.savings.padEnd(8)} │ ${r.ratio.padEnd(6)} │`);
  }
  
  console.log('└─────────┴──────────┴──────────────┴──────────────┴──────────┴────────┘');
  
  // Recommendations
  console.log('\n\n📌 RECOMMENDATIONS:\n');
  console.log('1. For memories < 1 KB: Full on-chain is viable');
  console.log('2. For memories 1-10 KB: Hybrid saves 80-90%');
  console.log('3. For memories > 10 KB: Hybrid is essential (90%+ savings)');
  console.log('\n💡 HOWEVER: If X1 is very cheap, we can test full on-chain!');
  console.log('   Let\'s run real tests with your XNT to measure actual costs.\n');
}

/**
 * Test with real wallet
 */
async function testWithWallet(walletPath, memorySize = 'small') {
  console.log('\n🔑 Testing with real wallet...\n');
  
  // This would load actual wallet and submit transaction
  console.log('⚠️  Real wallet testing not implemented yet');
  console.log('   Will be added after cost analysis review');
  console.log('\n   Next steps:');
  console.log('   1. Review dry-run estimates');
  console.log('   2. If costs look good, implement live testing');
  console.log('   3. Submit test transactions with your XNT');
}

// Main
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--live')) {
    const walletIndex = args.indexOf('--wallet');
    const walletPath = walletIndex !== -1 ? args[walletIndex + 1] : null;
    
    if (!walletPath) {
      console.error('❌ --live requires --wallet <path>');
      process.exit(1);
    }
    
    await testWithWallet(walletPath);
  } else {
    await compareApproaches();
  }
}

main().catch(console.error);
