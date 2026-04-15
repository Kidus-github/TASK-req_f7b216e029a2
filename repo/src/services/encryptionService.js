const PBKDF2_ITERATIONS = 310000
const PBKDF2_HASH = 'SHA-256'
const SALT_BYTES = 16
const KEY_BYTES = 32
const AES_ALGORITHM = 'AES-GCM'
const IV_BYTES = 12

// Cross-environment Web Crypto resolution.
// Browsers (and Node >= 19) expose Web Crypto as globalThis.crypto with a
// SubtleCrypto at crypto.subtle. In older Node or in some Vitest/jsdom
// configurations the global binding is absent or lacks `.subtle`, so we
// fall back to the `webcrypto` instance from the built-in `node:crypto`
// module. The fallback is gated on a Node runtime check and uses a
// `@vite-ignore`'d dynamic import so browser bundlers do not try to inline
// a Node built-in into client chunks.
let cryptoImpl = globalThis.crypto
if (!cryptoImpl || !cryptoImpl.subtle) {
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    const { webcrypto } = await import(/* @vite-ignore */ 'node:crypto')
    cryptoImpl = webcrypto
  }
}

function getRandomBytes(n) {
  return cryptoImpl.getRandomValues(new Uint8Array(n))
}

function bufferToBase64(buf) {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToBuffer(b64) {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

async function importPasswordKey(password) {
  const enc = new TextEncoder()
  return cryptoImpl.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveBits',
    'deriveKey',
  ])
}

export const encryptionService = {
  generateSalt() {
    return bufferToBase64(getRandomBytes(SALT_BYTES))
  },

  async hashPassword(password, saltB64) {
    const baseKey = await importPasswordKey(password)
    const salt = base64ToBuffer(saltB64)
    const bits = await cryptoImpl.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: PBKDF2_HASH },
      baseKey,
      KEY_BYTES * 8
    )
    return bufferToBase64(bits)
  },

  constantTimeEqual(a, b) {
    if (a.length !== b.length) return false
    let result = 0
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i)
    }
    return result === 0
  },

  async deriveEncryptionKey(password, encryptionSaltB64) {
    const baseKey = await importPasswordKey(password)
    const salt = base64ToBuffer(encryptionSaltB64)
    return cryptoImpl.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: PBKDF2_HASH },
      baseKey,
      { name: AES_ALGORITHM, length: KEY_BYTES * 8 },
      false,
      ['encrypt', 'decrypt']
    )
  },

  async encrypt(cryptoKey, plaintext) {
    const iv = getRandomBytes(IV_BYTES)
    const enc = new TextEncoder()
    const cipherBuffer = await cryptoImpl.subtle.encrypt(
      { name: AES_ALGORITHM, iv },
      cryptoKey,
      enc.encode(plaintext)
    )
    return {
      ciphertext: bufferToBase64(cipherBuffer),
      iv: bufferToBase64(iv),
      algorithm: 'AES-GCM-256',
    }
  },

  async decrypt(cryptoKey, ciphertextB64, ivB64) {
    const iv = base64ToBuffer(ivB64)
    const cipherBuffer = base64ToBuffer(ciphertextB64)
    const plainBuffer = await cryptoImpl.subtle.decrypt(
      { name: AES_ALGORITHM, iv },
      cryptoKey,
      cipherBuffer
    )
    return new TextDecoder().decode(plainBuffer)
  },

  PBKDF2_ITERATIONS,
  PBKDF2_HASH,
  SALT_BYTES,
  KEY_BYTES,
}
