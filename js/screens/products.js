import { esc, escAttr, on } from '../lib/dom.js'
import { t, localizedName } from '../i18n/index.js'
import { navigate } from '../lib/router.js'
import { state, productById, categoryById, loadImage } from '../store.js'
import { searchProducts } from '../lib/search.js'
import { icon, empty, loading, productCard, fillImages } from '../components.js'
import { openStockSheet } from './stock-sheet.js'
import { wireQuickStock } from '../lib/quick-stock.js'

// Screen dobara render hone par bhi user ki search/filter zaya na ho.
const ui = { query: '', categoryId: 'all', sort: 'name' }

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

      ${listOrEmpty(visible)}
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
    // Search apni relevance ke hisaab se tarteeb deta hai — usay dobara sort na karein.
    return searchProducts(list, ui.query)
  }

  const sorted = [...list]
  if (ui.sort === 'stock') sorted.sort((a, b) => (a.stockQty || 0) - (b.stockQty || 0))
  else if (ui.sort === 'price') sorted.sort((a, b) => (b.salePrice || 0) - (a.salePrice || 0))
  else if (ui.sort === 'newest') sorted.sort((a, b) => b.createdAt - a.createdAt)
  else sorted.sort((a, b) => localizedName(a).localeCompare(localizedName(b)))
  return sorted
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
    const items = visible
      .map((p) => {
        const cat = categoryById((p.categoryIds || [])[0])
        return `<li>${productCard(p, {
          categoryIcon: cat?.icon,
          currency: state.settings.currency,
        })}</li>`
      })
      .join('')
    return `<ul class="plist pad" style="padding-top:0">${items}</ul>`
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

  on(root, 'click', '[data-add]', () => navigate('/product/new'))
  on(root, 'click', '[data-open]', (_e, el) => navigate(`/product/${el.dataset.open}`))
  on(root, 'click', '[data-adjust]', (_e, el) => {
    const product = productById(el.dataset.adjust)
    if (product) openStockSheet(product)
  })
  wireQuickStock(root, on)
}
