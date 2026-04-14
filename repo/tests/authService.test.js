import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { authService } from '../src/services/authService'

beforeEach(async () => {
  const { getDB } = await import('../src/db/schema')
  const db = await getDB()
  for (const store of ['users', 'auditEvents']) {
    try {
      const tx = db.transaction(store, 'readwrite')
      await tx.store.clear()
      await tx.done
    } catch {
      // ignore
    }
  }
})

describe('authService', () => {
  describe('createUser', () => {
    it('rejects empty username', async () => {
      await expect(
        authService.createUser({ username: '', password: 'password123' })
      ).rejects.toThrow()
    })

    it('rejects short username', async () => {
      await expect(
        authService.createUser({ username: 'ab', password: 'password123' })
      ).rejects.toThrow('at least 3')
    })

    it('rejects short password', async () => {
      await expect(
        authService.createUser({ username: 'testuser', password: 'short' })
      ).rejects.toThrow('at least 8')
    })

    it('rejects empty password', async () => {
      await expect(
        authService.createUser({ username: 'testuser', password: '' })
      ).rejects.toThrow()
    })
  })

  describe('no role/capability model', () => {
    it('hasCapability does not exist', () => {
      expect(authService.hasCapability).toBeUndefined()
    })

    it('createUser does not produce a role field', async () => {
      const { getDB } = await import('../src/db/schema')
      const db = await getDB()
      const tx = db.transaction('users', 'readwrite')
      await tx.store.clear()
      await tx.done

      const user = await authService.createUser({ username: 'noroletst', password: 'password123' })
      expect(user.role).toBeUndefined()
    })
  })

  describe('getInactivityTimeoutMs', () => {
    it('returns default 30 minutes', () => {
      localStorage.removeItem('ff_inactivity_timeout_min')
      const ms = authService.getInactivityTimeoutMs()
      expect(ms).toBe(30 * 60 * 1000)
    })

    it('clamps below 5 minutes', () => {
      localStorage.setItem('ff_inactivity_timeout_min', '2')
      const ms = authService.getInactivityTimeoutMs()
      expect(ms).toBe(5 * 60 * 1000)
    })

    it('clamps above 60 minutes', () => {
      localStorage.setItem('ff_inactivity_timeout_min', '120')
      const ms = authService.getInactivityTimeoutMs()
      expect(ms).toBe(60 * 60 * 1000)
    })
  })

  describe('local handling labels', () => {
    it('updateUser can set risky-user and blacklist labels', async () => {
      const created = await authService.createUser({ username: 'flagged-user', password: 'password123' })
      const updated = await authService.updateUser(
        created.userId,
        { isRiskTagged: true, isBlacklisted: true },
        created.userId
      )

      expect(updated.isRiskTagged).toBe(true)
      expect(updated.isBlacklisted).toBe(true)
    })
  })
})
