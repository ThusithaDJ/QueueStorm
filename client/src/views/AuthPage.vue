<template>
  <main class="auth-page">
    <div class="auth-card">
      <div class="auth-logo">⚡ <span class="logo-accent">Queue</span>Storm</div>

      <div class="auth-tabs">
        <button :class="['auth-tab', { active: mode === 'login' }]" @click="mode = 'login'">Sign In</button>
        <button :class="['auth-tab', { active: mode === 'register' }]" @click="mode = 'register'">Create Account</button>
      </div>

      <!-- Login form -->
      <form v-if="mode === 'login'" @submit.prevent="handleLogin" class="auth-form">
        <div class="form-group">
          <label class="form-label">Email</label>
          <input class="form-input" type="email" v-model="email" placeholder="you@company.com" autocomplete="email" required />
        </div>
        <div class="form-group">
          <label class="form-label">Password</label>
          <input class="form-input" type="password" v-model="password" placeholder="••••••••" autocomplete="current-password" required />
        </div>
        <div v-if="error" class="auth-error">{{ error }}</div>
        <button type="submit" class="btn btn-primary btn-full" :disabled="submitting">
          {{ submitting ? 'Signing in…' : 'Sign In' }}
        </button>
      </form>

      <!-- Register form -->
      <form v-else @submit.prevent="handleRegister" class="auth-form">
        <div class="form-group">
          <label class="form-label">Email</label>
          <input class="form-input" type="email" v-model="email" placeholder="you@company.com" autocomplete="email" required />
        </div>
        <div class="form-group">
          <label class="form-label">Display Name</label>
          <input class="form-input" type="text" v-model="displayName" placeholder="Your name" autocomplete="name" required />
        </div>
        <div class="form-group">
          <label class="form-label">Password <span class="field-hint">(min 8 chars)</span></label>
          <input class="form-input" type="password" v-model="password" placeholder="••••••••" autocomplete="new-password" required minlength="8" />
        </div>
        <div v-if="error" class="auth-error">{{ error }}</div>
        <button type="submit" class="btn btn-primary btn-full" :disabled="submitting">
          {{ submitting ? 'Creating account…' : 'Create Account' }}
        </button>
      </form>
    </div>
  </main>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth.js'

const { doLogin, doRegister } = useAuth()
const router = useRouter()

const mode        = ref('login')
const email       = ref('')
const displayName = ref('')
const password    = ref('')
const submitting  = ref(false)
const error       = ref(null)

async function handleLogin() {
  error.value     = null
  submitting.value = true
  try {
    await doLogin(email.value, password.value)
    router.push('/')
  } catch (e) {
    error.value = e.message
  } finally {
    submitting.value = false
  }
}

async function handleRegister() {
  error.value     = null
  submitting.value = true
  try {
    await doRegister(email.value, displayName.value, password.value)
    router.push('/')
  } catch (e) {
    error.value = e.message
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--bg);
}

.auth-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 32px 28px;
  width: 100%;
  max-width: 400px;
}

.auth-logo {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
  color: var(--text);
  text-align: center;
  margin-bottom: 24px;
}

.logo-accent { color: var(--accent); }

.auth-tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
  margin-bottom: 24px;
}

.auth-tab {
  flex: 1;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--muted);
  cursor: pointer;
  font-size: 14px;
  padding: 10px;
  transition: color 0.15s;
}

.auth-tab.active {
  color: var(--text);
  border-bottom-color: var(--accent);
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.auth-error {
  background: rgba(255, 77, 109, 0.1);
  border: 1px solid rgba(255, 77, 109, 0.3);
  border-radius: 7px;
  padding: 8px 12px;
  color: var(--accent3);
  font-size: 12px;
  font-family: var(--font-mono);
}

.btn-full { width: 100%; justify-content: center; }

.field-hint { font-size: 11px; color: var(--muted); font-weight: 400; }
</style>
