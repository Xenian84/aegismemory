import { loadEnv, getEnv, expandPath } from './env.js';

/**
 * Load and validate configuration
 */
export function loadConfig(pluginConfig = {}) {
  // Load environment variables
  const env = loadEnv();
  
  // Merge with process.env
  const allEnv = { ...env, ...process.env };
  
  // Build config with precedence: pluginConfig > env > defaults
  const config = {
    baseUrl: pluginConfig.baseUrl || 
             allEnv.AEGISMEMORY_VAULT_URL || 
             'https://vault.x1.xyz/ipfs',
    
    ipfsGatewayUrls: pluginConfig.ipfsGatewayUrls || 
                     (allEnv.AEGISMEMORY_IPFS_GATEWAY_URLS?.split(',').map(s => s.trim())) ||
                     [
                       'https://vault.x1.xyz/ipfs'
                       // Add fallback gateways if needed:
                       // 'https://ipfs.io/ipfs',
                       // 'https://cloudflare-ipfs.com/ipfs'
                     ],
    
    walletPubkey: pluginConfig.walletPubkey || 
                  allEnv.AEGISMEMORY_WALLET_PUBKEY,
    
    walletSecretKeyBase58: pluginConfig.walletSecretKeyBase58 || 
                           allEnv.AEGISMEMORY_WALLET_SECRET_KEY,
    
    agentId: pluginConfig.agentId || 
             allEnv.AEGISMEMORY_AGENT_ID || 
             'main',
    
    memoryPrefix: pluginConfig.memoryPrefix || 
                  allEnv.AEGISMEMORY_MEMORY_PREFIX || 
                  'memory/',
    
    recallEnabled: pluginConfig.recallEnabled !== undefined ? 
                   pluginConfig.recallEnabled : 
                   (allEnv.AEGISMEMORY_RECALL_ENABLED === 'true' || true),
    
    addEnabled: pluginConfig.addEnabled !== undefined ? 
                pluginConfig.addEnabled : 
                (allEnv.AEGISMEMORY_ADD_ENABLED === 'true' || true),
    
    captureStrategy: pluginConfig.captureStrategy || 
                     allEnv.AEGISMEMORY_CAPTURE_STRATEGY || 
                     'last_turn',
    
    memoryLimitNumber: pluginConfig.memoryLimitNumber || 
                       parseInt(allEnv.AEGISMEMORY_MEMORY_LIMIT) || 
                       10,
    
    maxMessageChars: pluginConfig.maxMessageChars || 
                     parseInt(allEnv.AEGISMEMORY_MAX_MESSAGE_CHARS) || 
                     50000,
    
    maxPrependChars: pluginConfig.maxPrependChars || 
                     parseInt(allEnv.AEGISMEMORY_MAX_PREPEND_CHARS) || 
                     20000,
    
    fetchConcurrency: pluginConfig.fetchConcurrency || 
                      parseInt(allEnv.AEGISMEMORY_FETCH_CONCURRENCY) || 
                      4,
    
    cacheKeyTtlMs: pluginConfig.cacheKeyTtlMs || 
                   parseInt(allEnv.AEGISMEMORY_CACHE_KEY_TTL_MS) || 
                   600000,
    
    statePath: expandPath(pluginConfig.statePath || 
                         allEnv.AEGISMEMORY_STATE_PATH || 
                         '~/.openclaw/aegismemory/state.json'),
    
    queuePath: expandPath(pluginConfig.queuePath || 
                         allEnv.AEGISMEMORY_QUEUE_PATH || 
                         '~/.openclaw/aegismemory/queue.jsonl'),
    
    workerIntervalMs: pluginConfig.workerIntervalMs || 
                      parseInt(allEnv.AEGISMEMORY_WORKER_INTERVAL_MS) || 
                      2000,
    
    maxRetries: pluginConfig.maxRetries || 
                parseInt(allEnv.AEGISMEMORY_MAX_RETRIES) || 
                6,
    
    anchorEnabled: pluginConfig.anchorEnabled !== undefined ? 
                   pluginConfig.anchorEnabled : 
                   (allEnv.AEGISMEMORY_ANCHOR_ENABLED === 'true' || false),
    
    anchorFrequency: pluginConfig.anchorFrequency || 
                     allEnv.AEGISMEMORY_ANCHOR_FREQUENCY || 
                     'daily',
    
    anchorProgram: pluginConfig.anchorProgram || 
                   allEnv.AEGISMEMORY_ANCHOR_PROGRAM || 
                   'memo',
    
    anchorRpcUrl: pluginConfig.anchorRpcUrl || 
                  allEnv.AEGISMEMORY_ANCHOR_RPC_URL ||
                  'https://rpc.mainnet.x1.xyz',
    
    anchorRpcFallbackUrls: pluginConfig.anchorRpcFallbackUrls ||
                           (allEnv.AEGISMEMORY_ANCHOR_RPC_FALLBACK_URLS?.split(',').map(s => s.trim())) ||
                           [
                             'https://rpc.mainnet.x1.xyz',
                             'https://rpc.testnet.x1.xyz'
                           ],
    
    anchorWalletSecretKeyBase58: pluginConfig.anchorWalletSecretKeyBase58 || 
                                 allEnv.AEGISMEMORY_ANCHOR_WALLET_SECRET_KEY,
    
    confirmCommitment: pluginConfig.confirmCommitment || 
                       allEnv.AEGISMEMORY_CONFIRM_COMMITMENT || 
                       'confirmed',
    
    priorityFeeMicrolamports: pluginConfig.priorityFeeMicrolamports || 
                              parseInt(allEnv.AEGISMEMORY_PRIORITY_FEE_MICROLAMPORTS),
    
    anchorTimeoutMs: pluginConfig.anchorTimeoutMs || 
                     parseInt(allEnv.AEGISMEMORY_ANCHOR_TIMEOUT_MS) || 
                     8000,
    
    derivationMsg: pluginConfig.derivationMsg || 
                   allEnv.AEGISMEMORY_DERIVATION_MSG || 
                   'IPFS_ENCRYPTION_KEY_V1',
    
    enableMemorySlot: pluginConfig.enableMemorySlot !== undefined ? 
                      pluginConfig.enableMemorySlot : 
                      (allEnv.AEGISMEMORY_ENABLE_MEMORY_SLOT === 'true' || false),
    
    memoryFormat: pluginConfig.memoryFormat || 
                  allEnv.AEGISMEMORY_MEMORY_FORMAT || 
                  'json' // 'json' or 'toon'
  };
  
  // Validate required fields
  if (!config.walletPubkey) {
    throw new Error('walletPubkey is required (set via config or AEGISMEMORY_WALLET_PUBKEY)');
  }
  
  if (!config.walletSecretKeyBase58) {
    throw new Error('walletSecretKeyBase58 is required (set via config or AEGISMEMORY_WALLET_SECRET_KEY)');
  }
  
  return config;
}

/**
 * Redact sensitive config for logging
 */
export function redactConfig(config) {
  const redacted = { ...config };
  
  if (redacted.walletSecretKeyBase58) {
    redacted.walletSecretKeyBase58 = '[REDACTED]';
  }
  
  if (redacted.anchorWalletSecretKeyBase58) {
    redacted.anchorWalletSecretKeyBase58 = '[REDACTED]';
  }
  
  return redacted;
}
