<template>
  <nav class="nav">
    <RouterLink to="/" class="nav-logo">
      ⚡ <span class="logo-accent">Queue</span>Storm
    </RouterLink>
    <ul class="nav-links">
      <li><RouterLink to="/">Test Config</RouterLink></li>
      <li><RouterLink to="/monitor">Live Monitor</RouterLink></li>
      <li><RouterLink to="/environments">Environments</RouterLink></li>
      <li><RouterLink to="/messages">Message Builder</RouterLink></li>
      <li><RouterLink to="/log-analyser">Log Analyser</RouterLink></li>
    </ul>
    <div class="nav-right">
      <button
        class="theme-toggle"
        :title="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
        @click="toggle"
      >
        <span v-if="theme === 'dark'">☀</span>
        <span v-else>☽</span>
      </button>
      <template v-if="isLoggedIn">
        <span class="nav-user">{{ user?.displayName || user?.email }}</span>
        <button class="btn-link" @click="logout">Sign out</button>
      </template>
      <RouterLink v-else to="/auth" class="btn btn-secondary nav-auth-btn">Sign In</RouterLink>
    </div>
  </nav>
  <RouterView />
</template>

<script setup>
import { RouterLink, RouterView } from 'vue-router'
import { useTheme } from './composables/useTheme.js'
import { useAuth }  from './composables/useAuth.js'

const { theme, toggle } = useTheme()
const { isLoggedIn, user, logout } = useAuth()
</script>

<style>
.nav-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.nav-user {
  font-size: 12px;
  color: var(--muted);
  font-family: var(--font-mono);
}

.btn-link {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  font-size: 12px;
  padding: 0;
  text-decoration: underline;
}

.btn-link:hover { color: var(--text); }

.nav-auth-btn {
  font-size: 12px;
  padding: 5px 12px;
}
</style>
