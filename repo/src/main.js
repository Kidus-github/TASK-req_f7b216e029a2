import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './style.css'

export function registerServiceWorker(nav = navigator, win = window) {
  if (!('serviceWorker' in nav)) return

  // Register Service Worker for offline caching
  win.addEventListener('load', () => {
    nav.serviceWorker.register('./sw.js').catch(() => {
      // Service Worker registration failed. App will still work in current session.
    })
  })
}

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
registerServiceWorker()
