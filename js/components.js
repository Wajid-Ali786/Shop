/**
 * Chhote reusable HTML tukde. Har function ek HTML string lautata hai jo
 * screens apne template me chipka deti hain.
 */
import { esc, escAttr } from './lib/dom.js'
import { t, unitLabel, localizedName } from './i18n/index.js'
import { formatMoney, daysUntil, EXPIRY_WARNING_DAYS } from './lib/format.js'
import { formatQty, formatPackSizeShort, priceUnitLabel } from './lib/units.js'

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
  // Do raste neeche aa kar ek ho jate hain — categories milane ke liye.
  merge:
    '<path d="M6 3v5c0 2.8 2.7 5 6 5s6-2.2 6-5V3M12 13v8m-3.5-3.5L12 21l3.5-3.5" stroke-linecap="round" stroke-linejoin="round"/>',
  viewList:
    '<path d="M4 6h16M4 12h16M4 18h16" stroke-linecap="round"/>',
  viewGrid:
    '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  // Khata — purani bahi jaisi kitab.
  khata:
    '<path d="M5 4h11a2 2 0 012 2v14H7a2 2 0 01-2-2V4z" stroke-linejoin="round"/><path d="M5 17h11M9 8h5" stroke-linecap="round"/>',
  eyeOff:
    '<path d="M10.6 6.2A9.9 9.9 0 0112 6c6.4 0 10 7 10 7a17.4 17.4 0 01-3 3.7M6.5 7.6A17.4 17.4 0 002 13s3.6 7 10 7a9.8 9.8 0 004.6-1.1" stroke-linecap="round"/><path d="M9.9 10a3 3 0 004.2 4.2M3 3l18 18" stroke-linecap="round"/>',
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

/**
 * Password ka khana, saath me "dikhao" wala button.
 *
 * Phone par password likhna andhere me teer chalane jaisa hai — har harf ek
 * gol nishan ban jata hai. Ghalti sirf "ghalat password" ke paighaam se pata
 * chalti hai, aur nayi password banate waqt to do khane milane hote hain. Ye
 * button ek nazar dekhne deta hai ke likha kya hai.
 *
 * `dir="ltr"` wrapper par bhi hai: password hamesha baen se likha jata hai, is
 * liye aankh ka button Urdu me bhi dahini taraf hi rehna chahiye — warna wo
 * unhi nishanat par aa jata jo abhi type ho rahe hain.
 */
export function passwordInput(
  id,
  { autocomplete = 'current-password', required = false, value = '' } = {},
) {
  return `
    <span class="pwwrap" dir="ltr">
      <input id="${escAttr(id)}" type="password" dir="ltr" value="${escAttr(value)}"
        autocomplete="${escAttr(autocomplete)}"${required ? ' required' : ''}>
      <button type="button" class="pwtoggle" data-pwtoggle="${escAttr(id)}"
        aria-controls="${escAttr(id)}" aria-pressed="false"
        aria-label="${escAttr(t('auth.showPassword'))}"
        title="${escAttr(t('auth.showPassword'))}">${icon('eye')}</button>
    </span>`
}

/**
 * Aankh wale buttons ko chalata hai.
 *
 * Do baatein ehtiyat maangti hain:
 *   - `mousedown` rok dete hain, warna button par ungli rakhte hi khana focus
 *     kho deta hai aur phone ka keyboard band ho jata hai — dukandar ko har
 *     dafa dobara khana daba kar likhna parta.
 *   - `type` badalne par browser cursor aakhir me phenk deta hai. Beech me
 *     ghalti theek karte hue ye bohat kharab lagta hai, is liye jagah yaad
 *     rakh kar wapas laga dete hain.
 */
export function wirePasswordToggles(root) {
  for (const button of root.querySelectorAll('[data-pwtoggle]')) {
    const input = root.querySelector(`#${CSS.escape(button.dataset.pwtoggle)}`)
    if (!input) continue

    button.addEventListener('mousedown', (e) => e.preventDefault())

    button.addEventListener('click', () => {
      const show = input.type === 'password'
      const start = input.selectionStart
      const end = input.selectionEnd
      const hadFocus = document.activeElement === input

      input.type = show ? 'text' : 'password'

      button.setAttribute('aria-pressed', String(show))
      const label = t(show ? 'auth.hidePassword' : 'auth.showPassword')
      button.setAttribute('aria-label', label)
      button.setAttribute('title', label)
      button.innerHTML = icon(show ? 'eyeOff' : 'eye')

      if (hadFocus) {
        input.focus()
        try {
          if (start !== null) input.setSelectionRange(start, end)
        } catch {
          // Kuch browsers `text` par selection nahi lagane dete — koi harj nahi.
        }
      }
    })
  }
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
  const text = level === 'out' ? t('home.outOfStock') : formatQty(p.stockQty, p, unitLabel)
  const cls = level === 'out' ? ' badge--out' : level === 'low' ? ' badge--low' : ''
  return `<span class="badge${cls}">${esc(text)}</span>`
}

