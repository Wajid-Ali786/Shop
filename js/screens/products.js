import { esc, escAttr, on } from '../lib/dom.js'
import { t, localizedName } from '../i18n/index.js'
import { navigate } from '../lib/router.js'
import { state, productById, categoryById, loadImage } from '../store.js'
import { searchProducts } from '../lib/search.js'
import { icon, empty, loading, productCard, productGridCard, fillImages } from '../components.js'
import { openStockSheet } from './stock-sheet.js'
import { wireQuickStock } from '../lib/quick-stock.js'

// Screen dobara render hone par bhi user ki search/filter zaya na ho.
const ui = { query: '', categoryId: 'all', sort: 'name', view: loadView(), showArchived: false }

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
        <span class="tiny muted">${esc(t('products.count', { count: visible.length }))}</span>
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

      ${listOrEmpty(visible)}
      ${archivedToggle()}
    </div>

    <button class="fab" data-add aria-label="${escAttr(t('home.quickAdd'))}">+</button>`

  wire(root, rerender)
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
      .map((p) => {
        const cat = categoryById((p.categoryIds || [])[0])
        return `<li>${render(p, {
          categoryIcon: cat?.icon,
          currency: state.settings.currency,
        })}</li>`
      })
      .join('')
    return `<ul class="${grid ? 'pgrid' : 'plist'} pad" style="padding-top:0">${items}</ul>`
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
        rerender()
        const next = root.querySelector('#q')
        if (next) {
          next.focus()
          next.setSelectionRange(next.value.length, next.value.length)
        }
      }, 180)
    })
  }

  const sortSelect = root.querySelector('#sort')
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      ui.sort = e.target.value
      rerender()
    })
  }

  on(root, 'click', '[data-cat]', (_e, el) => {
    const value = el.dataset.cat
    ui.categoryId = ui.categoryId === value ? 'all' : value
    rerender()
  })

  on(root, 'click', '[data-view]', (_e, el) => {
    saveView(el.dataset.view)
    rerender()
  })

  on(root, 'click', '[data-toggle-archived]', () => {
    ui.showArchived = !ui.showArchived
    rerender()
  })

  on(root, 'click', '[data-add]', () => navigate('/product/new'))
  on(root, 'click', '[data-open]', (_e, el) => navigate(`/product/${el.dataset.open}`))
  on(root, 'click', '[data-adjust]', (_e, el) => {
    const product = productById(el.dataset.adjust)
    if (product) openStockSheet(product)
  })
  wireQuickStock(root, on)
}
