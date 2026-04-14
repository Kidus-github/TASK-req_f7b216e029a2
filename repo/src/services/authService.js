import { getDB, getTimestamp } from '@/db/schema'
import { generateId } from '@/utils/id'
import { maskDisplayName } from '@/utils/masks'
import { encryptionService } from './encryptionService'
import { auditService } from './auditService'

const LOCKOUT_ATTEMPTS = 5
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000
const LOCKOUT_DURATION_MS = 15 * 60 * 1000

export const authService = {
  async createUser({ username, password, realName, organization }) {
    const usernameError = validateUsernameFormat(username)
    if (usernameError) throw new Error(usernameError)

    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters.')
    }

    const db = await getDB()
    const usernameLower = username.trim().toLowerCase()

    const existing = await db.getFromIndex('users', 'by-username', usernameLower)
    if (existing) throw new Error('Username already exists.')

    const passwordSalt = encryptionService.generateSalt()
    const passwordHash = await encryptionService.hashPassword(password, passwordSalt)
    const encryptionSalt = encryptionService.generateSalt()
    const ts = getTimestamp()
    const masked = maskDisplayName(realName || username)

    const user = {
      userId: generateId(),
      username: username.trim(),
      usernameLower,
      passwordHash,
      passwordSalt,
      passwordKdfAlgorithm: 'PBKDF2-HMAC-SHA-256',
      passwordKdfIterations: encryptionService.PBKDF2_ITERATIONS,
      passwordHashVersion: 1,
      encryptionSalt,
      realName: realName || null,
      organization: organization || null,
      maskedDisplayName: masked,
      isRiskTagged: false,
      isBlacklisted: false,
      createdAt: ts.iso,
      updatedAt: ts.iso,
      lastLoginAt: null,
      failedLoginCount: 0,
      failedLoginWindowStart: null,
      lockedUntil: null,
      isDeleted: false,
    }

    await db.put('users', user)

    await auditService.log({
      entityType: 'user',
      entityId: user.userId,
      actionType: 'user_created',
      afterSummary: { username: user.username },
      actedByUserId: user.userId,
    })

    return sanitizeUser(user)
  },

  async login(username, password) {
    const db = await getDB()
    const usernameLower = username.trim().toLowerCase()
    const user = await db.getFromIndex('users', 'by-username', usernameLower)

    if (!user || user.isDeleted) {
      await auditService.log({
        entityType: 'user',
        entityId: null,
        actionType: 'login_failure',
        afterSummary: { reason: 'user_not_found' },
      })
      throw new Error('Invalid username or password.')
    }

    if (user.lockedUntil) {
      const lockEnd = new Date(user.lockedUntil).getTime()
      if (Date.now() < lockEnd) {
        const remainMs = lockEnd - Date.now()
        const remainMin = Math.ceil(remainMs / 60000)
        await auditService.log({
          entityType: 'user',
          entityId: user.userId,
          actionType: 'login_failure',
          afterSummary: { reason: 'account_locked' },
          actedByUserId: user.userId,
        })
        throw new Error(`Account is locked. Try again in ${remainMin} minute(s).`)
      }
      user.lockedUntil = null
      user.failedLoginCount = 0
      user.failedLoginWindowStart = null
    }

    const hash = await encryptionService.hashPassword(password, user.passwordSalt)
    const valid = encryptionService.constantTimeEqual(hash, user.passwordHash)

    if (!valid) {
      const now = Date.now()
      const windowStart = user.failedLoginWindowStart
        ? new Date(user.failedLoginWindowStart).getTime()
        : null

      if (!windowStart || now - windowStart > LOCKOUT_WINDOW_MS) {
        user.failedLoginCount = 1
        user.failedLoginWindowStart = new Date(now).toISOString()
      } else {
        user.failedLoginCount += 1
      }

      if (user.failedLoginCount >= LOCKOUT_ATTEMPTS) {
        user.lockedUntil = new Date(now + LOCKOUT_DURATION_MS).toISOString()
        await auditService.log({
          entityType: 'user',
          entityId: user.userId,
          actionType: 'account_locked',
          afterSummary: { failedAttempts: user.failedLoginCount },
          actedByUserId: user.userId,
        })
      }

      user.updatedAt = getTimestamp().iso
      await db.put('users', user)

      await auditService.log({
        entityType: 'user',
        entityId: user.userId,
        actionType: 'login_failure',
        afterSummary: { failedCount: user.failedLoginCount },
        actedByUserId: user.userId,
      })

      throw new Error('Invalid username or password.')
    }

    user.failedLoginCount = 0
    user.failedLoginWindowStart = null
    user.lockedUntil = null
    user.lastLoginAt = getTimestamp().iso
    user.updatedAt = user.lastLoginAt
    await db.put('users', user)

    const session = {
      sessionId: generateId(),
      userId: user.userId,
      startedAt: user.lastLoginAt,
      lastActivityAt: user.lastLoginAt,
      lockedAt: null,
      endedAt: null,
      terminationReason: null,
      activeTabIds: [],
    }
    await db.put('sessions', session)

    const encryptionKey = await encryptionService.deriveEncryptionKey(password, user.encryptionSalt)

    await auditService.log({
      entityType: 'user',
      entityId: user.userId,
      actionType: 'login_success',
      actedByUserId: user.userId,
    })

    return {
      user: sanitizeUser(user),
      session,
      encryptionKey,
    }
  },

  async logout(sessionId, userId) {
    const db = await getDB()
    const session = await db.get('sessions', sessionId)
    if (session && !session.endedAt) {
      session.endedAt = getTimestamp().iso
      session.terminationReason = 'logout'
      await db.put('sessions', session)
    }

    await auditService.log({
      entityType: 'user',
      entityId: userId,
      actionType: 'logout',
      actedByUserId: userId,
    })
  },

  async lockSession(sessionId) {
    const db = await getDB()
    const session = await db.get('sessions', sessionId)
    if (session && !session.endedAt && !session.lockedAt) {
      session.lockedAt = getTimestamp().iso
      await db.put('sessions', session)
    }
    return session
  },

  async unlockSession(sessionId, userId, password) {
    const db = await getDB()
    const user = await db.get('users', userId)
    if (!user || user.isDeleted) {
      throw new Error('Cannot unlock - account unavailable.')
    }

    const hash = await encryptionService.hashPassword(password, user.passwordSalt)
    const valid = encryptionService.constantTimeEqual(hash, user.passwordHash)
    if (!valid) throw new Error('Invalid password.')

    const session = await db.get('sessions', sessionId)
    if (session) {
      session.lockedAt = null
      session.lastActivityAt = getTimestamp().iso
      await db.put('sessions', session)
    }

    const encryptionKey = await encryptionService.deriveEncryptionKey(password, user.encryptionSalt)
    return { session, encryptionKey }
  },

  async touchSession(sessionId) {
    const db = await getDB()
    const session = await db.get('sessions', sessionId)
    if (session && !session.endedAt && !session.lockedAt) {
      session.lastActivityAt = getTimestamp().iso
      await db.put('sessions', session)
    }
  },

  async getUser(userId) {
    const db = await getDB()
    const user = await db.get('users', userId)
    return user && !user.isDeleted ? sanitizeUser(user) : null
  },

  async getAllUsers() {
    const db = await getDB()
    const all = await db.getAll('users')
    return all.filter((u) => !u.isDeleted).map(sanitizeUser)
  },

  async updateUser(userId, updates, actedByUserId) {
    const db = await getDB()
    const user = await db.get('users', userId)
    if (!user || user.isDeleted) throw new Error('User not found.')

    const before = {
      realName: user.realName,
      organization: user.organization,
      isRiskTagged: user.isRiskTagged,
      isBlacklisted: user.isBlacklisted,
    }

    if (updates.realName !== undefined) {
      user.realName = updates.realName
      user.maskedDisplayName = maskDisplayName(updates.realName || user.username)
    }
    if (updates.organization !== undefined) user.organization = updates.organization
    if (updates.isRiskTagged !== undefined) user.isRiskTagged = !!updates.isRiskTagged
    if (updates.isBlacklisted !== undefined) user.isBlacklisted = !!updates.isBlacklisted

    user.updatedAt = getTimestamp().iso
    await db.put('users', user)

    await auditService.log({
      entityType: 'user',
      entityId: userId,
      actionType: 'user_updated',
      beforeSummary: before,
      afterSummary: {
        realName: user.realName,
        organization: user.organization,
        isRiskTagged: user.isRiskTagged,
        isBlacklisted: user.isBlacklisted,
      },
      actedByUserId,
    })

    return sanitizeUser(user)
  },

  async changePassword(userId, currentPassword, newPassword) {
    if (!newPassword || newPassword.length < 8) {
      throw new Error('New password must be at least 8 characters.')
    }
    const db = await getDB()
    const user = await db.get('users', userId)
    if (!user || user.isDeleted) throw new Error('User not found.')

    const hash = await encryptionService.hashPassword(currentPassword, user.passwordSalt)
    if (!encryptionService.constantTimeEqual(hash, user.passwordHash)) {
      throw new Error('Current password is incorrect.')
    }

    const newSalt = encryptionService.generateSalt()
    const newHash = await encryptionService.hashPassword(newPassword, newSalt)
    const newEncSalt = encryptionService.generateSalt()

    user.passwordHash = newHash
    user.passwordSalt = newSalt
    user.encryptionSalt = newEncSalt
    user.passwordHashVersion += 1
    user.updatedAt = getTimestamp().iso
    await db.put('users', user)

    await auditService.log({
      entityType: 'user',
      entityId: userId,
      actionType: 'password_changed',
      actedByUserId: userId,
    })
  },

  getInactivityTimeoutMs() {
    const stored = localStorage.getItem('ff_inactivity_timeout_min')
    const min = stored ? parseInt(stored, 10) : 30
    const clamped = Math.max(5, Math.min(60, isNaN(min) ? 30 : min))
    return clamped * 60 * 1000
  },
}

function validateUsernameFormat(username) {
  if (!username || typeof username !== 'string') return 'Username is required.'
  const trimmed = username.trim()
  if (trimmed.length < 3) return 'Username must be at least 3 characters.'
  if (trimmed.length > 50) return 'Username must be at most 50 characters.'
  return null
}

function sanitizeUser(user) {
  const { passwordHash, passwordSalt, encryptionSalt, failedLoginWindowStart, ...safe } = user
  return safe
}
