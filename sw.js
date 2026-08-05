/**
 * Service worker — app ko offline chalata hai.
 *
 * Do cheezein cache karta hai:
 *   1. App ki apni files (HTML/CSS/JS) — install ke waqt hi.
 *   2. Firebase ki CDN files — jab pehli baar load hon.
 *
 * Doosra hissa ahem hai: Firebase Google ke CDN se aati hai, aur agar wo cache
 * na ho to internet band hone par app khulti hi nahi. Firestore ka apna offline
 * cache tab hi kaam aata hai jab SDK khud load ho jaye.
 */
const VERSION = 'v11'
const APP_CACHE = `karyana-app-${VERSION}`
const VENDOR_CACHE = `karyana-vendor-${VERSION}`

/**
 * Firebase ke CDN modules install ke waqt hi cache kar lete hain.
 *
 * Warna ye pehli visit par service worker ke control me aane se PEHLE load ho
 * jate hain, aur cache doosri visit par hota hai — yaani ek baar online aa kar
 * app kholne wale shopkeeper ke liye offline kaam nahi karta.
 *
 * VERSION js/firebase.js aur js/store.js wale version se milna chahiye.
 */
const FIREBASE_VERSION = '12.17.0'
const VENDOR_FILES = ['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js'].map(
  (f) => `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/${f}`,
)

const APP_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/config.js',
  './js/firebase.js',
  './js/store.js',
  './js/components.js',
  './js/i18n/index.js',
  './js/i18n/en.js',
  './js/i18n/ur.js',
  './js/lib/dom.js',
  './js/lib/backup.js',
  './js/lib/dragscroll.js',
  './js/lib/format.js',
  './js/lib/images.js',
  './js/lib/quick-stock.js',
  './js/lib/modal.js',
  './js/lib/paging.js',
  './js/lib/pull-refresh.js',
  './js/lib/router.js',
  './js/lib/search.js',
  './js/lib/theme.js',
  './js/lib/units.js',
  './js/screens/account.js',
  './js/screens/catalog.js',
  './js/screens/categories.js',
  './js/screens/dashboard.js',
  './js/screens/login.js',
  './js/screens/welcome.js',
  './js/screens/product-detail.js',
  './js/screens/product-form.js',
  './js/screens/products.js',
  './js/screens/settings.js',
  './js/screens/stock-sheet.js',
  './js/screens/stock.js',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      // Ek file bhi na mile to poora install fail na ho.
      caches.open(APP_CACHE).then((c) => Promise.allSettled(APP_FILES.map((f) => c.add(f)))),
      caches.open(VENDOR_CACHE).then((c) => Promise.allSettled(VENDOR_FILES.map((f) => c.add(f)))),
    ]).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== APP_CACHE && k !== VENDOR_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Firebase ki CDN files: cache-first (ye version ke saath badalti nahi).
  if (url.hostname === 'www.gstatic.com') {
    event.respondWith(cacheFirst(request, VENDOR_CACHE))
    return
  }

  // Firestore/Auth ke API calls kabhi cache nahi hone chahiyen — Firestore
  // apna offline handling khud karta hai.
  if (
    url.hostname.endsWith('googleapis.com') ||
    url.hostname.endsWith('firebaseio.com') ||
    url.hostname.endsWith('firebaseapp.com')
  ) {
    return
  }

  // App ki apni files: network pehle (taake update mil jaye), warna cache.
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request, APP_CACHE))
  }
})

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(request)
  if (hit) return hit

  const response = await fetch(request)
  if (response.ok || response.type === 'opaque') {
    cache.put(request, response.clone())
  }
  return response
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  try {
    const response = await fetch(request)
    if (response.ok) cache.put(request, response.clone())
    return response
  } catch (err) {
    const hit = await cache.match(request)
    if (hit) return hit
    // Navigation ho to index.html se kaam chala lo (hash routing ke liye kaafi).
    if (request.mode === 'navigate') {
      const shell = await cache.match('./index.html')
      if (shell) return shell
    }
    throw err
  }
}
