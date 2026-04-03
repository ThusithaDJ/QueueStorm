/**
 * useAuth — global reactive auth state.
 *
 * Stores JWT in localStorage. Works across components via shared refs.
 */

import { ref, computed } from 'vue'
import * as api from '../api/client.js'

const TOKEN_KEY = 'qs_token'

const token   = ref(localStorage.getItem(TOKEN_KEY) || null)
const user    = ref(null)
const loading = ref(false)

const isLoggedIn = computed(() => !!token.value)

async function loadUser() {
  if (!token.value) return
  try {
    user.value = await api.getMe(token.value)
  } catch {
    logout()
  }
}

async function doLogin(email, password) {
  const { token: t, user: u } = await api.login({ email, password })
  token.value = t
  user.value  = u
  localStorage.setItem(TOKEN_KEY, t)
}

async function doRegister(email, displayName, password) {
  const { token: t, user: u } = await api.register({ email, displayName, password })
  token.value = t
  user.value  = u
  localStorage.setItem(TOKEN_KEY, t)
}

function logout() {
  token.value = null
  user.value  = null
  localStorage.removeItem(TOKEN_KEY)
}

// Attempt to restore session on first import
loadUser()

export function useAuth() {
  return { token, user, isLoggedIn, loading, doLogin, doRegister, logout }
}
