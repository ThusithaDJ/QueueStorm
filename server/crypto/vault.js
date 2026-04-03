/**
 * Credential Vault — AES-256-GCM symmetric encryption/decryption.
 *
 * Usage:
 *   const { encrypt, decrypt } = require('./vault')
 *   const enc = encrypt({ username: 'guest', password: 's3cr3t' })
 *   const dec = decrypt(enc)   // → { username: 'guest', password: 's3cr3t' }
 *
 * The encryption key is read from QUEUESTORM_SECRET (64 hex chars = 32 bytes).
 * A random IV is generated per encryption; IV + auth-tag are prepended to the
 * ciphertext and stored as a single base64 string.
 *
 * Format: base64( iv[12] + authTag[16] + ciphertext )
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') })
const { createCipheriv, createDecipheriv, randomBytes } = require('crypto')

const ALG = 'aes-256-gcm'
const IV_LEN  = 12   // 96-bit IV recommended for GCM
const TAG_LEN = 16

function getKey() {
  const hex = process.env.QUEUESTORM_SECRET
  if (!hex || hex.length < 64) {
    // In development fall back to a deterministic dev key; warn loudly.
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[vault] QUEUESTORM_SECRET not set — using insecure dev key. Set it in .env before production use.')
    }
    return Buffer.from('dev_key_do_not_use_in_production_!!', 'utf8').subarray(0, 32)
  }
  return Buffer.from(hex, 'hex')
}

/**
 * Encrypt a plain object (or string). Returns a base64 ciphertext string.
 * @param {object|string} data
 * @returns {string}
 */
function encrypt(data) {
  const plaintext = typeof data === 'string' ? data : JSON.stringify(data)
  const key = getKey()
  const iv  = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALG, key, iv)

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  // iv (12) + tag (16) + ciphertext
  return Buffer.concat([iv, tag, encrypted]).toString('base64')
}

/**
 * Decrypt a base64 string produced by `encrypt`.
 * Returns the original object (JSON-parsed) or plain string.
 * @param {string} ciphertext
 * @returns {object|string}
 */
function decrypt(ciphertext) {
  const buf = Buffer.from(ciphertext, 'base64')
  const iv        = buf.subarray(0, IV_LEN)
  const tag       = buf.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const encrypted = buf.subarray(IV_LEN + TAG_LEN)

  const key = getKey()
  const decipher = createDecipheriv(ALG, key, iv)
  decipher.setAuthTag(tag)

  const plaintext = decipher.update(encrypted) + decipher.final('utf8')

  try {
    return JSON.parse(plaintext)
  } catch {
    return plaintext
  }
}

module.exports = { encrypt, decrypt }
