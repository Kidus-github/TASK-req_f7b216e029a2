import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { authService } from '../src/services/authService'

beforeEach(async () => {
  const { getDB } = await import('../src/db/schema')
  const db = await getDB()
  for (const store of ['users', 'sessions', 'auditEvents']) {
    try {
      const tx = db.transaction(store, 'readwrite')
      await tx.store.clear()
      await tx.done
    } catch { /* */ }
  }
})

describe('blacklist is a non-security local handling label', () => {
  it('blacklisted user can log in normally', async () => {
    const user = await authService.createUser({ username: 'flagged', password: 'password123' })
    await authService.updateUser(user.userId, { isBlacklisted: true }, user.userId)

    // Login must succeed despite blacklist label
    const result = await authService.login('flagged', 'password123')
    expect(result.user.userId).toBe(user.userId)
    expect(result.session.sessionId).toBeTruthy()
    expect(result.encryptionKey).toBeTruthy()
  })

  it('blacklisted user can unlock a locked session', async () => {
    const user = await authService.createUser({ username: 'locked-bl', password: 'password123' })
    const loginResult = await authService.login('locked-bl', 'password123')
    await authService.updateUser(user.userId, { isBlacklisted: true }, user.userId)
    await authService.lockSession(loginResult.session.sessionId)

    // Unlock must succeed despite blacklist label
    const unlockResult = await authService.unlockSession(
      loginResult.session.sessionId,
      user.userId,
      'password123'
    )
    expect(unlockResult.session.lockedAt).toBeNull()
    expect(unlockResult.encryptionKey).toBeTruthy()
  })

  it('blacklisted user can register a new account', async () => {
    // First create and blacklist a user
    const user1 = await authService.createUser({ username: 'existing', password: 'password123' })
    await authService.updateUser(user1.userId, { isBlacklisted: true }, user1.userId)

    // A new registration should work regardless of other users blacklist state
    const user2 = await authService.createUser({ username: 'newuser', password: 'password456' })
    expect(user2.userId).toBeTruthy()
  })

  it('blacklist label is stored on the user record', async () => {
    const user = await authService.createUser({ username: 'labeled', password: 'password123' })
    expect(user.isBlacklisted).toBe(false)

    const updated = await authService.updateUser(user.userId, { isBlacklisted: true }, user.userId)
    expect(updated.isBlacklisted).toBe(true)

    const fetched = await authService.getUser(user.userId)
    expect(fetched.isBlacklisted).toBe(true)
  })

  it('blacklist label can be toggled off', async () => {
    const user = await authService.createUser({ username: 'toggle', password: 'password123' })
    await authService.updateUser(user.userId, { isBlacklisted: true }, user.userId)
    const cleared = await authService.updateUser(user.userId, { isBlacklisted: false }, user.userId)
    expect(cleared.isBlacklisted).toBe(false)
  })

  it('login does not contain suspension error for blacklisted user', async () => {
    const user = await authService.createUser({ username: 'noblock', password: 'password123' })
    await authService.updateUser(user.userId, { isBlacklisted: true }, user.userId)

    // Should NOT throw any error
    const result = await authService.login('noblock', 'password123')
    expect(result.user).toBeTruthy()
  })
})
