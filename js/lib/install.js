/**
 * App ko phone par install karna — home screen par apna icon.
 *
 * Browser khud bhi kabhi kabhi chhota sa banner dikhata hai, magar wo aksar
 * neeche kone me aa kar chala jata hai aur dukandar ko nazar hi nahi aata. Is
 * liye us mauqe ko rok kar sambhal lete hain (`preventDefault`) aur Settings me
 * apna button dete hain — jahan dukandar khud dhoond kar aa sakta hai.
 *
 * Ye file app ke shuru me hi load honi chahiye: `beforeinstallprompt` sirf EK
 * dafa aata hai, aur agar us waqt koi sun'ne wala na ho to mauqa zaya ho jata
 * hai. Is liye app.js is ko import karti hai, Settings ke khulne ka intezar
 * nahi karti.
 */

/** Browser ka apna prompt — jab tak istemaal na ho. */
let deferred = null

/**
 * Is session me install hota hua dekha?
 *
 * Sirf `display-mode` dekhna kaafi nahi hai. Dukandar Settings me button dabata
 * hai, install ho jata hai — magar wo browser wala tab jis me wo baitha hai
 * standalone nahi hota. Yaani screen dobara "install karein" dikhane lagti,
 * jaise kuch hua hi na ho. Is liye `appinstalled` yaad rakh lete hain.
 */
let installedNow = false

const listeners = new Set()

function emit() {
  // Copy par chalte hain: sun'ne wala aksar screen dobara banata hai, jo purana
  // listener hata kar naya daal deti hai — aur Set ke beech me daali gayi cheez
  // isi chakkar me aa jati hai. Baghair copy ke ye hamesha ka chakkar ban jata.
  for (const fn of [...listeners]) fn()
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferred = event
    // Settings screen khuli ho to button foran nazar aa jaye.
    emit()
  })

  window.addEventListener('appinstalled', () => {
    deferred = null
    installedNow = true
    emit()
  })
}

/** Halat badalne par batao (Settings screen dobara ban sake). */
export function onInstallChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** App is phone par install ho chuki hai? */
export function isInstalled() {
  if (installedNow) return true
  try {
    if (window.matchMedia?.('(display-mode: standalone)')?.matches) return true
    if (window.matchMedia?.('(display-mode: fullscreen)')?.matches) return true
  } catch {
    // Purana browser — neeche wala check phir bhi chal jayega.
  }
  // iOS Safari ka apna tareeqa.
  return navigator.standalone === true
}

/**
 * iPhone/iPad?
 *
 * Zaroori is liye hai ke Safari `beforeinstallprompt` bhejta hi nahi — wahan
 * button ka koi faida nahi, sirf tareeqa batana kaam aata hai. iPad naye iOS me
 * khud ko Mac bata deta hai, is liye touch bhi dekhte hain.
 */
export function isIos() {
  const ua = navigator.userAgent || ''
  if (/iphone|ipad|ipod/i.test(ua)) return true
  return /macintosh/i.test(ua) && (navigator.maxTouchPoints || 0) > 1
}

/**
 * Settings ko kya dikhana chahiye:
 *   'installed' — ho chuka hai
 *   'ready'     — button daba kar abhi ho sakta hai
 *   'ios'       — Safari: Share → Add to Home Screen
 *   'manual'    — browser ke menu se (ya prompt zaya ho chuka hai)
 */
export function installState() {
  if (isInstalled()) return 'installed'
  if (deferred) return 'ready'
  if (isIos()) return 'ios'
  return 'manual'
}

/**
 * Browser ka install prompt kholta hai.
 *
 * Ek event sirf ek hi dafa chalta hai — dukandar "abhi nahi" kahe to ye event
 * mar jata hai aur dobara `prompt()` karna error deta hai. Is liye istemaal se
 * pehle hi hata dete hain; browser mauqa mila to naya event khud bhej dega.
 *
 * Lautata hai: 'accepted' | 'dismissed' | 'unavailable'
 */
export async function promptInstall() {
  const event = deferred
  if (!event) return 'unavailable'
  deferred = null

  try {
    event.prompt()
    const choice = await event.userChoice
    const accepted = choice?.outcome === 'accepted'
    // `appinstalled` bhi aata hai, magar kabhi kabhi der se — aur us se pehle
    // screen dobara ban kar "install karein" likh deti. Yahin note kar lete hain.
    if (accepted) installedNow = true
    emit()
    return accepted ? 'accepted' : 'dismissed'
  } catch {
    emit()
    return 'dismissed'
  }
}
