import { esc, escAttr, on } from '../lib/dom.js'
import { t, getLang, setLang, unitLabel, localizedName } from '../i18n/index.js'
import { navigate } from '../lib/router.js'
import { loadPublicShop, loadMorePublicProducts, loadPublicImage } from '../store.js'
import { loading, empty } from '../components.js'
import { formatMoney } from '../lib/format.js'
import { formatPackSizeShort, formatQty, priceUnitLabel } from '../lib/units.js'
import { wireDragScroll } from '../lib/dragscroll.js'
import { autoLoadMore } from '../lib/paging.js'

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

/** Grahak ki search/chhanti — screen dobara banne par zaya na ho. */
const ui = { query: '', categoryId: 'all', inStockOnly: false }

/** Agla safha aa raha hai? Do dafa ek saath na mangwayen. */
let fetching = false

/**
 * Baqi maal server se mangwana.
 *
 * Neeche pahunchne par ek safha, aur SEARCH par poora — kyunki jo cheez abhi
 * aayi hi nahi us me talash nahi ho sakti, aur grahak ko "nahi mila" dikhana
 * sab se bura jawab hai. Ye ek hi baar hota hai; us ke baad sab paas hai.
 */
async function fetchMore(uid, rerender, all = false) {
  if (fetching || !cache?.cursor) return
  fetching = true
  try {
    do {
      const next = await loadMorePublicProducts(uid, cache.cursor)
      cache = {
        ...cache,
        products: [...cache.products, ...next.products],
        cursor: next.cursor,
      }
    } while (all && cache.cursor)
  } catch {
    cache = { ...cache, cursor: null } // aage koshish na karte rahein
  } finally {
    fetching = false
    rerender()
  }
}

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
               <span class="tiny muted" id="c-count">${esc(t('products.count', { count: visible.length }))}</span>
               <button class="chip${ui.inStockOnly ? ' chip--active' : ''}" data-instock>
                 ${esc(t('catalog.inStockOnly'))}
               </button>
             </div>`
          : ''
      }

      <div class="pad" style="padding-top:0" id="c-results">${resultsHtml(shop, visible)}</div>
    </div>`

  afterList(root, uid, rerender)

  on(root, 'click', '[data-lang]', (_e, el) => setLang(el.dataset.lang))
  on(root, 'click', '[data-go]', (_e, el) => navigate(el.dataset.go))

  on(root, 'click', '[data-catfilter]', (_e, el) => {
    const value = el.dataset.catfilter
    ui.categoryId = ui.categoryId === value ? 'all' : value
    rerender()
  })

  on(root, 'click', '[data-instock]', () => {
    ui.inStockOnly = !ui.inStockOnly
    rerender()
  })

  on(root, 'click', '[data-show-more]', () => fetchMore(uid, rerender))

  const search = root.querySelector('#cq')
  if (search) {
    let timer
    search.addEventListener('input', (e) => {
      ui.query = e.target.value
      clearTimeout(timer)
      timer = setTimeout(() => {
        // Talash poore maal par honi chahiye, sirf us par nahi jo aa chuka hai.
        if (ui.query.trim() && cache?.cursor) fetchMore(uid, rerender, true)
        refreshList(root, uid, rerender)
      }, 180)
    })
  }

}

/**
 * Sirf list ka hissa dobara banata hai — search box waisa hi rehta hai.
 *
 * Wahi wajah jo dukandar wali list me hai: poori screen dobara banane par jis
 * khane me grahak likh raha hota hai wo hi naya ban jata tha, focus toot jata
 * aur keyboard band ho jata.
 */
function refreshList(root, uid, rerender) {
  const area = root.querySelector('#c-results')
  if (!area) return rerender()

  const shop = cache
  if (!shop) return rerender()

  const visible = filterProducts(shop)
  area.innerHTML = resultsHtml(shop, visible)

  const count = root.querySelector('#c-count')
  if (count) count.textContent = t('products.count', { count: visible.length })

  afterList(root, uid, rerender)
}

/** Har dafa nayi rows aane ke baad ka kaam. */
function afterList(root, uid, rerender) {
  wireDragScroll(root)
  autoLoadMore(root, () => fetchMore(uid, rerender))

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

/** List ka andar ka hissa — render aur refresh dono yehi likhte hain. */
function resultsHtml(shop, visible) {
  const currency = shop.currency || 'Rs'

  if (!visible.length) {
    return shop.products.length
      ? empty('🔍', t('products.noResults', { query: ui.query }), '')
      : empty('🏪', t('catalog.empty'), t('catalog.emptyHint'))
  }

  return `
    <ul class="pgrid">${visible.map((p) => card(p, currency)).join('')}</ul>
    ${
      shop.cursor
        ? `<div class="morebar" data-more-sentinel>
             <button class="btn btn--secondary btn--full" data-show-more>
               ${esc(t('catalog.showMore'))}
             </button>
           </div>`
        : ''
    }`
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
}

/** Sign-in/sign-out par purana catalog na reh jaye. */
export function resetCatalog() {
  cache = null
  loadingUid = null
  resetFilters()
}
