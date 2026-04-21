/**
 * Direct unit tests for public/sw.js
 *
 * The service worker runs in its own browser context and cannot be imported
 * with the normal module system.  We use Node's vm.runInNewContext to evaluate
 * the real file inside a sandbox that provides all the globals the SW expects
 * (self, caches, fetch).  Every handler — install, activate, and fetch — is
 * exercised against fake-but-faithful implementations so the tests reflect the
 * actual cache-first strategy, version cleanup, and network fallback logic.
 *
 * Nothing here is mocked at the service boundary; we call the real source.
 */

import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'

// Always read from the live file so any change to public/sw.js is automatically
// reflected in these tests without any manual update.
const SW_SOURCE = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal fake Service Worker environment for vm.runInNewContext.
 *
 * Returns:
 *   self       – fake global `self` with addEventListener / skipWaiting / clients
 *   caches     – fake global `caches` with open / match / keys / delete
 *   listeners  – Map<eventName, handler> populated when the SW calls self.addEventListener
 *   networkFetch – vi.fn() to control what the SW gets when it calls fetch()
 */
function buildSWContext({ networkFetch = vi.fn() } = {}) {
  // Per-cache-name store of { key → response } maps.
  const cacheInstances = new Map()

  function getOrCreateCache(name) {
    if (!cacheInstances.has(name)) {
      const store = new Map()
      cacheInstances.set(name, {
        _store: store,
        addAll: vi.fn(async (urls) => {
          for (const url of urls) store.set(url, { _preloaded: true, url })
        }),
        put: vi.fn(async (req, res) => {
          const key = typeof req === 'string' ? req : req.url
          store.set(key, res)
        }),
        match: vi.fn(async (req) => {
          const key = typeof req === 'string' ? req : req.url
          return store.get(key)
        }),
      })
    }
    return cacheInstances.get(name)
  }

  const cachesApi = {
    _instances: cacheInstances,
    open: vi.fn(async (name) => getOrCreateCache(name)),
    match: vi.fn(async (req) => {
      for (const cache of cacheInstances.values()) {
        const key = typeof req === 'string' ? req : req.url
        const hit = cache._store.get(key)
        if (hit !== undefined) return hit
      }
      return undefined
    }),
    keys: vi.fn(async () => [...cacheInstances.keys()]),
    delete: vi.fn(async (name) => {
      cacheInstances.delete(name)
      return true
    }),
  }

  const listeners = new Map()
  const selfApi = {
    addEventListener: vi.fn((event, handler) => listeners.set(event, handler)),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
  }

  // Evaluate the real SW source in a sandboxed context.  The context object
  // provides the globals the SW references as free variables.
  runInNewContext(SW_SOURCE, {
    self: selfApi,
    caches: cachesApi,
    fetch: networkFetch,
    // Pass the host Promise so .then/.catch chains work with our async mocks.
    Promise,
  })

  return { self: selfApi, caches: cachesApi, listeners, networkFetch }
}

// Fire an event whose handler calls event.waitUntil(p) and await all promises.
async function fireWaitUntilEvent(listeners, eventName) {
  const handler = listeners.get(eventName)
  if (!handler) throw new Error(`No '${eventName}' listener registered`)
  const pending = []
  handler({ waitUntil: (p) => pending.push(p) })
  await Promise.all(pending)
}

// Fire the fetch event and return the promise passed to event.respondWith
// (or null when the handler does an early return for non-GET requests).
function fireFetchEvent(listeners, request) {
  const handler = listeners.get('fetch')
  if (!handler) throw new Error('No fetch listener registered')
  let responsePromise = null
  handler({
    request,
    respondWith: (p) => { responsePromise = p },
  })
  return responsePromise
}

// Wait one microtask/macro-task turn so any floating promise (the cache.put
// inside fetch) has time to resolve before we assert on mock calls.
async function flush() {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
}

// ---------------------------------------------------------------------------
// install event
// ---------------------------------------------------------------------------

