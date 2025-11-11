const crypto = require('crypto');

// Symmetric encryption for storing SMTP passwords (app passwords) per-user
// Uses AES-256-GCM with a key derived from EMAIL_SECRET or JWT_SECRET
const KEY = crypto
  .createHash('sha256')
  .update(process.env.EMAIL_SECRET || process.env.JWT_SECRET || 'hospital_management_secret_key_2025_secure_token')
  .digest();

function encrypt(plainText = '') {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Store as base64: iv(12) + tag(16) + ciphertext
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(payload = '') {
  const buf = Buffer.from(String(payload), 'base64');
  const iv = buf.slice(0, 12);
  const tag = buf.slice(12, 28);
  const data = buf.slice(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString('utf8');
}

module.exports = { encrypt, decrypt };

