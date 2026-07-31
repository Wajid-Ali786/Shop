import { useCallback, useEffect, useState } from 'react'

/**
 * Chhota hash-based router. App me sirf 6 screens hain, isliye react-router ki
 * zaroorat nahi — is se bundle chhota rehta hai aur hash routing static hosting
 * (GitHub Pages wagera) par bina server config ke chal jati hai.
 */

export function useRoute(): [string, (path: string) => void] {
  const [path, setPath] = useState(() => currentPath())

  useEffect(() => {
    const onChange = () => setPath(currentPath())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const navigate = useCallback((next: string) => {
    window.location.hash = next.startsWith('#') ? next : `#${next}`
  }, [])

  return [path, navigate]
}

function currentPath(): string {
  const hash = window.location.hash.replace(/^#/, '')
  return hash || '/'
}

export function navigate(path: string) {
  window.location.hash = path.startsWith('#') ? path : `#${path}`
}

export function goBack() {
  if (window.history.length > 1) window.history.back()
  else navigate('/')
}

/**
 * Path ko pattern se match karta hai. `:param` segments capture hote hain.
 * matchRoute('/product/12', '/product/:id') → { id: '12' }
 */
export function matchRoute(
  path: string,
  pattern: string,
): Record<string, string> | null {
  const pathParts = path.split('/').filter(Boolean)
  const patternParts = pattern.split('/').filter(Boolean)
  if (pathParts.length !== patternParts.length) return null

  const params: Record<string, string> = {}
  for (let i = 0; i < patternParts.length; i++) {
    const pat = patternParts[i]
    if (pat.startsWith(':')) params[pat.slice(1)] = decodeURIComponent(pathParts[i])
    else if (pat !== pathParts[i]) return null
  }
  return params
}
