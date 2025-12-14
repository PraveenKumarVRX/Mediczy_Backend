import crypto from 'crypto';

/**
 * Data Encryption Utilities
 * 
 * Compliance: HIPAA §164.312(a)(2)(iv) - Encryption and Decryption
 *            GDPR Article 32 - Security of Processing
 *            DPDP Act §8 - Security Safeguards
 * 
 * Provides field-level encryption for sensitive PHI/PII data at rest.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 64;

/**
 * Get encryption key from environment
 * CRITICAL: This must be stored securely (AWS KMS, Azure Key Vault, etc.)
 */
function getEncryptionKey() {
  const key = process.env.ENCRYPTION_KEY;
  
  if (!key) {
    throw new Error('FATAL: ENCRYPTION_KEY environment variable not set');
  }
  
  // Key must be 32 bytes (256 bits) for AES-256
  if (key.length !== 64) { // 64 hex chars = 32 bytes
    throw new Error('ENCRYPTION_KEY must be 64 hexadecimal characters (32 bytes)');
  }
  
  return Buffer.from(key, 'hex');
}

/**
 * Encrypt sensitive data
 * 
 * @param {string} plaintext - Data to encrypt
 * @returns {string} - Encrypted data in format: iv:authTag:encryptedData
 */
export function encrypt(plaintext) {
  if (!plaintext) return null;
  
  try {
    const key = getEncryptionKey();
    
    // Generate random initialization vector
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    // Encrypt the data
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Get authentication tag (for AES-GCM)
    const authTag = cipher.getAuthTag();
    
    // Return as: iv:authTag:encryptedData
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error('Data encryption failed');
  }
}

/**
 * Decrypt sensitive data
 * 
 * @param {string} encryptedData - Data in format: iv:authTag:encryptedData
 * @returns {string} - Decrypted plaintext
 */
export function decrypt(encryptedData) {
  if (!encryptedData) return null;
  
  try {
    const key = getEncryptionKey();
    
    // Split the encrypted data
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    // Decrypt the data
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('Data decryption failed');
  }
}

/**
 * Hash data (one-way, for SSN, Aadhaar, etc.)
 * Use this when you need to verify data but don't need to decrypt it
 * 
 * @param {string} data - Data to hash
 * @returns {string} - Hashed data with salt
 */
export function hashData(data) {
  if (!data) return null;
  
  try {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const hash = crypto.pbkdf2Sync(data, salt, 100000, 64, 'sha512');
    
    return `${salt.toString('hex')}:${hash.toString('hex')}`;
  } catch (error) {
    console.error('Hashing failed:', error);
    throw new Error('Data hashing failed');
  }
}

/**
 * Verify hashed data
 * 
 * @param {string} data - Plain data to verify
 * @param {string} hashedData - Hashed data with salt
 * @returns {boolean} - True if data matches
 */
export function verifyHash(data, hashedData) {
  if (!data || !hashedData) return false;
  
  try {
    const parts = hashedData.split(':');
    if (parts.length !== 2) return false;
    
    const salt = Buffer.from(parts[0], 'hex');
    const originalHash = Buffer.from(parts[1], 'hex');
    
    const hash = crypto.pbkdf2Sync(data, salt, 100000, 64, 'sha512');
    
    return crypto.timingSafeEqual(originalHash, hash);
  } catch (error) {
    console.error('Hash verification failed:', error);
    return false;
  }
}

/**
 * Mask sensitive data for display/logging
 * 
 * @param {string} data - Data to mask
 * @param {string} type - Type of data (email, phone, ssn, aadhaar)
 * @returns {string} - Masked data
 */
export function maskData(data, type = 'generic') {
  if (!data) return null;
  
  switch (type) {
    case 'email':
      // user@example.com -> u***@example.com
      const [localPart, domain] = data.split('@');
      return localPart.length > 2
        ? `${localPart[0]}${'*'.repeat(localPart.length - 1)}@${domain}`
        : `***@${domain}`;
    
    case 'phone':
      // +1234567890 -> +1******890
      if (data.length < 4) return '****';
      return `${data.substring(0, 2)}${'*'.repeat(data.length - 5)}${data.substring(data.length - 3)}`;
    
    case 'ssn':
    case 'aadhaar':
      // 123456789 -> ***-**-6789
      if (data.length < 4) return '****';
      return `***-**-${data.substring(data.length - 4)}`;
    
    case 'card':
      // 1234567890123456 -> ****-****-****-3456
      if (data.length < 4) return '****';
      const cardNum = data.replace(/\s/g, '');
      return `****-****-****-${cardNum.substring(cardNum.length - 4)}`;
    
    default:
      // Generic masking: show first and last character
      if (data.length <= 2) return '**';
      return `${data[0]}${'*'.repeat(Math.min(data.length - 2, 8))}${data[data.length - 1]}`;
  }
}

/**
 * Generate encryption key (for initial setup)
 * Run this once to generate ENCRYPTION_KEY for .env file
 */
export function generateEncryptionKey() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Encrypt object fields selectively
 * 
 * @param {Object} obj - Object with fields to encrypt
 * @param {Array} fields - Field names to encrypt
 * @returns {Object} - Object with encrypted fields
 */
export function encryptFields(obj, fields) {
  const encrypted = { ...obj };
  
  for (const field of fields) {
    if (encrypted[field]) {
      encrypted[field] = encrypt(encrypted[field].toString());
    }
  }
  
  return encrypted;
}

/**
 * Decrypt object fields selectively
 * 
 * @param {Object} obj - Object with encrypted fields
 * @param {Array} fields - Field names to decrypt
 * @returns {Object} - Object with decrypted fields
 */
export function decryptFields(obj, fields) {
  const decrypted = { ...obj };
  
  for (const field of fields) {
    if (decrypted[field]) {
      try {
        decrypted[field] = decrypt(decrypted[field]);
      } catch (error) {
        console.error(`Failed to decrypt field ${field}:`, error);
        // Leave encrypted if decryption fails
      }
    }
  }
  
  return decrypted;
}

export default {
  encrypt,
  decrypt,
  hashData,
  verifyHash,
  maskData,
  generateEncryptionKey,
  encryptFields,
  decryptFields
};
