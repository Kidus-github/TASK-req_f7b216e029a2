import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const useMock = vi.fn()
const mountMock = vi.fn()
const createPiniaMock = vi.fn(() => ({ id: 'pinia' }))
const addEventListenerMock = vi.fn()
const registerMock = vi.fn(() => Promise.resolve())

vi.mock('vue', () => ({
  createApp: vi.fn(() => ({
    use: useMock.mockReturnThis(),
    mount: mountMock,
  })),
}))

vi.mock('pinia', () => ({
  createPinia: createPiniaMock,
}))

vi.mock('../src/App.vue', () => ({
  default: { name: 'AppStub' },
}))

vi.mock('../src/router', () => ({
  default: { name: 'RouterStub' },
}))

beforeEach(() => {
  vi.resetModules()
  useMock.mockClear()
  mountMock.mockClear()
  createPiniaMock.mockClear()
  addEventListenerMock.mockClear()
  registerMock.mockClear()
})

afterEach(() => {
  delete globalThis.window
  delete globalThis.navigator
})

describe('main entry', () => {
  it('registers the service worker on window load when supported', async () => {
    globalThis.window = { addEventListener: addEventListenerMock }
    globalThis.navigator = {
      serviceWorker: {
        register: registerMock,
      },
    }

    const { registerServiceWorker } = await import('../src/main.js')

    expect(addEventListenerMock).toHaveBeenCalledWith('load', expect.any(Function))
    const loadHandler = addEventListenerMock.mock.calls[0][1]
    await loadHandler()

    expect(registerMock).toHaveBeenCalledWith('./sw.js')

    const fakeNav = { serviceWorker: { register: registerMock } }
    const fakeWin = { addEventListener: addEventListenerMock }
    registerServiceWorker(fakeNav, fakeWin)
    expect(addEventListenerMock).toHaveBeenCalledTimes(2)
  })
})
