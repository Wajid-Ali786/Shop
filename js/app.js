/**
 * App ka bootstrap: config check → Firebase → login → screens.
 */
import { $, esc } from './lib/dom.js'
import { initI18n, onLangChange, t } from './i18n/index.js'
import { applyTheme, watchSystemTheme } from './lib/theme.js'
import { currentPath, navigate, onRouteChange, matchRoute } from './lib/router.js'
import { isConfigured } from './config.js'
import { initFirebase, watchAuth } from './firebase.js'
import {
  state,
  subscribe,
  startSync,
  stopSync,
  seedDefaultCategories,
  defaultPublicShopUid,
} from './store.js'
import { bottomNav, NAV_PATHS, loading } from './components.js'

import { renderWelcome } from './screens/welcome.js'
import { renderCatalog, resetCatalog } from './screens/catalog.js'
import { renderLogin, renderSetupNeeded } from './screens/login.js'
import { renderDashboard } from './screens/dashboard.js'
import { renderProducts } from './screens/products.js'
import { renderProductForm } from './screens/product-form.js'
import { renderProductDetail } from './screens/product-detail.js'
import { renderStock } from './screens/stock.js'
import { renderCategories } from './screens/categories.js'
import { renderSettings } from './screens/settings.js'

const root = $('#app')

let signedIn = false
let authChecked = false
let seeded = false
/** Home page kis dukan ka catalog dikhaye. `undefined` = abhi poocha nahi. */
let publicUid = undefined
/** Maujooda screen ka cleanup (Firestore listeners band karne ke liye). */
let cleanupScreen = null

// ------------------------------------------------------------------- boot

initI18n()
applyTheme()
watchSystemTheme()
registerServiceWorker()

if (!isConfigured()) {
  renderSetupNeeded(root)
} else {
  initFirebase()

  watchAuth((user) => {
    authChecked = true
    const wasSignedIn = signedIn
    signedIn = Boolean(user)

    if (signedIn && !wasSignedIn) {
      startSync()
      seeded = false
    } else if (!signedIn && wasSignedIn) {
      stopSync()
      // Sign out ke baad catalog dobara mangwao — dukandar ne is dauran
      // products badle ho sakte hain.
      resetCatalog()
      // Sign out ke baad andar wale route par mat atko — home page par le jao.
      if (currentPath() !== '/') navigate('/')
    }
    render()
  })

  // Data badalte hi screen dobara ban jati hai.
  subscribe(() => {
    // Pehli baar login par categories daal dete hain taake screen khali na lage.
    if (state.ready && !seeded && state.categories.length === 0) {
      seeded = true
      seedDefaultCategories().catch(() => {
        // Rules abhi publish na huye hon to yahan permission error aata hai —
        // banner user ko pehle hi bata deta hai, isliye chup reh sakte hain.
      })
    }
    render()
  })

  onRouteChange(render)
  onLangChange(render)
  window.addEventListener('online', render)
  window.addEventListener('offline', render)
}

// ----------------------------------------------------------------- render

function render() {
  if (!authChecked) {
    root.innerHTML = loading()
    return
  }

  // Sign out ki halat me site ka home page grahak wala catalog hai — seedha
  // login form nahi. Login usi screen ke button se khulta hai.
  if (!signedIn) {
    const path = currentPath()
    if (path === '/login') return renderLogin(root, 'signin')
    if (path === '/signup') return renderLogin(root, 'signup')

    // Kisi khaas dukan ka link: #/shop/{uid}
    const shopRoute = matchRoute(path, '/shop/:uid')
    if (shopRoute) return renderCatalog(root, shopRoute.uid, render)

    // Home page: jis dukan ne catalog chalu kiya hua hai. Us ka pata ek dafa
    // mangwa kar rakh lete hain, warna har render par network par jate.
    if (publicUid) return renderCatalog(root, publicUid, render)
    if (publicUid === undefined) {
      publicUid = null // dobara na poochein
      defaultPublicShopUid().then((uid) => {
        if (uid) {
          publicUid = uid
          render()
        }
      })
    }

    // Catalog chalu nahi hai — sada welcome screen.
    renderWelcome(root)
    return
  }

  const path = currentPath()
  const showNav = NAV_PATHS.includes(path)

  // Scroll position screen badalne par upar chali jani chahiye, lekin
  // usi screen ke andar re-render par nahi.
  const previousPath = root.dataset.path
  root.dataset.path = path

  // Pichhli screen ne koi Firestore listener lagaya ho to pehle usay band karo,
  // warna screen badalne par listeners jamā hote rehte hain.
  if (cleanupScreen) {
    cleanupScreen()
    cleanupScreen = null
  }

  root.innerHTML = ''
  root.insertAdjacentHTML('afterbegin', banners())

  const screen = document.createElement('div')
  root.appendChild(screen)

  // Screen cleanup function lauta sakti hai.
  const cleanup = routeTo(path, screen)
  if (typeof cleanup === 'function') cleanupScreen = cleanup

  if (showNav) root.insertAdjacentHTML('beforeend', bottomNav(path))

  if (previousPath !== path) window.scrollTo(0, 0)

  root.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.nav))
  })
}

function routeTo(path, screen) {
  if (path === '/') return renderDashboard(screen)
  if (path === '/products') return renderProducts(screen, render)
  if (path === '/stock') return renderStock(screen, render)
  if (path === '/settings') return renderSettings(screen, render)
  if (path === '/categories') return renderCategories(screen)
  if (path === '/product/new') return renderProductForm(screen, null, render)

  const edit = matchRoute(path, '/product/:id/edit')
  if (edit) return renderProductForm(screen, edit.id, render)

  const detail = matchRoute(path, '/product/:id')
  if (detail) return renderProductDetail(screen, detail.id)

  // Anjaan route → home.
  navigate('/')
  return undefined
}

/**
 * Service worker app ki files aur Firebase SDK cache karta hai, taake internet
 * na hone par bhi app khul jaye. `file://` par ye nahi chalta, isliye check.
 */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Register na ho to app phir bhi chalti hai, bas offline support nahi hoga.
    })
  })
}

function banners() {
  let html = ''

  if (state.error === 'permission') {
    html += `<div class="banner banner--error">${esc(t('error.permission'))}</div>`
  }
  if (!navigator.onLine) {
    html += `<div class="banner">${esc(t('net.offline'))}</div>`
  }
  return html
}
