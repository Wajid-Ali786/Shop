/**
 * Chhote reusable HTML tukde. Har function ek HTML string lautata hai jo
 * screens apne template me chipka deti hain.
 */
import { esc, escAttr } from './lib/dom.js'
import { t, unitLabel, localizedName } from './i18n/index.js'
import { formatMoney } from './lib/format.js'
import { formatQty } from './lib/units.js'

// ------------------------------------------------------------------ icons

export const ICONS = {
  home: '<path d="M3 10.5L12 3l9 7.5M5 9.5V21h14V9.5"/>',
  products: '<path d="M3 7l9-4 9 4-9 4-9-4zm0 5l9 4 9-4M3 17l9 4 9-4"/>',
  stock: '<path d="M4 4h16v5H4V4zm0 7h16v9H4v-9zm5 3h6"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2V21a2 2 0 11-4 0v-.1A1.7 1.7 0 007 19.6l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.7 1.7 0 003 15H3a2 2 0 110-4h.1A1.7 1.7 0 004.4 8L4.3 8a2 2 0 112.8-2.8l.1.1A1.7 1.7 0 0010 4.4V3a2 2 0 114 0v.1a1.7 1.7 0 002.9 1.2l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 001.2 2.9H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
  back: '<path d="M15 18l-6-6 6-6" stroke-linecap="round" stroke-linejoin="round"/>',
  chevron: '<path d="M9 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" stroke-linecap="round" stroke-linejoin="round"/>',
  trash:
    '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" stroke-linecap="round" stroke-linejoin="round"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3" stroke-linecap="round"/>',
  plus: '<path d="M12 5v14M5 12h14" stroke-linecap="round"/>',
}

