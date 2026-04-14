import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/LoginView.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('@/views/RegisterView.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/',
    name: 'Dashboard',
    component: () => import('@/views/DashboardView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/diagrams',
    name: 'Diagrams',
    component: () => import('@/views/DiagramListView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/diagrams/:id',
    name: 'DiagramEditor',
    component: () => import('@/views/DiagramEditorView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/library',
    name: 'ApprovedLibrary',
    component: () => import('@/views/ApprovedLibraryView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/profile',
    name: 'Profile',
    component: () => import('@/views/ProfileView.vue'),
    meta: { requiresAuth: true },
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

router.beforeEach((to) => {
  const auth = useAuthStore()

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    if (auth.isLocked) {
      return { name: 'Login', query: { locked: '1' } }
    }
    return { name: 'Login' }
  }

  if (!to.meta.requiresAuth && auth.isAuthenticated) {
    return { name: 'Dashboard' }
  }
})

export default router