/**
 * Tasveer ab alag collection me hai, is liye card pehle khali dabba dikhata
 * hai aur `data-image` dekh kar screen baad me tasveer bhar deti hai. Purane
 * products me tasveer document ke andar hi hoti thi — wo bhi chalti hai.
 */
/**
 * Packet me kitna hai — "2 L" jaisa chhota nishan tasveer ke kone me.
 *
 * Pehle ye naam ke neeche likha jata tha ("1.5 L each") jahan brand aur baqi
 * tafseel ke saath dab jata tha. 2 litre ki bottle aur 500 ml ki bottle me
 * farq ek nazar me dikhna chahiye — is liye ab seedha tasveer par.
 */
export function packBadge(product) {
  const size = formatPackSizeShort(product)
  // dir="ltr" ke baghair Urdu me "2 L" ulat kar "L 2" ban jata hai.
  return size ? `<span class="packbadge" dir="ltr">${esc(size)}</span>` : ''
}

/**
 * Doosre kone ka nishan — wo baat jo dukandar ko FORAN pata honi chahiye.
 *
 * Wahi soch jo "2 L" wale nishan ke peeche hai: jo cheez ek nazar me dikhni
 * chahiye wo tasveer par honi chahiye, naam ke neeche likhi tafseel me nahi.
 * Expiry ki tareekh pehle sirf Stock screen par nazar aati thi — halanke doodh
 * aur bread bechne wale ko wo products ki list me chahiye hoti hai.
 *
 * Ek waqt me sirf ek nishan, is tarteeb se: khatam ho chuki > jald khatam >
 * band ho chuki > chhupi hui. Do teen nishan ek saath lagane se tasveer hi
 * dhak jati hai aur koi bhi baat nahi pahunchti.
 */
export function alertBadge(product) {
  if (product.expiryDate) {
    const days = daysUntil(product.expiryDate)
    if (days < 0) {
      return `<span class="cornerbadge cornerbadge--danger">${esc(t('badge.expired'))}</span>`
    }
    if (days <= EXPIRY_WARNING_DAYS) {
      return `<span class="cornerbadge cornerbadge--warn">${esc(t('badge.expiresIn', { days }))}</span>`
    }
  }
  if (product.status === 'discontinued') {
    return `<span class="cornerbadge cornerbadge--danger">${esc(t('badge.ended'))}</span>`
  }
  if (product.status === 'hidden') {
    return `<span class="cornerbadge">${esc(t('products.inactive'))}</span>`
  }
  return ''
}

/**
 * Badge thumb ke BAHAR baithta hai, andar nahi.
 *
 * Tasveer baad me `fillImages()` bharta hai aur wo thumb ka andar ka hissa
 * poora badal deta hai — badge andar hota to tasveer aate hi gayab ho jata.
 */
function thumb(product, fallback, big = false) {
  const cls = big ? 'thumb thumb--lg' : 'thumb'
  const badges = packBadge(product) + alertBadge(product)

  let inner
  if (product.image) {
    inner = `<div class="${cls}"><img src="${escAttr(product.image)}" alt="" loading="lazy"></div>`
  } else if (product.imageId) {
    inner = `<div class="${cls}" data-image="${escAttr(product.imageId)}">${esc(fallback || '📦')}</div>`
  } else {
    inner = `<div class="${cls}">${esc(fallback || '📦')}</div>`
  }

  if (!badges) return inner
  return `<div class="thumbwrap">${inner}${badges}</div>`
}

export function productCard(product, { categoryIcon, currency }) {
  return `
    <div class="pcard">
      <button class="pcard__main" data-open="${escAttr(product.id)}">
        ${thumb(product, categoryIcon)}
        <div style="min-width:0;flex:1">
          <p class="bold truncate">${esc(localizedName(product))}</p>
          ${product.brand ? `<p class="small muted truncate">${esc(product.brand)}</p>` : ''}
          <p class="small" style="margin-top:2px">
            <span class="price">${esc(formatMoney(product.salePrice, currency))}</span>
            <span class="faint"> / ${esc(priceUnitLabel(product, unitLabel))}</span>
          </p>
        </div>
      </button>
      <div class="pcard__side">
        ${quickStock(product)}
      </div>
    </div>`
}

/**
 * Stock ek tap me kam/zyada — sheet kholne ki zaroorat nahi.
 *
 * Dukan par sab se aam kaam yehi hai: ek cheez bik gayi, stock ek kam.
 * Badge par tap karne se poora sheet khulta hai jahan miqdaar, wajah aur
 * note likh sakte hain.
 */
