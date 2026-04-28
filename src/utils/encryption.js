const crypto = require('node:crypto');

// AES-256-GCM encryption for PHI fields at rest (defense in depth on top of DB encryption).
const ALGO = 'aes-256-gcm';

function getKey() {
  const key = process.env.PHI_ENCRYPTION_KEY;
  if (!key || Buffer.from(key, 'base64').length !== 32) {
    throw new Error('PHI_ENCRYPTION_KEY must be 32 bytes base64-encoded');
  }
  return Buffer.from(key, 'base64');
}

function encrypt(plaintext) {
  if (plaintext == null) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

function decrypt(payload) {
  if (!payload) return null;
  const [ivB64, tagB64, dataB64] = payload.split(':');
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}

module.exports = { encrypt, decrypt };
