import { esc, escAttr, on } from '../lib/dom.js'
import { t, localizedName } from '../i18n/index.js'
import { navigate } from '../lib/router.js'
import { state, productById, categoryById, loadImage } from '../store.js'
import { searchProducts } from '../lib/search.js'
import { icon, empty, loading, productCard, productGridCard, fillImages } from '../components.js'
import { openStockSheet } from './stock-sheet.js'
import { wireQuickStock } from '../lib/quick-stock.js'
import { wireDragScroll } from '../lib/dragscroll.js'
import { PAGE_SIZE, moreBar, autoLoadMore, resetAutoLoad } from '../lib/paging.js'

// Screen dobara render hone par bhi user ki search/filter zaya na ho.
const ui = { query: '', categoryId: 'all', sort: 'name', view: loadView(), showArchived: false }

/**
 * Har category ki apni tarteeb — aur phone band karne ke baad bhi yaad.
 *
 * Ek hi tarteeb sab par thopna asal kaam se mail nahi khati. "Dairy" me
 * dukandar miyaad dekhta hai, "Drinks" me kaun sa maal khatam ho raha hai, aur
 * poori list me sirf naam se dhoondta hai. Har dafa dropdown badalna parta tha,
 * aur app dobara khulte hi wo bhi zaya ho jati thi.
 *
 * Ye faisla is phone ka hai, dukan ka nahi — is liye localStorage me hai,
 * Firestore me nahi. Dukandar ke phone aur kaunter wale phone ki apni apni
 * aadat ho sakti hai.
 */
const SORT_KEY = 'karyana.sortByCategory'

function loadSorts() {
  try {
    const raw = JSON.parse(localStorage.getItem(SORT_KEY) || '{}')
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {} // kharab ho gaya to sab default par
  }
}

let sortByCategory = loadSorts()

/** Is category par pichhli dafa kya chala tha? */
function sortFor(categoryId) {
  return sortByCategory[categoryId] || 'name'
}

function saveSortFor(categoryId, sort) {
  sortByCategory = { ...sortByCategory, [categoryId]: sort }
  ui.sort = sort
  try {
    localStorage.setItem(SORT_KEY, JSON.stringify(sortByCategory))
  } catch {
    // Private mode — is session me phir bhi chalta rahega.
  }
}

/**
 * Ek baar me itni rows screen par aati hain.
 *
 * Baat sirf khoobsurti ki nahi hai: 1000 products ka poora DOM ek saath banane
 * me sasta phone kai second ke liye jam jata tha, aur har tasveer bhi saath hi
 * load hoti thi. Screen par to waise bhi 8-10 rows nazar aati hain, is liye
 * baqi maang par aati hain. Data poora mojood rehta hai — search aur ginti
 * hamesha SAARE products par chalti hai, sirf dikhawa mehdood hai.
 */
let shownCount = PAGE_SIZE

/** Filter/search badalne par dobara shuru se — warna nayi list adhoori lagti hai. */
function resetPaging() {
  shownCount = PAGE_SIZE
  resetAutoLoad()
}

/** List ya grid — dukandar ka chuna hua view yaad rehta hai. */
function loadView() {
  return localStorage.getItem('karyana.view') === 'grid' ? 'grid' : 'list'
}
function saveView(view) {
  ui.view = view
  try {
    localStorage.setItem('karyana.view', view)
  } catch {
    // Private mode — sirf is session ke liye chalega.
  }
}

