import { esc, escAttr, on, toast } from '../lib/dom.js'
import { t, unitLabel, localizedName, getLang } from '../i18n/index.js'
import { navigate } from '../lib/router.js'
import { state, productById } from '../store.js'
import { appBar, empty, loading, section, movementRow, stockLevel } from '../components.js'
import { formatMoney, formatDateTime, daysUntil } from '../lib/format.js'
import { formatQty } from '../lib/units.js'
import { openStockSheet } from './stock-sheet.js'

/** Itne din ke andar miyaad khatam ho to "jald khatam" mana jata hai. */
const EXPIRY_WARNING_DAYS = 30

let activeTab = 'alerts'

/** Alerts ki grouping — Dashboard bhi yehi function istemaal karta hai. */
export function groupStockAlerts(products) {
  const groups = { out: [], low: [], expiring: [], expired: [] }

  for (const p of products) {
    if (p.isActive === false) continue

    const level = stockLevel(p)
    if (level === 'out') groups.out.push(p)
    else if (level === 'low') groups.low.push(p)

    if (p.expiryDate) {
      const days = daysUntil(p.expiryDate)
      if (days < 0) groups.expired.push(p)
      else if (days <= EXPIRY_WARNING_DAYS) groups.expiring.push(p)
    }
  }
  return groups
}

export function renderStock(root, rerender) {
  if (!state.ready) {
    root.innerHTML = loading()
    return
  }

  const groups = groupStockAlerts(state.products)
  const reorder = [...groups.out, ...groups.low]

  root.innerHTML = `
    <div class="screen">
      ${appBar(t('stock.title'))}

      <div class="tabs" role="tablist">
        <button role="tab" aria-selected="${activeTab === 'alerts'}" data-tab="alerts">
          ${esc(t('stock.tabAlerts'))}${reorder.length ? `<span class="count">${reorder.length}</span>` : ''}
        </button>
        <button role="tab" aria-selected="${activeTab === 'history'}" data-tab="history">
          ${esc(t('stock.tabHistory'))}
        </button>
      </div>

      ${activeTab === 'alerts' ? alertsTab(groups, reorder) : historyTab()}
    </div>`

  on(root, 'click', '[data-tab]', (_e, el) => {
    activeTab = el.dataset.tab
    rerender()
  })
  on(root, 'click', '[data-open]', (_e, el) => navigate(`/product/${el.dataset.open}`))
  on(root, 'click', '[data-adjust]', (_e, el) => {
    const product = productById(el.dataset.adjust)
    if (product) openStockSheet(product)
  })
  on(root, 'click', '[data-share]', () => shareReorderList(reorder))
}

function alertsTab(groups, reorder) {
  if (!reorder.length && !groups.expiring.length && !groups.expired.length) {
    return empty('✅', t('stock.lowStockEmpty'))
  }

  return `
    <div class="pad" style="padding-top:0">
      ${
        reorder.length
          ? section(
              t('stock.lowStockTitle'),
              `<ul class="plist">${reorder.map((p) => alertRow(p)).join('')}</ul>`,
              `<button class="btn btn--ghost" data-share>📤 ${esc(t('stock.shareList'))}</button>`,
            )
          : ''
      }
      ${
        groups.expired.length
          ? section(
              t('stock.expiredTitle'),
              `<ul class="plist">${groups.expired.map((p) => alertRow(p, 'danger')).join('')}</ul>`,
            )
          : ''
      }
      ${
        groups.expiring.length
          ? section(
              t('stock.expiringTitle'),
              `<ul class="plist">${groups.expiring.map((p) => alertRow(p, 'warn')).join('')}</ul>`,
            )
          : ''
      }
    </div>`
}

function alertRow(product, tone = '') {
  const level = stockLevel(product)
  const expiryDays = product.expiryDate ? daysUntil(product.expiryDate) : null
  const borderStyle =
    tone === 'danger'
      ? 'border-color:var(--danger)'
      : tone === 'warn'
        ? 'border-color:var(--warn)'
        : ''

  const bits = []
  bits.push(
    level === 'out'
      ? `<span style="color:var(--danger);font-weight:600">${esc(t('home.outOfStock'))}</span>`
      : esc(formatQty(product.stockQty, product.unit, unitLabel)),
  )
  if (expiryDays !== null) {
    bits.push(
      esc(expiryDays < 0 ? t('detail.expiredOn') : t('detail.daysLeft', { days: expiryDays })),
    )
  }
  bits.push(esc(formatMoney(product.salePrice, state.settings.currency)))

  return `
    <li class="pcard" style="${borderStyle}">
      <button class="pcard__main" data-open="${escAttr(product.id)}">
        <div style="min-width:0;flex:1">
          <p class="bold truncate" dir="auto">${esc(localizedName(product))}</p>
          <p class="tiny muted">${bits.join(' · ')}</p>
        </div>
      </button>
      <button class="mini-btn" data-adjust="${escAttr(product.id)}"
        aria-label="${escAttr(t('detail.adjustStock'))}">+</button>
    </li>`
}

function historyTab() {
  if (!state.movements.length) return empty('📋', t('stock.historyEmpty'))

  const rows = state.movements
    .map((m) => {
      const product = productById(m.productId)
      if (!product) return ''
      return movementRow(
        { ...m, when: formatDateTime(m.createdAt, getLang()) },
        product.unit,
        localizedName(product),
      )
    })
    .join('')

  return `<ul class="plist pad" style="padding-top:0">${rows}</ul>`
}

/** Supplier ko bhejne ke liye plain text list. */
async function shareReorderList(reorder) {
  if (!reorder.length) return

  const lines = reorder.map(
    (p) => `• ${localizedName(p)} — ${formatQty(p.stockQty, p.unit, unitLabel)}`,
  )
  const header = state.settings.shopName
    ? `${state.settings.shopName}\n${t('stock.lowStockTitle')}`
    : t('stock.lowStockTitle')
  const text = `${header}\n\n${lines.join('\n')}`

  if (navigator.share) {
    try {
      await navigator.share({ title: t('stock.lowStockTitle'), text })
      return
    } catch {
      // User ne share sheet band kar di — neeche clipboard par gir jate hain.
    }
  }
  try {
    await navigator.clipboard.writeText(text)
    toast(t('common.copied'))
  } catch {
    toast(t('error.generic'))
  }
}
