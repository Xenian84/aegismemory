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

export default {
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
  
  register(api) {
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
    
    // Load configuration (synchronous)
    const config = loadConfig(api.pluginConfig || api.config || {}, process.env);
    
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
    
    // Register lifecycle hooks using api.on() (OpenClaw 2026.2.9+)
    
    logger.info("🔗 Registering before_agent_start hook", { recallEnabled: config.recallEnabled });
    
    // Hook: Before agent starts - recall previous memories
    api.on("before_agent_start", async (event, ctx) => {
      console.log("🔥🔥🔥 AEGISMEMORY before_agent_start HOOK FIRED 🔥🔥🔥");
      logger.info("🎯 before_agent_start CALLED", { 
        recallEnabled: config.recallEnabled,
        hasEvent: !!event,
        hasPrompt: !!event?.prompt,
        promptLength: event?.prompt?.length 
      });
      
      if (!config.recallEnabled) {
        logger.info("⏭️ Recall disabled, skipping");
        return;
      }
      if (!event?.prompt || event.prompt.length < 5) {
        logger.info("⏭️ No prompt or too short, skipping");
        return;
      }
      
      try {
        logger.info("🛡️ Recalling memories", { sessionKey: ctx?.sessionKey, promptLength: event.prompt.length });
        
        // Add timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Recall timeout after 5s')), 5000)
        );
        
        const memories = await Promise.race([
          aegis.recall(ctx),
          timeoutPromise
        ]);
        
        if (memories && memories.prependContext) {
          logger.info("✅ Recalled memories", { length: memories.prependContext.length });
          
          // Return prependContext to inject memories
          return {
            prependContext: memories.prependContext
          };
        }
      } catch (error) {
        logger.warn("⚠️ Recall failed (non-blocking)", { error: error.message });
        // Don't throw - let agent continue without memories
      }
    });
    
    logger.info("🔗 Registering agent_end hook", { addEnabled: config.addEnabled });
    
    // Hook: After agent ends - save new memories
    api.on("agent_end", async (event, ctx) => {
      console.log("🔥🔥🔥 AEGISMEMORY agent_end HOOK FIRED 🔥🔥🔥");
      console.log("EVENT:", JSON.stringify(event, null, 2));
      console.log("CTX:", JSON.stringify(ctx, null, 2));
      logger.info("🎯 agent_end CALLED", { 
        addEnabled: config.addEnabled,
        hasEvent: !!event,
        success: event?.success,
        messageCount: event?.messages?.length 
      });
      
      if (!config.addEnabled) {
        logger.info("⏭️ Add disabled, skipping");
        return;
      }
      
      try {
        if (!event?.success || !event?.messages?.length) {
          logger.info("⏭️ No messages to save", { success: event?.success, messageCount: event?.messages?.length });
          return;
        }
        
        logger.info("🛡️ Auto-capture triggered", { 
          sessionKey: ctx?.sessionKey,
          messageCount: event.messages.length
        });
        
        // Build proper context object for aegis.save()
        const saveCtx = {
          agentId: ctx?.agentId || config.agentId,
          sessionId: ctx?.sessionKey || ctx?.sessionId,
          messages: event.messages,
          timestamp: new Date().toISOString()
        };
        
        // Save asynchronously (don't block agent response)
        aegis.save(saveCtx).then(() => {
          logger.info("✅ Memory saved", { 
            messageCount: saveCtx.messages.length,
            agentId: saveCtx.agentId
          });
          metrics.inc("memories_saved");
        }).catch((error) => {
          logger.error("❌ Save failed (non-blocking)", { 
            error: error.message
          });
        });
        
        // Return immediately - don't wait for save to complete
      } catch (error) {
        logger.warn("⚠️ Auto-capture error (non-blocking)", { 
          error: error.message
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
    
    // Register Cyberdyne Profile tools
    logger.info("🎯 Registering Cyberdyne Profile tools");
    
    api.registerTool(async (ctx) => {
      const { ProfileManager } = await import('./lib/cyberdyne/profileManager.js');
      const profileManager = new ProfileManager(config, state, vaultApi, cryptoBox, logger, metrics);
      
      return [
        {
          name: "cyberdyne_create_profile",
          description: "Create and store an encrypted Cyberdyne profile for a Telegram user. Returns IPFS CID. Profile includes reputation score, rank, tier, contributions, achievements, and communities.",
          parameters: {
            type: "object",
            properties: {
              telegram_id: {
                type: "number",
                description: "Telegram user ID"
              },
              username: {
                type: "string",
                description: "Telegram username"
              },
              display_name: {
                type: "string",
                description: "Display name (optional, defaults to username)"
              },
              score: {
                type: "number",
                description: "Reputation score",
                default: 0
              },
              rank: {
                type: "number",
                description: "Rank position",
                default: 0
              },
              tier: {
                type: "string",
                description: "Tier name (ATTUNING, ENTRAINED, HARMONIC, etc.)",
                default: "ATTUNING"
              },
              xnt_entitlement: {
                type: "number",
                description: "XNT token allocation",
                default: 0
              },
              wallet: {
                type: "string",
                description: "Wallet address (optional)"
              },
              contributions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    type: { type: "string" },
                    name: { type: "string" },
                    description: { type: "string" },
                    score: { type: "number" }
                  }
                },
                description: "Array of contribution objects"
              },
              achievements: {
                type: "array",
                items: { type: "string" },
                description: "Array of achievement strings"
              },
              communities: {
                type: "array",
                items: { type: "string" },
                description: "Array of community names"
              }
            },
            required: ["telegram_id", "username"]
          },
          async execute(params) {
            try {
              logger.info("Tool: cyberdyne_create_profile", { telegram_id: params.telegram_id });
              
              const profile = {
                schema: 'cyberdyne_profile_v2',
                version: '2',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                
                identity: {
                  telegram_id: params.telegram_id,
                  username: params.username,
                  display_name: params.display_name || params.username,
                  handle: `@${params.username}`,
                  wallet: params.wallet || null
                },
                
                reputation: {
                  score: params.score || 0,
                  rank: params.rank || 0,
                  tier: params.tier || 'ATTUNING',
                  level: 0,
                  xp: 0,
                  xp_to_next: 100,
                  xnt_entitlement: params.xnt_entitlement || 0
                },
                
                contributions: params.contributions || [],
                achievements: params.achievements || [],
                communities: params.communities || [],
                
                skills: {
                  builder: 0,
                  promoter: 0,
                  ecosystem: 0,
                  leadership: 0
                },
                
                badges: [],
                
                metadata: {
                  auto_enhanced: true,
                  source: 'openclaw-tool',
                  ipfs_cid: null
                },
                
                encryption: {
                  algorithm: 'AES-256-GCM',
                  key_derivation: 'wallet_signature',
                  encrypted_at: new Date().toISOString()
                }
              };
              
              const result = await profileManager.create(profile);
              
              return {
                success: true,
                cid: result.cid,
                profile: {
                  telegram_id: params.telegram_id,
                  username: params.username,
                  score: result.profile.reputation.score,
                  rank: result.profile.reputation.rank,
                  tier: result.profile.reputation.tier,
                  level: result.profile.reputation.level,
                  xp: result.profile.reputation.xp
                },
                ipfs_url: `https://ipfs.io/ipfs/${result.cid}`,
                size: result.size,
                format: result.format,
                message: `✅ Profile created! CID: ${result.cid}`
              };
            } catch (error) {
              logger.error("Tool failed: cyberdyne_create_profile", { error: error.message });
              return {
                success: false,
                error: error.message
              };
            }
          }
        },
        {
          name: "cyberdyne_get_profile",
          description: "Retrieve and decrypt a Cyberdyne profile from IPFS by Telegram ID",
          parameters: {
            type: "object",
            properties: {
              telegram_id: {
                type: "number",
                description: "Telegram user ID"
              },
              wallet: {
                type: "string",
                description: "Wallet address (optional)"
              }
            },
            required: ["telegram_id"]
          },
          async execute(params) {
            try {
              logger.info("Tool: cyberdyne_get_profile", { telegram_id: params.telegram_id });
              
              const profile = await profileManager.get(params.telegram_id, params.wallet);
              
              if (!profile) {
                return {
                  success: false,
                  error: "Profile not found"
                };
              }
              
              return {
                success: true,
                profile: {
                  telegram_id: profile.identity.telegram_id,
                  username: profile.identity.username,
                  display_name: profile.identity.display_name,
                  score: profile.reputation.score,
                  rank: profile.reputation.rank,
                  tier: profile.reputation.tier,
                  level: profile.reputation.level,
                  xp: profile.reputation.xp,
                  xnt_entitlement: profile.reputation.xnt_entitlement,
                  contributions: profile.contributions,
                  achievements: profile.achievements,
                  communities: profile.communities,
                  badges: profile.badges
                },
                cid: profile.metadata.ipfs_cid,
                version: profile.version
              };
            } catch (error) {
              logger.error("Tool failed: cyberdyne_get_profile", { error: error.message });
              return {
                success: false,
                error: error.message
              };
            }
          }
        },
        {
          name: "cyberdyne_update_profile",
          description: "Update an existing Cyberdyne profile (score, rank, tier, etc.)",
          parameters: {
            type: "object",
            properties: {
              telegram_id: {
                type: "number",
                description: "Telegram user ID"
              },
              score: {
                type: "number",
                description: "New reputation score"
              },
              rank: {
                type: "number",
                description: "New rank position"
              },
              tier: {
                type: "string",
                description: "New tier name"
              },
              xnt_entitlement: {
                type: "number",
                description: "New XNT token allocation"
              },
              add_contribution: {
                type: "object",
                description: "Contribution to add",
                properties: {
                  type: { type: "string" },
                  name: { type: "string" },
                  description: { type: "string" },
                  score: { type: "number" }
                }
              },
              add_achievement: {
                type: "string",
                description: "Achievement to add"
              },
              wallet: {
                type: "string",
                description: "Wallet address (optional)"
              }
            },
            required: ["telegram_id"]
          },
          async execute(params) {
            try {
              logger.info("Tool: cyberdyne_update_profile", { telegram_id: params.telegram_id });
              
              const updates = {};
              
              if (params.score !== undefined || params.rank !== undefined || params.tier || params.xnt_entitlement !== undefined) {
                updates.reputation = {};
                if (params.score !== undefined) updates.reputation.score = params.score;
                if (params.rank !== undefined) updates.reputation.rank = params.rank;
                if (params.tier) updates.reputation.tier = params.tier;
                if (params.xnt_entitlement !== undefined) updates.reputation.xnt_entitlement = params.xnt_entitlement;
              }
              
              if (params.add_contribution) {
                updates.contributions = params.add_contribution;
                updates.addContribution = true;
              }
              
              if (params.add_achievement) {
                updates.achievements = [params.add_achievement];
                updates.addAchievement = true;
              }
              
              const result = await profileManager.update(params.telegram_id, updates, params.wallet);
              
              return {
                success: true,
                cid: result.cid,
                old_version: result.profile.version - 1,
                new_version: result.profile.version,
                message: `✅ Profile updated! New CID: ${result.cid}`
              };
            } catch (error) {
              logger.error("Tool failed: cyberdyne_update_profile", { error: error.message });
              return {
                success: false,
                error: error.message
              };
            }
          }
        },
        {
          name: "cyberdyne_list_profiles",
          description: "List all Cyberdyne profiles for the current wallet",
          parameters: {
            type: "object",
            properties: {
              wallet: {
                type: "string",
                description: "Wallet address (optional)"
              }
            }
          },
          async execute(params) {
            try {
              logger.info("Tool: cyberdyne_list_profiles");
              
              const list = profileManager.listProfiles(params.wallet);
              
              return {
                success: true,
                count: list.length,
                profiles: list
              };
            } catch (error) {
              logger.error("Tool failed: cyberdyne_list_profiles", { error: error.message });
              return {
                success: false,
                error: error.message
              };
            }
          }
        }
      ];
    }, { names: ["cyberdyne_create_profile", "cyberdyne_get_profile", "cyberdyne_update_profile", "cyberdyne_list_profiles"] });
    
    logger.info("AegisMemory plugin registered successfully");
  }
};
