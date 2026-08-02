import { esc, escAttr, on } from '../lib/dom.js'
import { t, getLang, setLang, unitLabel, localizedName } from '../i18n/index.js'
import { navigate } from '../lib/router.js'
import { loadPublicShop, loadPublicImage } from '../store.js'
import { loading, empty } from '../components.js'
import { formatMoney } from '../lib/format.js'
import { formatPackSize, priceUnitLabel } from '../lib/units.js'

/**
 * Grahak wali list — bina login ke.
 *
 * Yahan jo data aata hai wo dukan ke asal products se ALAG copy hai (store ki
 * `loadPublicShop` dekhein): sirf naam, tasveer aur bikri ka rate. Khareed
 * rate aur stock ki ginti is screen tak pahunchti hi nahi, is liye link kisi
 * ke bhi paas chala jaye to dukandar ka munafa mehfooz rehta hai.
 *
 * Dukandar khud aaye to usay bhi yehi screen milti hai — upar Login ka button
 * hota hai jo seedha uski apni dukan me le jata hai.
 */

// Ek hi baar load karte hain; screen dobara banne par network par nahi jate.
let cache = null
let loadingUid = null

/** Search screen ke saath rehti hai, warna har render par mit jati hai. */
const state = { query: '' }

export function renderCatalog(root, uid, rerender) {
  // Naya shop → purana data phenk do.
  if (cache && cache.uid !== uid) cache = null

  if (!cache) {
    if (loadingUid !== uid) {
      loadingUid = uid
      loadPublicShop(uid)
        .then((shop) => {
          cache = shop || { uid, products: [], missing: true }
          rerender()
        })
        .catch(() => {
          cache = { uid, products: [], missing: true }
          rerender()
        })
    }
    root.innerHTML = loading()
    return
  }

  const shop = cache
  const query = state.query.trim().toLowerCase()
  const visible = query
    ? shop.products.filter((p) =>
        `${p.nameEn || ''} ${p.nameUr || ''}`.toLowerCase().includes(query),
      )
    : shop.products

  root.innerHTML = `
    <div class="screen catalog">
      <header class="catalog__top">
        <div class="welcome__lang">
          <button class="welcome__langbtn${getLang() === 'en' ? ' welcome__langbtn--on' : ''}"
            data-lang="en">English</button>
          <button class="welcome__langbtn${getLang() === 'ur' ? ' welcome__langbtn--on' : ''}"
            data-lang="ur">اردو</button>
        </div>

        <h1 class="catalog__title" dir="auto">${esc(shop.shopName || t('welcome.title'))}</h1>
        <p class="catalog__tagline">${esc(t('catalog.tagline'))}</p>

        <div class="catalog__actions">
          <button class="btn btn--primary" data-go="/login">${esc(t('welcome.login'))}</button>
          <button class="btn btn--secondary" data-go="/signup">${esc(t('welcome.createAccount'))}</button>
        </div>
      </header>

      ${
        shop.products.length
          ? `<div class="searchbar">
               <div class="searchbar__wrap">
                 <input type="search" id="cq" value="${escAttr(state.query)}"
                   placeholder="${escAttr(t('catalog.searchPlaceholder'))}" dir="auto">
               </div>
             </div>`
          : ''
      }

      <div class="pad" style="padding-top:8px">
        ${
          visible.length
            ? `<p class="tiny muted" style="margin-bottom:8px">
                 ${esc(t('products.count', { count: visible.length }))}
               </p>
               <ul class="pgrid">${visible.map(card).join('')}</ul>`
            : shop.products.length
              ? empty('🔍', t('products.noResults', { query: state.query }), '')
              : empty('🏪', t('catalog.empty'), t('catalog.emptyHint'))
        }
      </div>
    </div>`

  on(root, 'click', '[data-lang]', (_e, el) => setLang(el.dataset.lang))
  on(root, 'click', '[data-go]', (_e, el) => navigate(el.dataset.go))

  const search = root.querySelector('#cq')
  if (search) {
    let timer
    search.addEventListener('input', (e) => {
      state.query = e.target.value
      clearTimeout(timer)
      timer = setTimeout(() => {
        rerender()
        const next = root.querySelector('#cq')
        if (next) {
          next.focus()
          next.setSelectionRange(next.value.length, next.value.length)
        }
      }, 180)
    })
  }

  // Tasveerein baad me — list foran nazar aani chahiye.
  for (const el of root.querySelectorAll('[data-pubimage]')) {
    const id = el.dataset.pubimage
    el.removeAttribute('data-pubimage')
    loadPublicImage(uid, id).then((data) => {
      if (!data || !el.isConnected) return
      el.innerHTML = `<img src="${escAttr(data)}" alt="">`
    })
  }
}

/**
 * Grahak wala card — bilkul dukandar wale grid card jaisa, magar stock ka
 * hissa (badge aur +/− buttons) bilkul nahi. Grahak ko ginti nahi dikhni.
 */
function card(p) {
  const packSize = formatPackSize(p, unitLabel)
  const currency = cache?.currency || 'Rs'

  return `
    <li>
      <div class="gcard">
        <div class="gcard__main" style="cursor:default">
          <div class="gcard__thumb">${
            p.imageId ? `<span data-pubimage="${escAttr(p.imageId)}">📦</span>` : '📦'
          }</div>
          <p class="gcard__name" dir="auto">${esc(localizedName(p))}</p>
          <p class="gcard__sub truncate">${packSize ? esc(packSize) : '&nbsp;'}</p>
          <p class="gcard__price">
            <span class="price">${esc(formatMoney(p.salePrice, currency))}</span>
            <span class="faint tiny"> / ${esc(priceUnitLabel(p, unitLabel))}</span>
          </p>
        </div>
      </div>
    </li>`
}

/** Sign-in/sign-out par purana catalog na reh jaye. */
export function resetCatalog() {
  cache = null
  loadingUid = null
  state.query = ''
}
