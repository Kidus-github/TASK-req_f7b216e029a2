import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'

// These tests exercise the real bootstrap flow. We avoid stubbing Vue, Pinia,
// or the router — instead we provide a real DOM mount point and let main.js
// wire everything together. Only the service-worker surface is spied/faked
// because jsdom has no service-worker runtime.
//
// main.js invokes `bootstrapApplication()` at module load time as a top-level
// side effect. We await that single invocation (by polling for the seeded
// demo user) and then assert against the real Pinia + router + IndexedDB
// state that bootstrap produced. This keeps the test close to production
// behaviour without doubling up on bootstrap work.

async function clearDB() {
  const { getDB } = await import('@/db/schema')
  const db = await getDB()
  for (const name of Array.from(db.objectStoreNames)) {
    const tx = db.transaction(name, 'readwrite')
    await tx.store.clear()
    await tx.done
  }
}

function createMountTarget() {
  document.body.innerHTML = ''
  const root = document.createElement('div')
  root.id = 'app'
  document.body.appendChild(root)
  return root
}

async function waitFor(predicate, { timeoutMs = 8000 } = {}) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return true
    await new Promise((r) => setTimeout(r, 20))
  }
  return false
}

beforeEach(async () => {
  localStorage.clear()
  await clearDB()
  vi.resetModules()
})

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('main entry bootstrap (real Vue + Pinia + router)', () => {
  it('auto-bootstrap on import seeds the demo user, mounts a real Vue app, and wires Pinia + router', async () => {
    createMountTarget()

    // Importing main.js triggers the fire-and-forget bootstrap.
    await import('@/main.js')

    // Wait for demo seeding to finish.
    const { authService } = await import('@/services/authService')
    const seeded = await waitFor(async () => {
      try {
        const result = await authService.login('demo.author', 'DemoPass123!')
        return !!result.user
      } catch {
        return false
      }
    })
    expect(seeded).toBe(true)

    // Real Pinia wiring — stores hydrate without manual setActivePinia.
    const { useAuthStore } = await import('@/stores/auth')
    const auth = useAuthStore()
    // The bootstrap did not log anyone in; the store is present with a null user.
    expect(auth).toBeTruthy()

    // Real router wiring — pushing to /login lands on the Login route.
    const routerMod = await import('@/router')
    const router = routerMod.default
    await router.push('/login')
    await router.isReady()
    expect(router.currentRoute.value.name).toBe('Login')

    // The real mount target received Vue-rendered content.
    const mountRoot = document.getElementById('app')
    expect(mountRoot).toBeTruthy()
    expect(mountRoot.querySelector('.app-layout')).toBeTruthy()
  })

  it('registerServiceWorker attaches a load handler that invokes navigator.serviceWorker.register', async () => {
    const register = vi.fn(() => Promise.resolve())
    const addEventListener = vi.fn()
    const fakeNav = { serviceWorker: { register } }
    const fakeWin = { addEventListener }

    const { registerServiceWorker } = await import('@/main.js')
    registerServiceWorker(fakeNav, fakeWin)

    expect(addEventListener).toHaveBeenCalledTimes(1)
    const [event, handler] = addEventListener.mock.calls[0]
    expect(event).toBe('load')
    expect(typeof handler).toBe('function')

    await handler()
    expect(register).toHaveBeenCalledWith('./sw.js')
  })

  it('registerServiceWorker is a no-op when the navigator has no serviceWorker property', async () => {
    const addEventListener = vi.fn()
    const fakeNav = {}
    const fakeWin = { addEventListener }

    const { registerServiceWorker } = await import('@/main.js')
    registerServiceWorker(fakeNav, fakeWin)

    expect(addEventListener).not.toHaveBeenCalled()
  })

  it('registerServiceWorker swallows registration failures so bootstrap is resilient', async () => {
    const register = vi.fn(() => Promise.reject(new Error('no sw in test')))
    const addEventListener = vi.fn()
    const fakeNav = { serviceWorker: { register } }
    const fakeWin = { addEventListener }

    const { registerServiceWorker } = await import('@/main.js')
    registerServiceWorker(fakeNav, fakeWin)

    const [, handler] = addEventListener.mock.calls[0]
    expect(() => handler()).not.toThrow()
    await new Promise((r) => setTimeout(r, 10))
    expect(register).toHaveBeenCalled()
  })

  it('registerServiceWorker registers immediately when the document is already loaded', async () => {
    // bootstrapApplication awaits async work, so by the time registerServiceWorker
    // runs the window load event has often already fired. In that case we
    // register synchronously rather than attaching a listener that never runs.
    const register = vi.fn(() => Promise.resolve())
    const addEventListener = vi.fn()
    const fakeNav = { serviceWorker: { register } }
    const fakeWin = { addEventListener, document: { readyState: 'complete' } }

    const { registerServiceWorker } = await import('@/main.js')
    registerServiceWorker(fakeNav, fakeWin)

    expect(addEventListener).not.toHaveBeenCalled()
    expect(register).toHaveBeenCalledWith('./sw.js')
  })

  it('bootstrapApplication exposed as a function returns a real Vue app that can be unmounted', async () => {
    createMountTarget()
    const mod = await import('@/main.js')
    // Wait for the auto-bootstrap first so the demo seeding is idempotent
    const { authService } = await import('@/services/authService')
    await waitFor(async () => {
      try {
        await authService.login('demo.author', 'DemoPass123!')
        return true
      } catch { return false }
    })

    // Remount onto a fresh host node so this test exercises the exported
    // bootstrap function without reusing the auto-bootstrapped container.
    createMountTarget()
    const app = await mod.bootstrapApplication()
    expect(typeof app.unmount).toBe('function')
    expect(typeof app.use).toBe('function')
    app.unmount()
  })

  it('logs bootstrap failures from the top-level auto-bootstrap catch path', async () => {
    const failure = new Error('seed failed in test')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.doMock('@/services/demoSeedService', () => ({
      ensureDemoSeeded: vi.fn().mockRejectedValue(failure),
    }))

    await import('@/main.js')

    const logged = await waitFor(() => errorSpy.mock.calls.length > 0)
    expect(logged).toBe(true)
    expect(errorSpy).toHaveBeenCalledWith('Failed to bootstrap FlowForge.', failure)

    vi.doUnmock('@/services/demoSeedService')
  })
})
