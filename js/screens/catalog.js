import { esc, escAttr, on } from '../lib/dom.js'
import { t, getLang, setLang, unitLabel, localizedName } from '../i18n/index.js'
import { navigate } from '../lib/router.js'
import { loadPublicShop, loadPublicImage } from '../store.js'
import { loading, empty } from '../components.js'
import { formatMoney } from '../lib/format.js'
import { formatPackSizeShort, formatQty, priceUnitLabel } from '../lib/units.js'
import { wireDragScroll } from '../lib/dragscroll.js'

/**
 * Grahak wali list — bina login ke.
 *
 * Yahan jo data aata hai wo dukan ke asal products se ALAG copy hai (store ki
 * `loadPublicShop` dekhein): sirf tasveer, naam, qeemat aur stock. Khareed
 * rate aur thok rate is screen tak pahunchte hi nahi, is liye link kisi ke bhi
 * paas chala jaye to dukandar ka munafa mehfooz rehta hai.
 *
 * Dukandar khud aaye to usay bhi yehi screen milti hai — upar Login ka button
 * hota hai jo seedhi uski apni dukan me le jata hai.
 */

// Ek hi baar load karte hain; screen dobara banne par network par nahi jate.
let cache = null
let loadingUid = null

/** Bari dukan par bhi pehli nazar foran bane — baqi "aur dikhayein" par. */
const PAGE = 40

/** Grahak ki search/chhanti — screen dobara banne par zaya na ho. */
const ui = { query: '', categoryId: 'all', inStockOnly: false, shown: PAGE }

export function renderCatalog(root, uid, rerender) {
  // Naya shop → purana sab kuch phenk do.
  if (cache && cache.uid !== uid) {
    cache = null
    resetFilters()
  }

  if (!cache) {
    if (loadingUid !== uid) {
      loadingUid = uid
      loadPublicShop(uid)
        .then((shop) => {
          cache = shop || { uid, products: [], categories: [], missing: true }
          rerender()
        })
        .catch(() => {
          cache = { uid, products: [], categories: [], missing: true }
          rerender()
        })
    }
    root.innerHTML = loading()
    return
  }

  const shop = cache
  const visible = filterProducts(shop)
  const currency = shop.currency || 'Rs'

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
                 <input type="search" id="cq" value="${escAttr(ui.query)}"
                   placeholder="${escAttr(t('catalog.searchPlaceholder'))}" dir="auto">
               </div>
             </div>

             ${categoryChips(shop)}

             <div class="row row--between pad" style="padding-top:4px;padding-bottom:4px">
               <span class="tiny muted">${esc(t('products.count', { count: visible.length }))}</span>
               <button class="chip${ui.inStockOnly ? ' chip--active' : ''}" data-instock>
                 ${esc(t('catalog.inStockOnly'))}
               </button>
             </div>`
          : ''
      }

      <div class="pad" style="padding-top:0">
        ${
          visible.length
            ? `<ul class="pgrid">${visible
                .slice(0, ui.shown)
                .map((p) => card(p, currency))
                .join('')}</ul>
               ${
                 visible.length > ui.shown
                   ? `<button class="btn btn--secondary btn--full" data-show-more
                        style="margin-top:12px">${esc(
                          t('products.showMore', {
                            count: Math.min(visible.length - ui.shown, PAGE),
                          }),
                        )}</button>`
                   : ''
               }`
            : shop.products.length
              ? empty('🔍', t('products.noResults', { query: ui.query }), '')
              : empty('🏪', t('catalog.empty'), t('catalog.emptyHint'))
        }
      </div>
    </div>`

  wireDragScroll(root)

  on(root, 'click', '[data-lang]', (_e, el) => setLang(el.dataset.lang))
  on(root, 'click', '[data-go]', (_e, el) => navigate(el.dataset.go))

  on(root, 'click', '[data-catfilter]', (_e, el) => {
    const value = el.dataset.catfilter
    ui.categoryId = ui.categoryId === value ? 'all' : value
    ui.shown = PAGE
    rerender()
  })

  on(root, 'click', '[data-instock]', () => {
    ui.inStockOnly = !ui.inStockOnly
    ui.shown = PAGE
    rerender()
  })

  on(root, 'click', '[data-show-more]', () => {
    ui.shown += PAGE
    rerender()
  })

  const search = root.querySelector('#cq')
  if (search) {
    let timer
    search.addEventListener('input', (e) => {
      ui.query = e.target.value
      ui.shown = PAGE
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
      el.innerHTML = `<img src="${escAttr(data)}" alt="" loading="lazy">`
    })
  }
}

function filterProducts(shop) {
  let list = shop.products

  if (ui.categoryId !== 'all') {
    list = list.filter((p) => (p.categoryIds || []).includes(ui.categoryId))
  }
  if (ui.inStockOnly) {
    list = list.filter((p) => (p.stockQty || 0) > 0)
  }

  const query = ui.query.trim().toLowerCase()
  if (query) {
    // Grahak wali search sada hai — naam par. Dukandar wale hidden tags
    // (searchBlob) jaan boojh kar public copy me nahi bheje jate.
    list = list.filter((p) => `${p.nameEn || ''} ${p.nameUr || ''}`.toLowerCase().includes(query))
  }
  return list
}

function categoryChips(shop) {
  if (!shop.categories?.length) return ''

  // Sirf wo categories jin me waqai kuch hai — khali chips grahak ko uljhati hain.
  const used = new Set()
  for (const p of shop.products) for (const id of p.categoryIds || []) used.add(id)

  const chips = shop.categories
    .filter((c) => used.has(c.id))
    .map(
      (c) => `
      <button class="chip${ui.categoryId === c.id ? ' chip--active' : ''}" data-catfilter="${escAttr(c.id)}">
        ${esc(c.icon || '📦')} ${esc(localizedName(c))}
      </button>`,
    )
    .join('')

  if (!chips) return ''

  return `
    <div class="chips">
      <button class="chip${ui.categoryId === 'all' ? ' chip--active' : ''}" data-catfilter="all">
        ${esc(t('common.all'))}
      </button>
      ${chips}
    </div>`
}

/**
 * Grahak wala card — dukandar wale grid card jaisa, magar +/− buttons ke
 * baghair. Stock sirf parhne ke liye hai.
 */
function card(p, currency) {
  const packSize = formatPackSizeShort(p)
  const out = (p.stockQty || 0) <= 0

  return `
    <li>
      <div class="gcard">
        <div class="gcard__main" style="cursor:default">
          <div class="gcard__thumb">${
            p.imageId ? `<span data-pubimage="${escAttr(p.imageId)}">📦</span>` : '📦'
          }${packSize ? `<span class="packbadge" dir="ltr">${esc(packSize)}</span>` : ''}</div>
          <p class="gcard__name" dir="auto">${esc(localizedName(p))}</p>
          <p class="gcard__price">
            <span class="price">${esc(formatMoney(p.salePrice, currency))}</span>
            <span class="faint tiny"> / ${esc(priceUnitLabel(p, unitLabel))}</span>
          </p>
        </div>
        <div class="gcard__foot">
          <span class="badge${out ? ' badge--out' : ''}">
            ${out ? esc(t('catalog.outOfStock')) : esc(formatQty(p.stockQty, p, unitLabel))}
          </span>
        </div>
      </div>
    </li>`
}

function resetFilters() {
  ui.query = ''
  ui.categoryId = 'all'
  ui.inStockOnly = false
  ui.shown = PAGE
}

/** Sign-in/sign-out par purana catalog na reh jaye. */
export function resetCatalog() {
  cache = null
  loadingUid = null
  resetFilters()
}
