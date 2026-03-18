<template>
  <nav class="nav">
    <RouterLink to="/" class="nav-logo">
      ⚡ <span class="logo-accent">Queue</span>Storm
    </RouterLink>
    <ul class="nav-links">
      <li><RouterLink to="/">Test Config</RouterLink></li>
      <li><RouterLink to="/monitor">Live Monitor</RouterLink></li>
    </ul>
    <button
      class="theme-toggle"
      :title="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
      @click="toggle"
    >
      <span v-if="theme === 'dark'">☀</span>
      <span v-else>☽</span>
    </button>
  </nav>
  <RouterView />
</template>

<script setup>
import { RouterLink, RouterView } from 'vue-router'
import { useTheme } from './composables/useTheme.js'

const { theme, toggle } = useTheme()
</script>