export function quickStock(product) {
  const out = (product.stockQty || 0) <= 0
  // Buttons badge ke NEECHE — saath rakhne se product ka naam kat jata tha.
  return `
    <div class="quickstock">
      <button class="quickstock__value" data-adjust="${escAttr(product.id)}"
        aria-label="${escAttr(t('detail.adjustStock'))}">${stockBadge(product)}</button>
      <div class="quickstock__row">
        <button class="quickstock__btn" data-minus="${escAttr(product.id)}"
          ${out ? 'disabled' : ''} aria-label="${escAttr(t('stock.removeOne'))}">−</button>
        <button class="quickstock__btn quickstock__btn--plus" data-plus="${escAttr(product.id)}"
          aria-label="${escAttr(t('stock.addOne'))}">+</button>
      </div>
    </div>`
}

/**
 * Grid view — do products fi qatar, tasveer bari.
 *
 * Jin dukandaron ko cheez tasveer se pehchanni ho un ke liye ye behtar hai;
 * jinhe naam aur stock tezi se scan karna ho, un ke liye list view.
 */
export function productGridCard(product, { categoryIcon, currency }) {
  const out = (product.stockQty || 0) <= 0

  return `
    <div class="gcard">
      <button class="gcard__main" data-open="${escAttr(product.id)}">
        <div class="gcard__thumb">${thumbInner(product, categoryIcon)}${packBadge(product)}${alertBadge(product)}</div>
        <p class="gcard__name" dir="auto">${esc(localizedName(product))}</p>
        <p class="gcard__sub truncate">${product.brand ? esc(product.brand) : '&nbsp;'}</p>
        <p class="gcard__price">
          <span class="price">${esc(formatMoney(product.salePrice, currency))}</span>
          <span class="faint tiny"> / ${esc(priceUnitLabel(product, unitLabel))}</span>
        </p>
      </button>

      <div class="gcard__foot">
        <button class="quickstock__value" data-adjust="${escAttr(product.id)}"
          aria-label="${escAttr(t('detail.adjustStock'))}">${stockBadge(product)}</button>
        <div class="quickstock__row">
          <button class="quickstock__btn" data-minus="${escAttr(product.id)}"
            ${out ? 'disabled' : ''} aria-label="${escAttr(t('stock.removeOne'))}">−</button>
          <button class="quickstock__btn quickstock__btn--plus" data-plus="${escAttr(product.id)}"
            aria-label="${escAttr(t('stock.addOne'))}">+</button>
        </div>
      </div>
    </div>`
}

/** Thumb ka andar ka hissa — grid aur list dono istemaal karte hain. */
function thumbInner(product, fallback) {
  if (product.image) return `<img src="${escAttr(product.image)}" alt="" loading="lazy">`
  if (product.imageId) {
    return `<span data-image="${escAttr(product.imageId)}">${esc(fallback || '📦')}</span>`
  }
  return esc(fallback || '📦')
}

export function productThumbLarge(product, fallback) {
  return thumb(product, fallback, true)
}

// -------------------------------------------------------------- movements

/**
 * Jin thumbnails par `data-image` hai un ki tasveer alag collection se
 * mangwa kar bhar deta hai. Screen render hone ke baad ek baar chalta hai.
 */
export function fillImages(root, loadImage) {
  for (const el of root.querySelectorAll('[data-image]')) {
    const id = el.dataset.image
    el.removeAttribute('data-image')
    loadImage(id).then((data) => {
      if (!data || !el.isConnected) return
      // Grid me placeholder ek <span> hai jo thumb ke andar baitha hai —
      // usay poora badalna hota hai, warna emoji tasveer ke saath reh jata.
      const img = `<img src="${escAttr(data)}" alt="">`
      if (el.tagName === 'SPAN') el.outerHTML = img
      else el.innerHTML = img
    })
  }
}

export function movementRow(movement, product, productName = '') {
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
        <p class="tiny muted"><span dir="ltr">${esc(movement.when)}</span>${movement.note ? ` · ${esc(movement.note)}` : ''}</p>
      </div>
      <div class="mrow__qty">
        <!--
          dir="ltr" lazmi hai. Urdu me poori screen RTL hoti hai, aur us me
          "+9 پیکٹ" jaisi mili juli line browser ulat kar "9+ پیکٹ" bana deta
          tha — jama ka nishan adad ke ghalat taraf. Yehi baat waqt ke saath
          bhi hoti thi ("4:33 AM" se "AM 4:33"). Ye tukra baqi jumle se alag
          rehna chahiye.
        -->
        <p class="small bold" dir="ltr">${isAdjust ? '' : sign}${esc(formatQty(movement.qty, product, unitLabel))}</p>
        <p class="tiny faint" dir="ltr">→ ${esc(formatQty(movement.balanceAfter, product, unitLabel))}</p>
      </div>
    </li>`
}

// -------------------------------------------------------------------- nav

const TABS = [
  { path: '/', key: 'nav.home', icon: 'home' },
  { path: '/products', key: 'nav.products', icon: 'products' },
  { path: '/khata', key: 'nav.khata', icon: 'khata' },
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
