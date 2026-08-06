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
  seedKhataCategories,
  defaultPublicShopUid,
} from './store.js'
import { bottomNav, NAV_PATHS, loading } from './components.js'
import { enablePullRefresh } from './lib/pull-refresh.js'
// Sirf side-effect ke liye: install ka mauqa (`beforeinstallprompt`) sirf ek
// dafa aata hai aur aksar Settings khulne se bohat pehle. Boot par sun'na
// zaroori hai, warna wo mauqa zaya ho jata hai aur button kabhi nahi aata.
import './lib/install.js'

import { renderWelcome } from './screens/welcome.js'
import { renderCatalog, resetCatalog } from './screens/catalog.js'
import { renderLogin, renderSetupNeeded } from './screens/login.js'
import { renderDashboard } from './screens/dashboard.js'
import { renderProducts } from './screens/products.js'
import { renderProductForm, clearProductDraft } from './screens/product-form.js'
import { renderProductDetail } from './screens/product-detail.js'
import { renderStock } from './screens/stock.js'
import { renderKhata } from './screens/khata.js'
import { renderKhataParty } from './screens/khata-party.js'
import { renderKhataForm, clearKhataDraft } from './screens/khata-form.js'
import { renderCategories } from './screens/categories.js'
import { renderSettings } from './screens/settings.js'

const root = $('#app')

let signedIn = false
let authChecked = false
let seeded = false
/**
 * Home page kis dukan ka catalog dikhaye.
 *
 * `checked` alag rakhna zaroori hai. Pehle sirf `publicUid` tha aur jawab
 * "koi catalog nahi" aane par usay `null` kar ke dobara poochna band kar dete
 * the — magar `null` ka matlab "poocha ja chuka" bhi tha. Nateeja: dukandar
 * site kholta (catalog abhi band), phir login kar ke catalog CHALU karta aur
 * sign out karta, to app dobara poochti hi nahi thi aur welcome screen par
 * atki rehti. Sirf page reload se theek hota tha.
 *
 * Shuru me jawab browser se aata hai (neeche dekhein), server se nahi.
 */
let publicShop = { uid: cachedPublicShopUid(), checked: false, asking: false }

/**
 * Pichhli baar kaun sa catalog mila tha — browser me mehfooz.
 *
 * Is ke baghair do me se ek kharabi laazmi thi: ya to jawab aane se pehle
 * welcome screen likh dete (aur har reload par wo jhalakta, phir products
 * aate), ya jawab tak spinner dikhate (aur jis dukan ka catalog hai hi nahi
 * us ka visitor teen second khali screen dekhta). Yaad rakhne se dono khatam:
 * pehli visit par foran welcome, us ke baad foran catalog.
 */
function cachedPublicShopUid() {
  try {
    return localStorage.getItem('karyana.publicShopUid') || null
  } catch {
    return null // private mode
  }
}

function rememberPublicShopUid(uid) {
  try {
    if (uid) localStorage.setItem('karyana.publicShopUid', uid)
    else localStorage.removeItem('karyana.publicShopUid')
  } catch {
    // Private mode — sirf is session ke liye chalega.
  }
}
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
      // products badle ho sakte hain, ya catalog abhi abhi chalu kiya ho.
      resetCatalog()
      // Yaad rakha hua catalog phenkte nahi — warna sign out ke foran baad
      // welcome jhalakta aur phir products aate. Sirf dobara poochte hain.
      publicShop = { uid: cachedPublicShopUid(), checked: false, asking: false }
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
      // Khata ki apni categories — products wali se bilkul alag.
      seedKhataCategories().catch(() => {})
    }
    render()
  })

  onRouteChange(render)
  onLangChange(render)
  window.addEventListener('online', render)
  window.addEventListener('offline', render)

  /*
   * Upar se kheench kar taza karna.
   *
   * Firestore ke listeners khud data laate rehte hain, is liye ye aksar kuch
   * naya nahi lata — aur yehi maqsad hai. Internet aane jane ke baad dukandar
   * ko tasalli chahiye hoti hai ke jo dikh raha hai wo taza hai. Sync dobara
   * shuru karne se cache aur server phir mil jate hain.
   */
  enablePullRefresh(async () => {
    if (signedIn) startSync()
    await new Promise((r) => setTimeout(r, 600))
    render()
  })
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

    // Home page: jis dukan ne catalog chalu kiya hua hai.
    if (publicShop.uid) return renderCatalog(root, publicShop.uid, render)

    // Ek hi baar poochte hain (har render par network par nahi jate), lekin
    // sign in/out par ye dobara khul jata hai — neeche watchAuth dekhein.
    if (!publicShop.checked && !publicShop.asking) {
      publicShop.asking = true
      askPublicShop()
    }

    // Yahan pahunchne ka matlab: browser ko koi catalog yaad nahi. Us soorat
    // me intezar karwana ghalat hai — jis site par catalog hai hi nahi, wahan
    // har visitor khali screen dekhta rehta. Welcome foran dikha dete hain;
    // jawab me catalog nikla to wo khud lag jayega (aur agli dafa foran).
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

/**
 * Poochta hai ke home page kis dukan ka catalog dikhaye.
 *
 * Jawab ka intezar spinner ke saath hota hai, is liye ye hamesha khatam hona
 * chahiye. Firestore offline ho to us ki apni koshish bohat der chal sakti hai
 * — us soorat me spinner atka reh jata. Is liye teen second ki hadd rakhi hai:
 * us ke baad welcome screen dikha dete hain, aur asli jawab baad me aa jaye to
 * catalog khud lag jata hai.
 */
function askPublicShop() {
  defaultPublicShopUid()
    .then((uid) => {
      const changed = uid !== publicShop.uid
      publicShop = { uid: uid || null, checked: true, asking: false }
      rememberPublicShopUid(uid)
      // Sirf tab dobara banate hain jab jawab pehle wali halat se alag ho —
      // warna har boot par ek bay-wajah render hota.
      if (changed) render()
    })
    .catch(() => {
      // Internet na ho to jo yaad tha wahi chalta rahe.
      publicShop = { ...publicShop, checked: true, asking: false }
    })
}

function routeTo(path, screen) {
  // Form se bahar nikal aaye to adhoora likha hua chhorne ka koi matlab nahi —
  // warna agli dafa wohi purani adhoori form khul jati. (Form ke andar rehte
  // hue ye mehfooz rehti hai; wajah product-form.js me likhi hai.)
  if (path !== '/product/new' && !matchRoute(path, '/product/:id/edit')) {
    clearProductDraft()
  }
  if (path !== '/khata/new' && !matchRoute(path, '/khata/:id/edit')) {
    clearKhataDraft()
  }

  if (path === '/') return renderDashboard(screen)
  if (path === '/products') return renderProducts(screen, render)
  if (path === '/stock') return renderStock(screen, render)
  if (path === '/khata') return renderKhata(screen, render)
  if (path === '/khata/new') return renderKhataForm(screen, null, render)
  if (path === '/settings') return renderSettings(screen, render)
  if (path === '/categories') return renderCategories(screen)
  if (path === '/product/new') return renderProductForm(screen, null, render)

  const khataEdit = matchRoute(path, '/khata/:id/edit')
  if (khataEdit) return renderKhataForm(screen, khataEdit.id, render)

  const khataParty = matchRoute(path, '/khata/:id')
  if (khataParty) return renderKhataParty(screen, khataParty.id, render)

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
