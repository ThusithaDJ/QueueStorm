import { ref, watch } from 'vue'

const STORAGE_KEY = 'qs-theme'

// Singleton theme ref — shared across all callers
const theme = ref(localStorage.getItem(STORAGE_KEY) || 'dark')

function applyTheme(val) {
  document.documentElement.setAttribute('data-theme', val)
}

// Apply on module load
applyTheme(theme.value)

// Sync to DOM + storage whenever it changes
watch(theme, val => {
  applyTheme(val)
  localStorage.setItem(STORAGE_KEY, val)
})

export function useTheme() {
  function toggle() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
  }

  return { theme, toggle }
}
