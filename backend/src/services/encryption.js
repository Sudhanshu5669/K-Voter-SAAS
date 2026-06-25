import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
  console.error('CRITICAL: ENCRYPTION_KEY must be a 64-character hex string (32 bytes)!');
}

/**
 * Encrypt a text using AES-256-GCM
 * @param {string} text - Text to encrypt
 * @returns {object} { encryptedText: string, iv: string, tag: string }
 */
export function encrypt(text) {
  if (!text) return null;
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(12); // 12 bytes IV is recommended for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const tag = cipher.getAuthTag();
  
  return {
    encryptedText: encrypted,
    iv: iv.toString('hex'),
    tag: tag.toString('hex')
  };
}

/**
 * Decrypt an AES-256-GCM encrypted text
 * @param {string} encryptedText - The encrypted text
 * @param {string} iv - The initialization vector in hex
 * @param {string} tag - The authentication tag in hex
 * @returns {string} The decrypted text
 */
export function decrypt(encryptedText, iv, tag) {
  if (!encryptedText || !iv || !tag) return null;
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const ivBuffer = Buffer.from(iv, 'hex');
  const tagBuffer = Buffer.from(tag, 'hex');
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuffer);
  decipher.setAuthTag(tagBuffer);
  
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}