export function renderProducts(root, rerender) {
  if (!state.ready) {
    root.innerHTML = loading()
    return
  }

  // App dobara khulne par bhi is category ki apni tarteeb chale.
  ui.sort = sortFor(ui.categoryId)

  const visible = filterProducts()

  root.innerHTML = `
    <div class="screen">
      <div class="searchbar">
        <div class="searchbar__wrap">
          <span class="searchbar__icon">${icon('search')}</span>
          <input type="search" id="q" value="${escAttr(ui.query)}"
            placeholder="${escAttr(t('products.searchPlaceholder'))}"
            aria-label="${escAttr(t('common.search'))}" dir="auto">
        </div>
      </div>

      ${categoryChips()}

      <div class="row row--between pad" style="padding-top:4px;padding-bottom:4px">
        <span class="tiny muted" id="p-count">${esc(t('products.count', { count: visible.length }))}</span>
        <div class="row" style="gap:8px">
        <div class="viewtoggle">
          <button data-view="list" aria-pressed="${ui.view === 'list'}"
            aria-label="${escAttr(t('products.viewList'))}" title="${escAttr(t('products.viewList'))}">
            ${icon('viewList')}
          </button>
          <button data-view="grid" aria-pressed="${ui.view === 'grid'}"
            aria-label="${escAttr(t('products.viewGrid'))}" title="${escAttr(t('products.viewGrid'))}">
            ${icon('viewGrid')}
          </button>
        </div>
        ${
          ui.query.trim()
            ? ''
            : `<select id="sort" class="tiny" style="width:auto;border:0;background:transparent;padding:4px;color:var(--text-muted)">
                 <option value="name"${ui.sort === 'name' ? ' selected' : ''}>${esc(t('products.sortName'))}</option>
                 <option value="stock"${ui.sort === 'stock' ? ' selected' : ''}>${esc(t('products.sortStock'))}</option>
                 <option value="price"${ui.sort === 'price' ? ' selected' : ''}>${esc(t('products.sortPrice'))}</option>
                 <option value="newest"${ui.sort === 'newest' ? ' selected' : ''}>${esc(t('products.sortNewest'))}</option>
               </select>`
        }
        </div>
      </div>

      <div id="p-results">${listOrEmpty(visible)}</div>
      ${archivedToggle()}
    </div>

    <button class="fab" data-add aria-label="${escAttr(t('home.quickAdd'))}">+</button>`

  wire(root, rerender)
  afterList(root, rerender)
}

/**
 * Sirf list ka hissa dobara banata hai — search box ko haath nahi lagata.
 *
 * Ye ahem hai. Pehle har harf par POORI screen dobara banti thi, jis me search
 * ka khana bhi shamil tha — yaani jis khane me dukandar likh raha tha wo hi
 * gayab ho kar naya ban jata, focus toot jata aur keyboard band ho jata. Code
 * focus wapas lagane ki koshish karta tha, magar wo purane (hataye ja chuke)
 * khane par lagti thi, is liye kabhi kaam nahi karti.
 *
 * Ab search ka khana apni jagah para rehta hai. Focus torne ki zaroorat hi
 * nahi parti, aur cursor bhi wahin rehta hai jahan dukandar ne chhora tha.
 */
function refreshList(root, rerender) {
  const area = root.querySelector('#p-results')
  // Screen hi badal gayi ho to poora dobara banana hi theek hai.
  if (!area) return rerender()

  const visible = filterProducts()
  area.innerHTML = listOrEmpty(visible)

  const count = root.querySelector('#p-count')
  if (count) count.textContent = t('products.count', { count: visible.length })

  afterList(root, rerender)
}

/** Har dafa nayi rows aane ke baad ka kaam. */
function afterList(root, rerender) {
  wireDragScroll(root)
  // Neeche pahunchte hi agla tukra khud aa jata hai.
  autoLoadMore(root, () => {
    shownCount += PAGE_SIZE
    refreshList(root, rerender)
  })
  fillImages(root, loadImage)
}

function filterProducts() {
  let list = state.products

  if (ui.categoryId !== 'all') {
    // Ek product kai categories me ho sakta hai.
    list = list.filter((p) => (p.categoryIds || []).includes(ui.categoryId))
  }

  if (ui.query.trim()) {
    // Search HAR cheez me chalti hai — chhupi hui aur market se khatam bhi.
    // Grahak wo cheez maang sakta hai jis ka stock abhi dukan me para hai;
    // us waqt "nahi mila" dikhana sab se bura jawab hai. Badge bata deta hai
    // ke maal dobara nahi aayega.
    // Search apni relevance ke hisaab se tarteeb deta hai — dobara sort na karein.
    return searchProducts(list, ui.query)
  }

  // Browse karte waqt rozana ki list saaf rehni chahiye: chhupi hui aur
  // khatam-shuda cheezein tab tak nahi aatin jab tak maanga na jaye.
  // (Pehle "Show in product list" ka toggle asal me kuch karta hi nahi tha —
  // product list me aa jata tha, bas badge lag jata tha.)
  if (!ui.showArchived) {
    list = list.filter((p) => (p.status || 'active') === 'active')
  }

  const sorted = [...list]
  if (ui.sort === 'stock') sorted.sort((a, b) => (a.stockQty || 0) - (b.stockQty || 0))
  else if (ui.sort === 'price') sorted.sort((a, b) => (b.salePrice || 0) - (a.salePrice || 0))
  else if (ui.sort === 'newest') sorted.sort((a, b) => b.createdAt - a.createdAt)
  else sorted.sort((a, b) => localizedName(a).localeCompare(localizedName(b)))
  return sorted
}