export function icon(name, cls = '') {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
    class="${escAttr(cls)}" aria-hidden="true">${ICONS[name] || ''}</svg>`
}

// ----------------------------------------------------------------- layout

export function appBar(title, { back = false, action = '' } = {}) {
  return `
    <header class="appbar${back ? '' : ' appbar--plain'}">
      ${back ? `<button class="icon-btn" data-back aria-label="${escAttr(t('common.back'))}">${icon('back', 'flip')}</button>` : ''}
      <h1>${esc(title)}</h1>
      ${action}
    </header>`
}

export function loading() {
  return '<div class="loading"><div class="spinner"></div></div>'
}

export function empty(iconChar, title, body = '', action = '') {
  return `
    <div class="empty">
      <div class="empty__icon">${esc(iconChar)}</div>
      <p class="empty__title">${esc(title)}</p>
      ${body ? `<p class="empty__body">${esc(body)}</p>` : ''}
      ${action}
    </div>`
}

export function section(title, body, action = '') {
  return `
    <section class="section">
      ${
        title || action
          ? `<div class="section__head">
               <h2 class="section__title">${esc(title)}</h2>${action}
             </div>`
          : ''
      }
      ${body}
    </section>`
}

// ------------------------------------------------------------------ forms

export function field(label, control, { hint = '', error = '', required = false } = {}) {
  return `
    <label class="field">
      <span class="field__label">${esc(label)}${required ? '<span class="field__req"> *</span>' : ''}</span>
      ${control}
      ${error ? `<span class="field__error">${esc(error)}</span>` : hint ? `<span class="field__hint">${esc(hint)}</span>` : ''}
    </label>`
}

export function options(list, selected) {
  return list
    .map(
      (o) =>
        `<option value="${escAttr(o.value)}"${String(o.value) === String(selected) ? ' selected' : ''}>${esc(o.label)}</option>`,
    )
    .join('')
}

// --------------------------------------------------------------- products

/** Stock kis haal me hai — teenon screens yehi rule istemaal karti hain. */
export function stockLevel(p) {
  if (!p.stockQty || p.stockQty <= 0) return 'out'
  if (p.lowStockAt !== null && p.lowStockAt !== undefined && p.stockQty <= p.lowStockAt) {
    return 'low'
  }
  return 'ok'
}

export function stockBadge(p) {
  const level = stockLevel(p)
  const text = level === 'out' ? t('home.outOfStock') : formatQty(p.stockQty, p.unit, unitLabel)
  const cls = level === 'out' ? ' badge--out' : level === 'low' ? ' badge--low' : ''
  return `<span class="badge${cls}">${esc(text)}</span>`
}

function thumb(product, fallback, big = false) {
  const cls = big ? 'thumb thumb--lg' : 'thumb'
  if (product.image) {
    return `<div class="${cls}"><img src="${escAttr(product.image)}" alt="" loading="lazy"></div>`
  }
  return `<div class="${cls}">${esc(fallback || '📦')}</div>`
}

export function productCard(product, { categoryIcon, currency }) {
  return `
    <div class="pcard">
      <button class="pcard__main" data-open="${escAttr(product.id)}">
        ${thumb(product, categoryIcon)}
        <div style="min-width:0;flex:1">
          <div class="row" style="gap:6px">
            <p class="bold truncate">${esc(localizedName(product))}</p>
            ${product.isActive === false ? `<span class="badge badge--hidden">${esc(t('products.inactive'))}</span>` : ''}
          </div>
          ${product.brand ? `<p class="small muted truncate">${esc(product.brand)}</p>` : ''}
          <p class="small" style="margin-top:2px">
            <span class="price">${esc(formatMoney(product.salePrice, currency))}</span>
            <span class="faint"> / ${esc(unitLabel(product.unit))}</span>
          </p>
        </div>
      </button>
      <div class="pcard__side">
        ${stockBadge(product)}
        <button class="mini-btn" data-adjust="${escAttr(product.id)}"
          aria-label="${escAttr(t('detail.adjustStock'))}">+</button>
      </div>
    </div>`
}

export function productThumbLarge(product, fallback) {
  return thumb(product, fallback, true)
}

// -------------------------------------------------------------- movements

export function movementRow(movement, unit, productName = '') {
  const isAdjust = movement.type === 'adjust'
  const positive = movement.type === 'in'
  const sign = isAdjust ? '=' : positive ? '+' : '−'
  const signCls = isAdjust ? '' : positive ? ' mrow__sign--in' : ' mrow__sign--out'

  return `
    <li class="mrow">
      <span class="mrow__sign${signCls}">${sign}</span>
      <div class="mrow__body">
        ${productName ? `<p class="small bold truncate">${esc(productName)}</p>` : ''}
        <p class="small">${esc(t(`reason.${movement.reason}`))}</p>
        <p class="tiny muted">${esc(movement.when)}${movement.note ? ` · ${esc(movement.note)}` : ''}</p>
      </div>
      <div class="mrow__qty">
        <p class="small bold">${isAdjust ? '' : sign}${esc(formatQty(movement.qty, unit, unitLabel))}</p>
        <p class="tiny faint">→ ${esc(formatQty(movement.balanceAfter, unit, unitLabel))}</p>
      </div>
    </li>`
}

// -------------------------------------------------------------------- nav

const TABS = [
  { path: '/', key: 'nav.home', icon: 'home' },
  { path: '/products', key: 'nav.products', icon: 'products' },
  { path: '/stock', key: 'nav.stock', icon: 'stock' },
  { path: '/settings', key: 'nav.settings', icon: 'settings' },
]

export const NAV_PATHS = TABS.map((tab) => tab.path)

export function bottomNav(path) {
  const items = TABS.map((tab) => {
    const active = tab.path === '/' ? path === '/' : path.startsWith(tab.path)
    return `
      <button data-nav="${escAttr(tab.path)}"${active ? ' aria-current="page"' : ''}>
        ${icon(tab.icon)}
        <span>${esc(t(tab.key))}</span>
      </button>`
  }).join('')

  return `<nav class="bottomnav">${items}</nav>`
}