describe('sw.js — install event', () => {
  it('opens the versioned cache and pre-caches all static assets', async () => {
    const { caches, listeners } = buildSWContext()
    await fireWaitUntilEvent(listeners, 'install')

    expect(caches.open).toHaveBeenCalledWith('flowforge-v1')
    const cache = caches._instances.get('flowforge-v1')
    expect(cache).toBeTruthy()
    expect(cache.addAll).toHaveBeenCalledWith(['./', './index.html'])
  })

  it('calls skipWaiting so the SW takes control without waiting for existing clients', async () => {
    const { self, listeners } = buildSWContext()
    await fireWaitUntilEvent(listeners, 'install')
    expect(self.skipWaiting).toHaveBeenCalledOnce()
  })

  it('pre-populated entries appear in the cache store after install', async () => {
    const { caches, listeners } = buildSWContext()
    await fireWaitUntilEvent(listeners, 'install')

    const cache = caches._instances.get('flowforge-v1')
    expect(cache._store.size).toBe(2)
    expect(cache._store.has('./')).toBe(true)
    expect(cache._store.has('./index.html')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// activate event
// ---------------------------------------------------------------------------

describe('sw.js — activate event', () => {
  it('deletes every cache whose name does not match the current version', async () => {
    const { caches, listeners } = buildSWContext()
    // Pre-create stale caches before running the SW activate handler.
    for (const name of ['flowforge-v0', 'app-shell-beta', 'runtime-cache']) {
      caches._instances.set(name, {
        _store: new Map(),
        addAll: vi.fn(), put: vi.fn(), match: vi.fn(async () => undefined),
      })
    }
    caches._instances.set('flowforge-v1', {
      _store: new Map(),
      addAll: vi.fn(), put: vi.fn(), match: vi.fn(async () => undefined),
    })
    caches.keys = vi.fn(async () =>
      ['flowforge-v0', 'app-shell-beta', 'runtime-cache', 'flowforge-v1'])

    await fireWaitUntilEvent(listeners, 'activate')

    expect(caches.delete).toHaveBeenCalledWith('flowforge-v0')
    expect(caches.delete).toHaveBeenCalledWith('app-shell-beta')
    expect(caches.delete).toHaveBeenCalledWith('runtime-cache')
    expect(caches.delete).not.toHaveBeenCalledWith('flowforge-v1')
  })

  it('calls clients.claim() to take immediate control of uncontrolled pages', async () => {
    const { self, listeners } = buildSWContext()
    await fireWaitUntilEvent(listeners, 'activate')
    expect(self.clients.claim).toHaveBeenCalledOnce()
  })

  it('succeeds gracefully when no stale caches exist', async () => {
    const { caches, listeners } = buildSWContext()
    caches.keys = vi.fn(async () => ['flowforge-v1'])

    await expect(fireWaitUntilEvent(listeners, 'activate')).resolves.not.toThrow()
    expect(caches.delete).not.toHaveBeenCalled()
    expect(caches._instances.size).toBe(0) // no extra caches created
  })

  it('preserves the current cache when multiple old caches are present', async () => {
    const { caches, listeners } = buildSWContext()
    caches.keys = vi.fn(async () => ['flowforge-v1', 'flowforge-v2', 'flowforge-v0'])
    // Only flowforge-v1 should survive — the SW's CACHE_NAME constant.
    await fireWaitUntilEvent(listeners, 'activate')

    expect(caches.delete).toHaveBeenCalledWith('flowforge-v2')
    expect(caches.delete).toHaveBeenCalledWith('flowforge-v0')
    expect(caches.delete).not.toHaveBeenCalledWith('flowforge-v1')
  })
})

// ---------------------------------------------------------------------------
// fetch event — cache-first strategy
// ---------------------------------------------------------------------------

describe('sw.js — fetch event', () => {
  it('returns the cached entry without making a network request on a cache hit', async () => {
    const { caches, listeners, networkFetch } = buildSWContext()
    const cachedEntry = { _fromCache: true, url: './index.html' }
    caches.match = vi.fn(async () => cachedEntry)

    const response = await fireFetchEvent(listeners, { method: 'GET', url: './index.html' })

    expect(response).toBe(cachedEntry)
    expect(networkFetch).not.toHaveBeenCalled()
  })

  it('fetches from the network when the cache has no match', async () => {
    const networkResponse = {
      ok: true,
      type: 'basic',
      url: '/assets/index.js',
      clone: vi.fn(function () { return { ...this, _clone: true } }),
    }
    const { caches, listeners, networkFetch } = buildSWContext()
    caches.match = vi.fn(async () => undefined)
    networkFetch.mockResolvedValue(networkResponse)

    const response = await fireFetchEvent(listeners, { method: 'GET', url: '/assets/index.js' })

    expect(networkFetch).toHaveBeenCalledWith({ method: 'GET', url: '/assets/index.js' })
    expect(response).toBe(networkResponse)
  })

  it('caches a cloned copy of a successful same-origin (basic) network response', async () => {
    const cloned = { _clone: true, url: '/page' }
    const networkResponse = {
      ok: true,
      type: 'basic',
      url: '/page',
      clone: vi.fn(() => cloned),
    }
    const { caches, listeners, networkFetch } = buildSWContext()
    caches.match = vi.fn(async () => undefined)
    networkFetch.mockResolvedValue(networkResponse)

    await fireFetchEvent(listeners, { method: 'GET', url: '/page' })
    await flush()

    // The floating caches.open().then(cache.put()) should have run by now.
    expect(caches.open).toHaveBeenCalledWith('flowforge-v1')
    const cache = caches._instances.get('flowforge-v1')
    expect(cache).toBeTruthy()
    expect(cache.put).toHaveBeenCalled()
    const [, storedResponse] = cache.put.mock.calls[0]
    expect(storedResponse).toBe(cloned)
  })

  it('does not cache an opaque (cross-origin) response even when status is ok', async () => {
    const opaqueResponse = {
      ok: true,
      type: 'opaque',
      url: 'https://cdn.example.com/lib.js',
      clone: vi.fn(),
    }
    const { caches, listeners, networkFetch } = buildSWContext()
    caches.match = vi.fn(async () => undefined)
    networkFetch.mockResolvedValue(opaqueResponse)

    await fireFetchEvent(listeners, { method: 'GET', url: 'https://cdn.example.com/lib.js' })
    await flush()

    // No cache instance should have received a put call.
    for (const cache of caches._instances.values()) {
      expect(cache.put).not.toHaveBeenCalled()
    }
    // Clone was never requested because the caching branch was not entered.
    expect(opaqueResponse.clone).not.toHaveBeenCalled()
  })

  it('does not cache an HTTP error response (ok=false)', async () => {
    const errorResponse = {
      ok: false,
      type: 'basic',
      status: 404,
      url: '/missing',
      clone: vi.fn(),
    }
    const { caches, listeners, networkFetch } = buildSWContext()
    caches.match = vi.fn(async () => undefined)
    networkFetch.mockResolvedValue(errorResponse)

    const response = await fireFetchEvent(listeners, { method: 'GET', url: '/missing' })
    await flush()

    // The response is still forwarded to the page even though it's not cached.
    expect(response).toBe(errorResponse)
    for (const cache of caches._instances.values()) {
      expect(cache.put).not.toHaveBeenCalled()
    }
  })

  it('returns null (respondWith never called) for non-GET requests', async () => {
    const { listeners, networkFetch } = buildSWContext()

    const responsePromise = fireFetchEvent(listeners, { method: 'POST', url: '/api/save' })

    // The handler early-returns without calling event.respondWith.
    expect(responsePromise).toBeNull()
    expect(networkFetch).not.toHaveBeenCalled()
  })

  it('handles DELETE and PUT methods with the same early-return behavior', async () => {
    const { listeners, networkFetch } = buildSWContext()

    for (const method of ['DELETE', 'PUT', 'PATCH']) {
      const result = fireFetchEvent(listeners, { method, url: '/api/resource' })
      expect(result).toBeNull()
    }
    expect(networkFetch).not.toHaveBeenCalled()
  })

  it('returns undefined when both cache miss and network fail', async () => {
    const { caches, listeners, networkFetch } = buildSWContext()
    caches.match = vi.fn(async () => undefined)
    networkFetch.mockRejectedValue(new Error('offline'))

    const response = await fireFetchEvent(listeners, { method: 'GET', url: '/page' })

    // .catch(() => cached) where cached is undefined
    expect(response).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Handler registration (meta — ensure addEventListener is wired correctly)
// ---------------------------------------------------------------------------

describe('sw.js — event listener registration', () => {
  it('registers exactly three event listeners: install, activate, fetch', () => {
    const { listeners } = buildSWContext()
    expect(listeners.has('install')).toBe(true)
    expect(listeners.has('activate')).toBe(true)
    expect(listeners.has('fetch')).toBe(true)
    expect(listeners.size).toBe(3)
  })

  it('all registered handlers are functions', () => {
    const { listeners } = buildSWContext()
    for (const [, handler] of listeners) {
      expect(typeof handler).toBe('function')
    }
  })
})
