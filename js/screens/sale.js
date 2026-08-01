import { esc, escAttr, on, toast, $ } from '../lib/dom.js'
import { t, unitLabel, localizedName } from '../i18n/index.js'
import { state, productById, recordSale, loadImage } from '../store.js'
import { searchProducts } from '../lib/search.js'
import { appBar, icon, empty, loading, fillImages } from '../components.js'
import { formatMoney } from '../lib/format.js'
import { allowsFraction, formatQty, priceUnitLabel } from '../lib/units.js'
import { openReceipt } from './receipt.js'

/**
 * Counter par bikri.
 *
 * Ye dukan ka sab se zyada dohraya jane wala kaam hai, is liye har cheez tap
 * ki ginti kam rakhne ke liye bani hai: cheez dhoondo, tap karo, cart me
 * chali gayi. Miqdaar aur qeemat cart me hi badalti hai — koi alag screen nahi.
 */

// Cart screen chhorne par bhi bacha rehta hai (galti se peeche daba dena aam hai).
let cart = []
let query = ''

export function renderSale(root, rerender) {
  if (!state.ready) {
    root.innerHTML = loading()
    return
  }

  const total = cartTotal()

  root.innerHTML = `
    <div class="screen screen--sale">
      ${appBar(t('sale.title'), {
        action: cart.length
          ? `<button class="icon-btn icon-btn--danger" data-clear
               aria-label="${escAttr(t('sale.clear'))}">${icon('trash')}</button>`
          : '',
      })}

      <div class="searchbar" style="position:static;padding-top:12px">
        <div class="searchbar__wrap">
          <span class="searchbar__icon">${icon('search')}</span>
          <input type="search" id="sale-q" value="${escAttr(query)}"
            placeholder="${escAttr(t('sale.searchPlaceholder'))}"
            aria-label="${escAttr(t('common.search'))}" dir="auto">
        </div>
      </div>

      ${query.trim() ? pickList() : ''}
      ${cartView()}
    </div>

    ${
      cart.length
        ? `<div class="savebar savebar--above-nav">
             <button class="btn btn--primary btn--full" data-checkout>
               <span>${esc(t('sale.complete'))}</span>
               <span class="sale__total">${esc(formatMoney(total, state.settings.currency))}</span>
             </button>
           </div>`
        : ''
    }`

  wire(root, rerender)
  fillImages(root, loadImage)
}

// -------------------------------------------------------------- product pick

function pickList() {
  // Bikri ke waqt chhupi hui aur khatam-shuda cheezein bhi mil sakti hain —
  // un ka stock abhi dukan me para ho sakta hai.
  const results = searchProducts(state.products, query).slice(0, 12)
  if (!results.length) {
    return `<div class="pad" style="padding-top:0">
      <p class="small muted center">${esc(t('products.noResults', { query }))}</p>
    </div>`
  }

  const rows = results
    .map((p) => {
      const inCart = cart.find((l) => l.productId === p.id)
      return `
      <li>
        <button class="picker" data-pick="${escAttr(p.id)}">
          <span class="picker__name truncate" dir="auto">${esc(localizedName(p))}</span>
          <span class="picker__meta">
            ${esc(formatMoney(p.salePrice, state.settings.currency))}
            <span class="faint">/ ${esc(priceUnitLabel(p, unitLabel))}</span>
            · ${esc(formatQty(p.stockQty, p, unitLabel))}
          </span>
          ${inCart ? `<span class="badge">${esc(String(inCart.qty))}</span>` : '<span class="picker__add">+</span>'}
        </button>
      </li>`
    })
    .join('')

  return `<ul class="plist pad" style="padding-top:0">${rows}</ul>`
}

// ---------------------------------------------------------------------- cart

function cartView() {
  if (!cart.length) {
    return empty('🧾', t('sale.emptyTitle'), t('sale.emptyBody'))
  }

  const rows = cart
    .map((line, i) => {
      const p = productById(line.productId)
      const step = p && allowsFraction(p) ? 0.25 : 1
      const short = p && (p.stockQty || 0) < line.qty

      return `
      <li class="cartline">
        <div class="cartline__head">
          <span class="bold truncate" dir="auto">${esc(line.name)}</span>
          <button class="icon-btn icon-btn--danger cartline__x" data-remove="${i}"
            aria-label="${escAttr(t('common.delete'))}">✕</button>
        </div>

        <div class="cartline__row">
          <div class="quickstock__row">
            <button class="quickstock__btn" data-dec="${i}" aria-label="−">−</button>
            <input class="cartline__qty" data-qty="${i}" type="number" inputmode="decimal"
              min="0" step="${step}" value="${escAttr(String(line.qty))}">
            <button class="quickstock__btn quickstock__btn--plus" data-inc="${i}" aria-label="+">+</button>
          </div>

          <div class="cartline__price">
            <span class="tiny muted">${esc(state.settings.currency)}</span>
            <input class="cartline__rate" data-price="${i}" type="number" inputmode="decimal"
              min="0" step="0.5" value="${escAttr(String(line.price))}">
          </div>

          <span class="cartline__total bold">
            ${esc(formatMoney(line.price * line.qty, state.settings.currency))}
          </span>
        </div>

        ${
          short
            ? `<p class="tiny" style="color:var(--warn-text)">
                 ${esc(t('sale.moreThanStock', { stock: formatQty(p.stockQty, p, unitLabel) }))}
               </p>`
            : ''
        }
      </li>`
    })
    .join('')

  return `
    <div class="pad" style="padding-top:0">
      <ul class="plist">${rows}</ul>
      <div class="card row row--between" style="margin-top:12px">
        <span class="bold">${esc(t('sale.total'))}</span>
        <span class="bold" style="font-size:1.3rem">
          ${esc(formatMoney(cartTotal(), state.settings.currency))}
        </span>
      </div>
    </div>`
}

