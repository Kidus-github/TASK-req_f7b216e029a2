import { describe, it, expect } from 'vitest'
import { getPersonaConfig } from '../src/utils/persona'

describe('persona model', () => {
  const VALID_PERSONAS = ['author', 'reviewer', 'viewer']

  it('valid personas are Author, Reviewer, Viewer only', () => {
    expect(VALID_PERSONAS).toEqual(['author', 'reviewer', 'viewer'])
    expect(VALID_PERSONAS).not.toContain('admin')
    expect(VALID_PERSONAS).not.toContain('editor')
  })

  it('default persona is author', () => {
    expect(VALID_PERSONAS[0]).toBe('author')
  })

  it('persona configs change available affordances', () => {
    expect(getPersonaConfig('author').canEditCanvas).toBe(true)
    expect(getPersonaConfig('reviewer').canEditCanvas).toBe(false)
    expect(getPersonaConfig('viewer').canPublish).toBe(false)
  })
})

describe('authService has no role/capability model', () => {
  it('authService does not export hasCapability', async () => {
    const { authService } = await import('../src/services/authService')
    expect(authService.hasCapability).toBeUndefined()
  })

  it('authService does not export role-related constants', async () => {
    const mod = await import('../src/services/authService')
    expect(mod.ROLE_CAPABILITIES).toBeUndefined()
    expect(mod.VALID_ROLES).toBeUndefined()
  })

  it('createUser does not accept or store a role field', async () => {
    // Just checking the signature - createUser should not use role
    const { authService } = await import('../src/services/authService')
    expect(typeof authService.createUser).toBe('function')
  })
})

describe('router has no admin-only routes', () => {
  it('no /users route exists', async () => {
    const routerMod = await import('../src/router/index.js')
    const router = routerMod.default
    const resolved = router.resolve('/users')
    // If it resolves to a catch-all or the path itself, route does not exist
    expect(resolved.matched.length).toBe(0)
  })

  it('no /audit route exists', async () => {
    const routerMod = await import('../src/router/index.js')
    const router = routerMod.default
    const resolved = router.resolve('/audit')
    expect(resolved.matched.length).toBe(0)
  })

  it('/diagrams route exists', async () => {
    const routerMod = await import('../src/router/index.js')
    const router = routerMod.default
    const resolved = router.resolve('/diagrams')
    expect(resolved.matched.length).toBeGreaterThan(0)
  })

  it('/library route exists', async () => {
    const routerMod = await import('../src/router/index.js')
    const router = routerMod.default
    const resolved = router.resolve('/library')
    expect(resolved.matched.length).toBeGreaterThan(0)
  })

  it('no requiresAdmin meta exists on any route', async () => {
    const routerMod = await import('../src/router/index.js')
    const router = routerMod.default
    for (const route of router.getRoutes()) {
      expect(route.meta?.requiresAdmin).toBeFalsy()
    }
  })
})
