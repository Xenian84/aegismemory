/**
 * @fileoverview Embedding generator for semantic search
 * Converts memory text into vector embeddings using sentence transformers
 */

import { pipeline } from '@xenova/transformers';

export class EmbeddingGenerator {
  constructor(logger = console) {
    this.model = null;
    this.logger = logger;
    this.modelName = 'Xenova/all-MiniLM-L6-v2';
  }

  /**
   * Initialize the embedding model
   * Model is cached after first run (~80MB download)
   */
  async init() {
    if (this.model) {
      return; // Already initialized
    }

    this.logger.info('Loading embedding model (first run may take a minute)...');
    
    try {
      this.model = await pipeline(
        'feature-extraction',
        this.modelName
      );
      this.logger.info('Embedding model loaded successfully');
    } catch (error) {
      this.logger.error(`Failed to load embedding model: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate embedding for text
   * @param {string} text - Text to embed
   * @returns {Promise<number[]>} 384-dimensional embedding vector
   */
  async embed(text) {
    if (!this.model) {
      await this.init();
    }

    if (!text || typeof text !== 'string') {
      throw new Error('Text must be a non-empty string');
    }

    try {
      // Generate embedding with mean pooling and normalization
      const output = await this.model(text, {
        pooling: 'mean',
        normalize: true
      });

      // Convert to regular array
      return Array.from(output.data);
    } catch (error) {
      this.logger.error(`Failed to generate embedding: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extract searchable text from memory object
   * Combines content, role, name, and metadata into a single searchable string
   * @param {Object} memory - Memory object
   * @returns {string} Searchable text
   */
  extractText(memory) {
    const parts = [];

    // Add main content
    if (memory.content) {
      parts.push(memory.content);
    }

    // Add role/name context
    if (memory.role) {
      parts.push(`Role: ${memory.role}`);
    }
    if (memory.name) {
      parts.push(`Name: ${memory.name}`);
    }

    // Add metadata fields
    if (memory.metadata && typeof memory.metadata === 'object') {
      Object.entries(memory.metadata).forEach(([key, value]) => {
        if (typeof value === 'string' && value.length > 0) {
          parts.push(`${key}: ${value}`);
        }
      });
    }

    // Join with newlines
    const text = parts.join('\n');

    // Truncate if too long (model has 512 token limit)
    // Rough estimate: 1 token ≈ 4 characters
    const maxChars = 2000; // ~500 tokens
    if (text.length > maxChars) {
      return text.substring(0, maxChars) + '...';
    }

    return text;
  }

  /**
   * Batch embed multiple texts
   * More efficient than calling embed() multiple times
   * @param {string[]} texts - Array of texts to embed
   * @returns {Promise<number[][]>} Array of embedding vectors
   */
  async embedBatch(texts) {
    if (!this.model) {
      await this.init();
    }

    if (!Array.isArray(texts) || texts.length === 0) {
      throw new Error('Texts must be a non-empty array');
    }

    const embeddings = [];
    for (const text of texts) {
      const embedding = await this.embed(text);
      embeddings.push(embedding);
    }

    return embeddings;
  }

  /**
   * Calculate cosine similarity between two embeddings
   * @param {number[]} a - First embedding
   * @param {number[]} b - Second embedding
   * @returns {number} Similarity score (0-1)
   */
  cosineSimilarity(a, b) {
    if (a.length !== b.length) {
      throw new Error('Embeddings must have same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