function cartTotal() {
  return cart.reduce((sum, l) => sum + (Number(l.price) || 0) * (Number(l.qty) || 0), 0)
}

function addToCart(productId) {
  const p = productById(productId)
  if (!p) return

  const existing = cart.find((l) => l.productId === productId)
  if (existing) {
    // Wahi cheez dobara tap ki — ginti barha do, nayi line na banao.
    existing.qty = round(existing.qty + 1)
    return
  }
  cart.push({
    productId,
    // Naam aur rate abhi ke — parchi baad me product badalne par na badle.
    name: localizedName(p),
    unit: p.unit,
    sellBy: p.sellBy,
    packLabel: p.packLabel,
    qty: 1,
    price: Number(p.salePrice) || 0,
    cost: Number(p.costPrice) || 0,
  })
}

function round(n) {
  return Math.round((Number(n) + Number.EPSILON) * 1000) / 1000
}

// -------------------------------------------------------------------- events

function wire(root, rerender) {
  const box = $('#sale-q', root)
  if (box) {
    let timer
    box.addEventListener('input', (e) => {
      query = e.target.value
      clearTimeout(timer)
      timer = setTimeout(() => {
        rerender()
        const next = $('#sale-q', root)
        if (next) {
          next.focus()
          next.setSelectionRange(next.value.length, next.value.length)
        }
      }, 180)
    })
  }

  on(root, 'click', '[data-pick]', (_e, el) => {
    addToCart(el.dataset.pick)
    // Search khali kar dete hain taake agli cheez foran dhoondi ja sake —
    // counter par ek ke baad ek cheezein aati hain.
    query = ''
    rerender()
  })

  on(root, 'click', '[data-inc]', (_e, el) => {
    const line = cart[Number(el.dataset.inc)]
    const p = productById(line.productId)
    line.qty = round(line.qty + (p && allowsFraction(p) ? 0.25 : 1))
    rerender()
  })

  on(root, 'click', '[data-dec]', (_e, el) => {
    const i = Number(el.dataset.dec)
    const line = cart[i]
    const p = productById(line.productId)
    line.qty = round(line.qty - (p && allowsFraction(p) ? 0.25 : 1))
    if (line.qty <= 0) cart.splice(i, 1)
    rerender()
  })

  on(root, 'click', '[data-remove]', (_e, el) => {
    cart.splice(Number(el.dataset.remove), 1)
    rerender()
  })

  // Miqdaar aur rate seedha likhe ja sakte hain — bhaav taav aam baat hai.
  for (const el of root.querySelectorAll('[data-qty]')) {
    el.addEventListener('change', () => {
      const i = Number(el.dataset.qty)
      const value = Number.parseFloat(el.value)
      if (!Number.isFinite(value) || value <= 0) cart.splice(i, 1)
      else cart[i].qty = round(value)
      rerender()
    })
  }
  for (const el of root.querySelectorAll('[data-price]')) {
    el.addEventListener('change', () => {
      const value = Number.parseFloat(el.value)
      cart[Number(el.dataset.price)].price = Number.isFinite(value) ? value : 0
      rerender()
    })
  }

  on(root, 'click', '[data-clear]', () => {
    cart = []
    query = ''
    rerender()
  })

  on(root, 'click', '[data-checkout]', async (_e, el) => {
    if (!cart.length) return
    el.disabled = true
    try {
      const sale = await recordSale(cart)
      cart = []
      query = ''
      rerender()
      openReceipt(sale)
    } catch (err) {
      el.disabled = false
      toast(err?.code === 'permission-denied' ? t('error.permission') : t('error.generic'))
    }
  })
}

/** Dashboard "nayi bikri" par cart khali chahiye. */
export function resetCart() {
  cart = []
  query = ''
}
