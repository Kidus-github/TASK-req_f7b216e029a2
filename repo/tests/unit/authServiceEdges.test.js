import { beforeEach, describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { authService } from '@/services/authService'

async function clearDB() {
  const { getDB } = await import('@/db/schema')
  const db = await getDB()
  for (const name of Array.from(db.objectStoreNames)) {
    const tx = db.transaction(name, 'readwrite')
    await tx.store.clear()
    await tx.done
  }
}

beforeEach(async () => {
  localStorage.clear()
  await clearDB()
})

describe('authService validation paths', () => {
  it('rejects missing usernames', async () => {
    await expect(
      authService.createUser({ username: '', password: 'StrongPass123' })
    ).rejects.toThrow('Username is required.')
  })

  it('rejects too-short usernames', async () => {
    await expect(
      authService.createUser({ username: 'ab', password: 'StrongPass123' })
    ).rejects.toThrow('Username must be at least 3 characters.')
  })

  it('rejects too-long usernames', async () => {
    await expect(
      authService.createUser({ username: 'x'.repeat(60), password: 'StrongPass123' })
    ).rejects.toThrow('Username must be at most 50 characters.')
  })

  it('rejects too-short passwords', async () => {
    await expect(
      authService.createUser({ username: 'good', password: 'short' })
    ).rejects.toThrow('Password must be at least 8 characters.')
  })

  it('rejects duplicate usernames (case-insensitive)', async () => {
    await authService.createUser({ username: 'Alice', password: 'StrongPass123' })
    await expect(
      authService.createUser({ username: 'alice', password: 'StrongPass123' })
    ).rejects.toThrow('Username already exists.')
  })

  it('login throws "Invalid username or password" when user does not exist', async () => {
    await expect(authService.login('ghost', 'whatever')).rejects.toThrow('Invalid username or password.')
  })

  it('changePassword throws when current password is wrong', async () => {
    const user = await authService.createUser({ username: 'cpx', password: 'StrongPass123', realName: 'C' })
    await expect(
      authService.changePassword(user.userId, 'WRONGpass1', 'NewStrong1234')
    ).rejects.toThrow('Current password is incorrect.')
  })

  it('changePassword rejects too-short new passwords', async () => {
    const user = await authService.createUser({ username: 'cp2x', password: 'StrongPass123', realName: 'C' })
    await expect(
      authService.changePassword(user.userId, 'StrongPass123', 'short')
    ).rejects.toThrow('New password must be at least 8 characters.')
  })

  it('changePassword updates hash on success', async () => {
    const user = await authService.createUser({ username: 'cp3x', password: 'StrongPass123', realName: 'C' })
    await authService.changePassword(user.userId, 'StrongPass123', 'NewStrong1234')
    await expect(authService.login('cp3x', 'StrongPass123')).rejects.toThrow('Invalid username or password.')
    const result = await authService.login('cp3x', 'NewStrong1234')
    expect(result.user.username).toBe('cp3x')
  })

  it('updateUser persists tag flags and updates the masked display name', async () => {
    const user = await authService.createUser({
      username: 'uuser', password: 'StrongPass123', realName: 'Original Name',
    })
    const updated = await authService.updateUser(user.userId, {
      realName: 'New Real Name',
      organization: 'Acme',
      isRiskTagged: true,
      isBlacklisted: true,
    }, user.userId)
    expect(updated.realName).toBe('New Real Name')
    expect(updated.organization).toBe('Acme')
    expect(updated.isRiskTagged).toBe(true)
    expect(updated.isBlacklisted).toBe(true)
    expect(updated.maskedDisplayName).toMatch(/[*]/)
  })

  it('updateUser throws when user is missing', async () => {
    await expect(authService.updateUser('nope', { realName: 'x' }, 'me')).rejects.toThrow('User not found.')
  })

  it('getUser returns null for unknown id', async () => {
    expect(await authService.getUser('nope')).toBeNull()
  })

  it('getAllUsers returns sanitized records, excluding deleted ones', async () => {
    await authService.createUser({ username: 'usr1', password: 'StrongPass123' })
    await authService.createUser({ username: 'usr2', password: 'StrongPass123' })
    const list = await authService.getAllUsers()
    expect(list.map((u) => u.username).sort()).toEqual(['usr1', 'usr2'])
    expect(list[0]).not.toHaveProperty('passwordHash')
    expect(list[0]).not.toHaveProperty('passwordSalt')
  })

  it('lockSession marks an active session as locked', async () => {
    const user = await authService.createUser({ username: 'lsuser', password: 'StrongPass123' })
    const { session } = await authService.login('lsuser', 'StrongPass123')
    const locked = await authService.lockSession(session.sessionId)
    expect(locked.lockedAt).toBeTruthy()
  })

  it('unlockSession with wrong password throws Invalid password', async () => {
    const user = await authService.createUser({ username: 'ususer', password: 'StrongPass123' })
    const { session } = await authService.login('ususer', 'StrongPass123')
    await authService.lockSession(session.sessionId)
    await expect(
      authService.unlockSession(session.sessionId, user.userId, 'wrong-password')
    ).rejects.toThrow('Invalid password.')
  })

  it('getInactivityTimeoutMs clamps minute values to [5,60]', () => {
    localStorage.setItem('ff_inactivity_timeout_min', '1')
    expect(authService.getInactivityTimeoutMs()).toBe(5 * 60 * 1000)
    localStorage.setItem('ff_inactivity_timeout_min', '120')
    expect(authService.getInactivityTimeoutMs()).toBe(60 * 60 * 1000)
    localStorage.setItem('ff_inactivity_timeout_min', '15')
    expect(authService.getInactivityTimeoutMs()).toBe(15 * 60 * 1000)
  })

  it('getInactivityTimeoutMs falls back to 30 minutes when unset', () => {
    localStorage.removeItem('ff_inactivity_timeout_min')
    expect(authService.getInactivityTimeoutMs()).toBe(30 * 60 * 1000)
  })
})
