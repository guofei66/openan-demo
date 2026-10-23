const THEME_KEY = 'openan-debug-theme'

export function getTheme() {
  return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'
}

export function setTheme(theme) {
  const next = theme === 'light' ? 'light' : 'dark'
  document.documentElement.setAttribute('data-theme', next)
  localStorage.setItem(THEME_KEY, next)
  return next
}

export function toggleTheme() {
  return setTheme(getTheme() === 'dark' ? 'light' : 'dark')
}