/** Chhupi/khatam products kitni hain — aur unhe dikhane ka rasta. */
function archivedToggle() {
  const archived = state.products.filter((p) => (p.status || 'active') !== 'active')
  if (!archived.length) return ''

  return `
    <div class="pad" style="padding-top:0">
      <button class="btn btn--secondary btn--full btn--sm" data-toggle-archived>
        ${
          ui.showArchived
            ? esc(t('products.hideArchived'))
            : esc(t('products.showArchived', { count: archived.length }))
        }
      </button>
    </div>`
}

function categoryChips() {
  if (!state.categories.length) return ''
  const chips = state.categories
    .map(
      (c) => `
      <button class="chip${ui.categoryId === c.id ? ' chip--active' : ''}" data-cat="${escAttr(c.id)}">
        ${esc(c.icon || '📦')} ${esc(localizedName(c))}
      </button>`,
    )
    .join('')

  return `
    <div class="chips">
      <button class="chip${ui.categoryId === 'all' ? ' chip--active' : ''}" data-cat="all">
        ${esc(t('common.all'))}
      </button>
      ${chips}
    </div>`
}

function listOrEmpty(visible) {
  if (visible.length) {
    const grid = ui.view === 'grid'
    const render = grid ? productGridCard : productCard
    const items = visible
      .slice(0, shownCount)
      .map((p) => {
        const cat = categoryById((p.categoryIds || [])[0])
        return `<li>${render(p, {
          categoryIcon: cat?.icon,
          currency: state.settings.currency,
        })}</li>`
      })
      .join('')

    return `<ul class="${grid ? 'pgrid' : 'plist'} pad" style="padding-top:0">${items}</ul>
      ${moreBar(Math.min(shownCount, visible.length), visible.length)}`
  }

  if (state.products.length === 0) {
    return empty(
      '📦',
      t('products.empty'),
      t('products.emptyHint'),
      `<button class="btn btn--primary" data-add>${esc(t('home.quickAdd'))}</button>`,
    )
  }
  return empty('🔍', t('products.noResults', { query: ui.query }), t('products.noResultsHint'))
}

function wire(root, rerender) {
  const searchInput = root.querySelector('#q')
  if (searchInput) {
    let timer
    searchInput.addEventListener('input', (e) => {
      ui.query = e.target.value
      clearTimeout(timer)
      // Har keystroke par poori list dobara na banay.
      timer = setTimeout(() => {
        resetPaging()
        refreshList(root, rerender)
      }, 180)
    })
  }

  const sortSelect = root.querySelector('#sort')
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      // Sirf isi category ke liye yaad rehta hai.
      saveSortFor(ui.categoryId, e.target.value)
      resetPaging()
      rerender()
    })
  }

  on(root, 'click', '[data-cat]', (_e, el) => {
    const value = el.dataset.cat
    ui.categoryId = ui.categoryId === value ? 'all' : value
    // Is category par pichhli dafa jo tarteeb thi, wohi wapas.
    ui.sort = sortFor(ui.categoryId)
    resetPaging()
    rerender()
  })

  on(root, 'click', '[data-view]', (_e, el) => {
    saveView(el.dataset.view)
    resetPaging()
    rerender()
  })

  on(root, 'click', '[data-toggle-archived]', () => {
    ui.showArchived = !ui.showArchived
    resetPaging()
    rerender()
  })

  on(root, 'click', '[data-show-more]', () => {
    shownCount += PAGE_SIZE
    refreshList(root, rerender)
  })

  on(root, 'click', '[data-add]', () => navigate('/product/new'))
  on(root, 'click', '[data-open]', (_e, el) => navigate(`/product/${el.dataset.open}`))
  on(root, 'click', '[data-adjust]', (_e, el) => {
    const product = productById(el.dataset.adjust)
    if (product) openStockSheet(product)
  })
  wireQuickStock(root, on)
}
