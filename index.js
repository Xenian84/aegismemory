/**
 * AegisMemory - OpenClaw Plugin
 * Production-grade encrypted memory storage with CID chaining and on-chain anchoring
 */

import { AegisMemory } from "./lib/aegisMemory.js";
import { loadConfig } from "./lib/config.js";
import { createLogger } from "./lib/logger.js";
import { State } from "./lib/state.js";
import { Queue } from "./lib/queue.js";
import { EmbeddingGenerator } from "./lib/embeddings.js";
import { VectorDB } from "./lib/vectorDB.js";
import { homedir } from "os";
import { join } from "path";

const aegismemoryPlugin = {
  id: "aegismemory",
  name: "AegisMemory",
  description: "Production-grade encrypted memory storage with CID chaining and on-chain anchoring",
  kind: "memory",
  
  configSchema: {
    type: "object",
    properties: {
      walletPubkey: {
        type: "string",
        description: "Wallet public key (base58)"
      },
      walletSecretKeyPath: {
        type: "string",
        description: "Path to wallet secret key file"
      },
      walletSecretKeyBase58: {
        type: "string",
        description: "Wallet secret key (base58)",
        sensitive: true
      },
      agentId: {
        type: "string",
        default: "main",
        description: "Agent ID for memory storage"
      },
      memoryFormat: {
        type: "string",
        enum: ["json", "toon"],
        default: "toon",
        description: "Memory storage format"
      },
      recallEnabled: {
        type: "boolean",
        default: true,
        description: "Enable memory recall on agent start"
      },
      addEnabled: {
        type: "boolean",
        default: true,
        description: "Enable memory saving on agent end"
      },
      anchorEnabled: {
        type: "boolean",
        default: true,
        description: "Enable on-chain anchoring"
      },
      anchorRpcUrl: {
        type: "string",
        default: "https://rpc.mainnet.x1.xyz",
        description: "X1 RPC URL for anchoring"
      },
      anchorRpcFallbackUrls: {
        type: "array",
        items: { type: "string" },
        default: [
          "https://rpc.mainnet.x1.xyz",
          "https://rpc.testnet.x1.xyz"
        ],
        description: "Fallback RPC URLs"
      },
      ipfsGatewayUrls: {
        type: "array",
        items: { type: "string" },
        default: ["https://vault.x1.xyz/ipfs"],
        description: "IPFS gateway URLs"
      },
      memoryLimit: {
        type: "number",
        default: 10,
        description: "Maximum number of memories to recall"
      },
      captureStrategy: {
        type: "string",
        enum: ["last_turn", "all", "summary"],
        default: "last_turn",
        description: "How to capture conversation"
      }
    },
    required: ["walletPubkey"]
  },
  
  async register(api) {
    const logger = createLogger({ namespace: "aegismemory" });
    
    // Simple metrics tracking
    const metrics = {
      counters: new Map(),
      timers: new Map(),
      inc(name) {
        this.counters.set(name, (this.counters.get(name) || 0) + 1);
      },
      recordTime(name, ms) {
        if (!this.timers.has(name)) {
          this.timers.set(name, []);
        }
        this.timers.get(name).push(ms);
      }
    };
    
    logger.info("Registering AegisMemory plugin");
    
    // Load configuration
    const config = await loadConfig(api.config || {}, process.env);
    
    // Initialize state and queue
    const dataDir = join(homedir(), ".openclaw", "aegismemory");
    const statePath = join(dataDir, "state.json");
    const queuePath = join(dataDir, "queue.jsonl");
    
    const state = new State(statePath, logger);
    const queue = new Queue(queuePath, logger);
    
    // Initialize AegisMemory
    const aegis = new AegisMemory(config, logger, metrics, state, queue);
    
    logger.info("AegisMemory initialized", {
      agentId: config.agentId,
      memoryFormat: config.memoryFormat,
      anchorEnabled: config.anchorEnabled
    });
    
    // Start queue processor
    const processQueue = async () => {
      const job = queue.getNext();
      if (!job) {
        // Check queue status periodically
        const stats = queue.getStats();
        if (stats.pending > 0 || stats.processing > 0) {
          logger.debug("📊 Queue status", stats);
        }
        return;
      }
      
      try {
        queue.markProcessing(job.id);
        logger.info("⚙️ Processing job", { id: job.id, type: job.type });
        
        if (job.type === "UPLOAD_MEMORY") {
          await aegis.processUploadJob(job);
          queue.complete(job.id);
          logger.info("✅ Job completed", { id: job.id, type: "UPLOAD_MEMORY" });
        } else if (job.type === "ANCHOR_MEMORY") {
          await aegis.processAnchorJob(job);
          queue.complete(job.id);
          logger.info("✅ Job completed", { id: job.id, type: "ANCHOR_MEMORY" });
        }
      } catch (error) {
        logger.error("❌ Job failed", { id: job.id, error: error.message, stack: error.stack });
        queue.fail(job.id, error.message, 5000);
      }
    };
    
    // Run queue processor every 5 seconds
    logger.info("🔄 Starting queue processor (5s interval)");
    const queueInterval = setInterval(processQueue, 5000);
    
    // Process immediately on startup
    processQueue().catch(err => logger.error("Queue processor startup error", { error: err.message }));
    
    // Register lifecycle hooks
    
    // Hook: Before agent starts - recall previous memories
    api.registerHook("agent:before_start", async (ctx) => {
      if (!config.recallEnabled) return;
      
      try {
        logger.info("Recalling memories", { sessionKey: ctx.sessionKey });
        
        const memories = await aegis.recall();
        
        if (memories && memories.length > 0) {
          logger.info("Recalled memories", { count: memories.length });
          
          // Format memories for context
          const memoryContext = memories.map((m, i) => {
            const messages = m.content?.messages || [];
            return `\n## Memory ${i + 1} (${m.date})\n${messages.map((msg) => 
              `${msg.role}: ${msg.content}`
            ).join('\n')}`;
          }).join('\n\n');
          
          // Inject into system message or context
          if (ctx.systemMessage) {
            ctx.systemMessage += `\n\n# Previous Conversations\n${memoryContext}`;
          } else if (ctx.messages) {
            ctx.messages.unshift({
              role: "system",
              content: `# Previous Conversations\n${memoryContext}`
            });
          }
          
          logger.info("Memories injected into context");
        }
      } catch (error) {
        logger.error("Failed to recall memories", { error: error.message });
      }
    });
    
    // Hook: After agent ends - save new memories
    api.registerHook("agent:after_end", async (ctx) => {
      if (!config.addEnabled) return;
      
      try {
        logger.info("🛡️ AegisMemory hook triggered", { 
          sessionKey: ctx.sessionKey,
          hasMessages: !!ctx.messages,
          hasHistory: !!ctx.history,
          messageCount: (ctx.messages || ctx.history || []).length
        });
        
        // Build proper context object for aegis.save()
        const saveCtx = {
          agentId: ctx.agentId || config.agentId,
          sessionId: ctx.sessionKey || ctx.sessionId,
          messages: ctx.messages || ctx.history || [],
          timestamp: new Date().toISOString()
        };
        
        if (saveCtx.messages.length === 0) {
          logger.warn("⚠️ No messages to save in context");
          return;
        }
        
        logger.info("💾 Calling aegis.save()", { 
          agentId: saveCtx.agentId,
          sessionId: saveCtx.sessionId,
          messageCount: saveCtx.messages.length 
        });
        
        await aegis.save(saveCtx);
        
        logger.info("✅ Memory saved successfully", { 
          messageCount: saveCtx.messages.length,
          agentId: saveCtx.agentId
        });
        
        metrics.inc("memories_saved");
      } catch (error) {
        logger.error("❌ Failed to save memories", { 
          error: error.message,
          stack: error.stack
        });
      }
    });
    
    // Register tools
    api.registerTool((ctx) => {
      return [
        {
          name: "aegismemory_recall",
          description: "Recall previous encrypted memories from X1 Vault. Returns decrypted conversation history.",
          parameters: {
            type: "object",
            properties: {
              limit: {
                type: "number",
                description: "Maximum number of memories to recall",
                default: config.memoryLimit
              }
            }
          },
          async execute(params) {
            try {
              logger.info("Tool: aegismemory_recall", params);
              const memories = await aegis.recall(params.limit);
              return {
                success: true,
                count: memories.length,
                memories
              };
            } catch (error) {
              logger.error("Tool failed: aegismemory_recall", { error: error.message });
              return {
                success: false,
                error: error.message
              };
            }
          }
        },
        {
          name: "aegismemory_status",
          description: "Get AegisMemory status and statistics",
          parameters: {
            type: "object",
            properties: {}
          },
          async execute() {
            try {
              logger.info("Tool: aegismemory_status");
              const status = await aegis.getStatus();
              return {
                success: true,
                ...status
              };
            } catch (error) {
              logger.error("Tool failed: aegismemory_status", { error: error.message });
              return {
                success: false,
                error: error.message
              };
            }
          }
        }
      ];
    }, { names: ["aegismemory_recall", "aegismemory_status"] });
    
    logger.info("AegisMemory plugin registered successfully");
  }
};

export default aegismemoryPlugin;
export const register = aegismemoryPlugin.register;
