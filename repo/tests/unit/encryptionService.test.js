import { describe, it, expect } from 'vitest'
import { encryptionService } from '@/services/encryptionService'

describe('encryptionService', () => {
  describe('generateSalt', () => {
    it('generates a base64 salt string', async () => {
      const salt = await encryptionService.generateSalt()
      expect(typeof salt).toBe('string')
      expect(salt.length).toBeGreaterThan(0)
    })

    it('generates unique salts', async () => {
      const s1 = await encryptionService.generateSalt()
      const s2 = await encryptionService.generateSalt()
      expect(s1).not.toBe(s2)
    })
  })

  describe('hashPassword', () => {
    it('produces a consistent hash for same input', async () => {
      const salt = await encryptionService.generateSalt()
      const h1 = await encryptionService.hashPassword('testpassword', salt)
      const h2 = await encryptionService.hashPassword('testpassword', salt)
      expect(h1).toBe(h2)
    })

    it('produces different hashes for different passwords', async () => {
      const salt = await encryptionService.generateSalt()
      const h1 = await encryptionService.hashPassword('password1', salt)
      const h2 = await encryptionService.hashPassword('password2', salt)
      expect(h1).not.toBe(h2)
    })

    it('produces different hashes for different salts', async () => {
      const s1 = await encryptionService.generateSalt()
      const s2 = await encryptionService.generateSalt()
      const h1 = await encryptionService.hashPassword('samepass', s1)
      const h2 = await encryptionService.hashPassword('samepass', s2)
      expect(h1).not.toBe(h2)
    })
  })

  describe('constantTimeEqual', () => {
    it('returns true for equal strings', () => {
      expect(encryptionService.constantTimeEqual('abc', 'abc')).toBe(true)
    })

    it('returns false for different strings', () => {
      expect(encryptionService.constantTimeEqual('abc', 'abd')).toBe(false)
    })

    it('returns false for different length strings', () => {
      expect(encryptionService.constantTimeEqual('abc', 'abcd')).toBe(false)
    })
  })

  describe('encrypt / decrypt', () => {
    it('round-trips correctly', async () => {
      const salt = await encryptionService.generateSalt()
      const key = await encryptionService.deriveEncryptionKey('mypassword', salt)
      const plaintext = 'Hello, encrypted world!'
      const { ciphertext, iv } = await encryptionService.encrypt(key, plaintext)
      const decrypted = await encryptionService.decrypt(key, ciphertext, iv)
      expect(decrypted).toBe(plaintext)
    })

    it('produces different ciphertext each time (unique IV)', async () => {
      const salt = await encryptionService.generateSalt()
      const key = await encryptionService.deriveEncryptionKey('mypassword', salt)
      const plaintext = 'same text'
      const r1 = await encryptionService.encrypt(key, plaintext)
      const r2 = await encryptionService.encrypt(key, plaintext)
      expect(r1.ciphertext).not.toBe(r2.ciphertext)
      expect(r1.iv).not.toBe(r2.iv)
    })

    it('fails to decrypt with wrong key', async () => {
      const salt1 = await encryptionService.generateSalt()
      const salt2 = await encryptionService.generateSalt()
      const key1 = await encryptionService.deriveEncryptionKey('password1', salt1)
      const key2 = await encryptionService.deriveEncryptionKey('password2', salt2)
      const { ciphertext, iv } = await encryptionService.encrypt(key1, 'secret')
      await expect(encryptionService.decrypt(key2, ciphertext, iv)).rejects.toThrow()
    })
  })

  describe('PBKDF2 parameters', () => {
    it('uses 310000 iterations', () => {
      expect(encryptionService.PBKDF2_ITERATIONS).toBe(310000)
    })

    it('uses SHA-256', () => {
      expect(encryptionService.PBKDF2_HASH).toBe('SHA-256')
    })

    it('uses 16-byte salt', () => {
      expect(encryptionService.SALT_BYTES).toBe(16)
    })

    it('uses 32-byte key', () => {
      expect(encryptionService.KEY_BYTES).toBe(32)
    })
  })
})
