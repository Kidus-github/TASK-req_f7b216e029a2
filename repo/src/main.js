import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { ensureDemoSeeded } from '@/services/demoSeedService'
import { useAuthStore } from '@/stores/auth'
import './style.css'

export function registerServiceWorker(nav = navigator, win = window) {
  if (!('serviceWorker' in nav)) return

  const register = () => {
    nav.serviceWorker.register('./sw.js').catch(() => {
      // Service Worker registration failed. App will still work in current session.
    })
  }

  // bootstrapApplication awaits async work before reaching here, so the window's
  // 'load' event has often already fired — adding a listener afterwards would
  // never run. Register immediately when the document is already complete.
  if (win.document && win.document.readyState === 'complete') {
    register()
  } else {
    win.addEventListener('load', register, { once: true })
  }
}

export async function bootstrapApplication() {
  await ensureDemoSeeded()

  const app = createApp(App)
  const pinia = createPinia()
  app.use(pinia)

  // Rehydrate the auth session from storage BEFORE installing the router so
  // the very first navigation guard sees the rehydrated authenticated state
  // — installing the router immediately fires the initial navigation guard,
  // which would otherwise see an empty store and redirect to /login.
  try {
    await useAuthStore().rehydrate()
  } catch {
    // Non-fatal: app continues to boot in the unauthenticated state.
  }

  app.use(router)
  app.mount('#app')
  registerServiceWorker()
  return app
}

bootstrapApplication().catch((error) => {
  console.error('Failed to bootstrap FlowForge.', error)
})
