/**
 * Encryption utilities for Basic Auth password storage
 * Uses AES-256-CBC with node-forge
 */

import forge from 'node-forge';

// Ensure encryption key is exactly 32 bytes for AES-256
// Returns base64-encoded key for use with forge.util.decode64
function normalizeEncryptionKey(key: string): string {
  // If key is base64 encoded, validate it decodes to 32 bytes
  try {
    const decoded = Buffer.from(key, 'base64');
    if (decoded.length === 32) {
      // Key is already valid base64 encoding of 32 bytes, return as-is
      return key;
    }
  } catch (e) {
    // Not base64, use as-is
  }
  
  // If key is hex encoded
  if (key.length === 64 && /^[0-9a-fA-F]+$/.test(key)) {
    const hexBuffer = Buffer.from(key, 'hex');
    if (hexBuffer.length === 32) {
      // Convert hex to base64 for forge compatibility
      return Buffer.from(hexBuffer).toString('base64');
    }
  }
  
  // If key is a plain string, hash it to 32 bytes and return as base64
  const md = forge.md.sha256.create();
  md.update(key);
  const hash = md.digest();
  return forge.util.encode64(hash.getBytes());
}

/**
 * Encrypt a password using AES-256-CBC
 * @param password - The password to encrypt
 * @param encryptionKey - The encryption key (32 bytes for AES-256)
 * @returns Object with encrypted password and initialization vector
 */
export function encryptPassword(password: string, encryptionKey: string): { encrypted: string; iv: string } {
  if (!encryptionKey) {
    throw new Error('Encryption key is required');
  }
  
  const key = normalizeEncryptionKey(encryptionKey);
  const keyBytes = forge.util.decode64(key);
  
  // Generate random IV (16 bytes for AES-CBC)
  const iv = forge.random.getBytesSync(16);
  
  // Create cipher
  const cipher = forge.cipher.createCipher('AES-CBC', keyBytes);
  cipher.start({ iv: iv });
  cipher.update(forge.util.createBuffer(password, 'utf8'));
  cipher.finish();
  
  const encryptedBytes = cipher.output.getBytes();
  
  return {
    encrypted: forge.util.encode64(encryptedBytes),
    iv: forge.util.encode64(iv)
  };
}

/**
 * Decrypt a password using AES-256-CBC
 * @param encrypted - The encrypted password (base64)
 * @param iv - The initialization vector (base64)
 * @param encryptionKey - The encryption key (32 bytes for AES-256)
 * @returns The decrypted password
 */
export function decryptPassword(encrypted: string, iv: string, encryptionKey: string): string {
  if (!encryptionKey) {
    throw new Error('Encryption key is required');
  }
  
  const key = normalizeEncryptionKey(encryptionKey);
  const keyBytes = forge.util.decode64(key);
  
  // Create decipher
  const decipher = forge.cipher.createDecipher('AES-CBC', keyBytes);
  decipher.start({ iv: forge.util.decode64(iv) });
  decipher.update(forge.util.createBuffer(forge.util.decode64(encrypted)));
  decipher.finish();
  
  return decipher.output.toString();
}

/**
 * Validate that the encryption key is valid (32 bytes)
 * @param key - The encryption key to validate
 * @returns true if valid, false otherwise
 */
export function validateEncryptionKey(key: string): boolean {
  try {
    if (!key) return false;
    
    // Try to decode as base64
    const decoded = Buffer.from(key, 'base64');
    if (decoded.length === 32) return true;
    
    // Try to decode as hex
    if (key.length === 64 && /^[0-9a-fA-F]+$/.test(key)) {
      const hexBuffer = Buffer.from(key, 'hex');
      if (hexBuffer.length === 32) return true;
    }
    
    // If it's a plain string, we can hash it
    return key.length > 0;
  } catch (e) {
    return false;
  }
}
