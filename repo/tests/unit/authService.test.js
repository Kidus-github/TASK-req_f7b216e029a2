import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { authService } from '@/services/authService'

beforeEach(async () => {
  const { getDB } = await import('@/db/schema')
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
      const { getDB } = await import('@/db/schema')
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

  describe('rehydrateSession', () => {
    it('returns user+session for an active (non-ended) session', async () => {
      await authService.createUser({ username: 'rehyd-svc-user', password: 'StrongPass123' })
      const result = await authService.login('rehyd-svc-user', 'StrongPass123')
      const restored = await authService.rehydrateSession(result.session.sessionId)
      expect(restored).toBeTruthy()
      expect(restored.user.username).toBe('rehyd-svc-user')
      expect(restored.session.sessionId).toBe(result.session.sessionId)
    })

    it('returns null when called without a session id', async () => {
      expect(await authService.rehydrateSession(null)).toBeNull()
      expect(await authService.rehydrateSession('')).toBeNull()
    })

    it('returns null after the session has been ended via logout', async () => {
      await authService.createUser({ username: 'rehyd-end-user', password: 'StrongPass123' })
      const result = await authService.login('rehyd-end-user', 'StrongPass123')
      await authService.logout(result.session.sessionId, result.user.userId)
      const restored = await authService.rehydrateSession(result.session.sessionId)
      expect(restored).toBeNull()
    })

    it('returns null when the stored session id no longer exists', async () => {
      const restored = await authService.rehydrateSession('not-a-real-session')
      expect(restored).toBeNull()
    })
  })
})
