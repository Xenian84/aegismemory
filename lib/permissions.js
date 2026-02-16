/**
 * @fileoverview Permission management for cross-agent memory access
 * Simple local-storage based permissions (v2.0.0)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createEncryptedPayload, decryptPayload } from './cryptoBox.js';

export class PermissionRegistry {
  constructor(config, logger = console) {
    this.config = config;
    this.logger = logger;
    this.permissions = new Map(); // wallet -> {grantee, sharedKey, grantedAt}
    
    // Storage path
    const stateDir = config.stateDir || join(config.statePath, '..');
    this.permissionsPath = join(stateDir, 'permissions.json');
  }

  /**
   * Initialize permissions from disk
   */
  async init() {
    if (this.initialized) {
      return;
    }

    try {
      // Ensure directory exists
      const dir = join(this.permissionsPath, '..');
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      // Load existing permissions
      if (existsSync(this.permissionsPath)) {
        const data = JSON.parse(readFileSync(this.permissionsPath, 'utf8'));
        this.permissions = new Map(Object.entries(data));
        this.logger.info(`Loaded ${this.permissions.size} permissions`);
      } else {
        this.logger.info('No existing permissions found');
      }

      this.initialized = true;
    } catch (error) {
      this.logger.error(`Failed to initialize permissions: ${error.message}`);
      throw error;
    }
  }

  /**
   * Save permissions to disk
   * @private
   */
  _persist() {
    try {
      const data = Object.fromEntries(this.permissions);
      writeFileSync(this.permissionsPath, JSON.stringify(data, null, 2));
    } catch (error) {
      this.logger.error(`Failed to persist permissions: ${error.message}`);
    }
  }

  /**
   * Grant permission to another agent
   * @param {string} granteeWallet - Wallet address of agent to grant access to
   * @param {string} sharedKey - Encryption key to share (base58)
   * @returns {Object} Permission details
   */
  async grant(granteeWallet, sharedKey) {
    if (!this.initialized) {
      await this.init();
    }

    try {
      // Encrypt the shared key with our wallet key for storage
      const encryptedKey = await createEncryptedPayload(
        sharedKey,
        this.config.walletPubkey,
        this.config.walletSecretKeyBase58,
        'PERMISSION_KEY_V1'
      );

      const permission = {
        grantee: granteeWallet,
        sharedKey: encryptedKey,
        grantedAt: Date.now(),
        grantedBy: this.config.walletPubkey
      };

      this.permissions.set(granteeWallet, permission);
      this._persist();

      this.logger.info(`Granted permission to ${granteeWallet}`);
      
      return {
        grantee: granteeWallet,
        grantedAt: new Date(permission.grantedAt).toISOString()
      };
    } catch (error) {
      this.logger.error(`Failed to grant permission: ${error.message}`);
      throw error;
    }
  }

  /**
   * Revoke permission from an agent
   * @param {string} granteeWallet - Wallet address to revoke access from
   * @returns {boolean} True if revoked, false if not found
   */
  async revoke(granteeWallet) {
    if (!this.initialized) {
      await this.init();
    }

    const existed = this.permissions.has(granteeWallet);
    this.permissions.delete(granteeWallet);
    
    if (existed) {
      this._persist();
      this.logger.info(`Revoked permission from ${granteeWallet}`);
    }

    return existed;
  }

  /**
   * Check if an agent has permission
   * @param {string} granteeWallet - Wallet address to check
   * @returns {boolean} True if has permission
   */
  async hasPermission(granteeWallet) {
    if (!this.initialized) {
      await this.init();
    }

    return this.permissions.has(granteeWallet);
  }

  /**
   * Get shared key for an agent (if they have permission)
   * @param {string} granteeWallet - Wallet address
   * @returns {string|null} Decrypted shared key or null
   */
  async getSharedKey(granteeWallet) {
    if (!this.initialized) {
      await this.init();
    }

    const permission = this.permissions.get(granteeWallet);
    if (!permission) {
      return null;
    }

    try {
      // Decrypt the shared key
      const sharedKey = await decryptPayload(
        permission.sharedKey,
        this.config.walletSecretKeyBase58
      );

      return sharedKey;
    } catch (error) {
      this.logger.error(`Failed to decrypt shared key: ${error.message}`);
      return null;
    }
  }

  /**
   * List all permissions
   * @returns {Array} Array of permission objects
   */
  async list() {
    if (!this.initialized) {
      await this.init();
    }

    const result = [];
    for (const [grantee, permission] of this.permissions.entries()) {
      result.push({
        grantee,
        grantedAt: new Date(permission.grantedAt).toISOString(),
        grantedBy: permission.grantedBy
      });
    }

    return result;
  }

  /**
   * Get count of permissions
   * @returns {number} Number of permissions
   */
  async count() {
    if (!this.initialized) {
      await this.init();
    }

    return this.permissions.size;
  }

  /**
   * Clear all permissions
   */
  async clear() {
    if (!this.initialized) {
      await this.init();
    }

    this.permissions.clear();
    this._persist();
    this.logger.info('Cleared all permissions');
  }
}
