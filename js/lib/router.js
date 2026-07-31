/**
 * Chhota hash-based router.
 *
 * Hash routing GitHub Pages ke liye zaroori hai: wahan koi server nahi hota jo
 * "/product/5" ko index.html par bhej sake. Hash (#/product/5) browser ke andar
 * hi rehta hai, isliye har route bina kisi server config ke chal jata hai.
 */

const listeners = new Set()

export function currentPath() {
  const hash = window.location.hash.replace(/^#/, '')
  return hash || '/'
}

export function navigate(path) {
  const next = path.startsWith('#') ? path : `#${path}`
  if (window.location.hash === next) {
    // Wahi route dobara — hashchange nahi chalega, isliye khud bata dete hain.
    notify()
    return
  }
  window.location.hash = next
}

export function goBack() {
  if (window.history.length > 1) window.history.back()
  else navigate('/')
}

export function onRouteChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function notify() {
  const path = currentPath()
  for (const fn of listeners) fn(path)
}

window.addEventListener('hashchange', notify)

/**
 * matchRoute('/product/12', '/product/:id') → { id: '12' }
 * Match na ho to null.
 */
export function matchRoute(path, pattern) {
  const pathParts = path.split('/').filter(Boolean)
  const patternParts = pattern.split('/').filter(Boolean)
  if (pathParts.length !== patternParts.length) return null

  const params = {}
  for (let i = 0; i < patternParts.length; i++) {
    const pat = patternParts[i]
    if (pat.startsWith(':')) params[pat.slice(1)] = decodeURIComponent(pathParts[i])
    else if (pat !== pathParts[i]) return null
  }
  return params
}
