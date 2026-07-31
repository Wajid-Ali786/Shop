export type Theme = 'light' | 'dark' | 'system'

/** `dark` class <html> par lagti/hatti hai — Tailwind ka dark variant isi se chalta hai. */
export function applyTheme(theme: Theme) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const dark = theme === 'dark' || (theme === 'system' && prefersDark)
  document.documentElement.classList.toggle('dark', dark)

  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', dark ? '#020617' : '#16a34a')
}

/** System theme badle to "system" mode me app ko bhi badalna chahiye. */
export function watchSystemTheme(getTheme: () => Theme): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const onChange = () => {
    if (getTheme() === 'system') applyTheme('system')
  }
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}
