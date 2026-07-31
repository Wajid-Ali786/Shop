const STORAGE_KEY = 'karyana.theme'

export function getTheme() {
  return localStorage.getItem(STORAGE_KEY) || 'system'
}

export function setTheme(theme) {
  localStorage.setItem(STORAGE_KEY, theme)
}

/** `dark` class <html> par lagti/hatti hai — saari CSS isi se chalti hai. */
export function applyTheme() {
  const theme = getTheme()
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const dark = theme === 'dark' || (theme === 'system' && prefersDark)

  document.documentElement.classList.toggle('dark', dark)

  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', dark ? '#020617' : '#16a34a')
}

/** System theme badle to "system" mode me app bhi badle. */
export function watchSystemTheme() {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  mq.addEventListener('change', () => {
    if (getTheme() === 'system') applyTheme()
  })
}
