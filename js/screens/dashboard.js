import { esc, escAttr, on } from '../lib/dom.js'
import { t, localizedName, getLang } from '../i18n/index.js'
import { navigate } from '../lib/router.js'
import { state, productById, todayTotals } from '../store.js'
import { empty, loading, section, movementRow } from '../components.js'
import { formatMoney, formatDateTime } from '../lib/format.js'
import { groupStockAlerts } from './stock.js'

export function renderDashboard(root) {
  if (!state.ready) {
    root.innerHTML = loading()
    return
  }

  const groups = groupStockAlerts(state.products)
  // Inventory value khareed rate par — cost na ho to sale price hi le lete hain.
  const value = state.products.reduce(
    (sum, p) => sum + (p.stockQty || 0) * (p.costPrice ?? p.salePrice ?? 0),
    0,
  )
  // Pehle wo movements chhanto jin ka product mojood hai, PHIR 6 lo — warna
  // agar aakhri 6 kisi delete-shuda product ki hon to list khali lagti hai.
  const recent = state.movements.filter((m) => productById(m.productId)).slice(0, 6)

  root.innerHTML = `
    <div class="screen">
      <header class="pad" style="padding-bottom:8px;padding-top:calc(env(safe-area-inset-top) + 16px)">
        <p class="small muted">${esc(t('home.title'))}</p>
        <h1 dir="auto">${esc(state.settings.shopName || t('home.title'))}</h1>
      </header>

      <div class="pad" style="padding-top:0">
        ${todayCard()}
        ${
          state.products.length === 0
            ? empty(
                '🏪',
                t('home.emptyTitle'),
                t('home.emptyBody'),
                `<button class="btn btn--primary" data-add>${esc(t('home.quickAdd'))}</button>`,
              )
            : `
          <div class="grid-2" style="margin-bottom:12px">
            ${stat(t('home.totalProducts'), String(state.products.length), '', '/products')}
            ${stat(t('home.inventoryValue'), formatMoney(value, state.settings.currency), '', '', true)}
          </div>

          <div class="grid-2" style="margin-bottom:24px">
            ${stat(t('home.lowStock'), String(groups.low.length), groups.low.length ? 'warn' : '', '/stock')}
            ${stat(t('home.outOfStock'), String(groups.out.length), groups.out.length ? 'danger' : '', '/stock')}
            ${groups.expiring.length ? stat(t('home.expiringSoon'), String(groups.expiring.length), 'warn', '/stock') : ''}
            ${groups.expired.length ? stat(t('home.expired'), String(groups.expired.length), 'danger', '/stock') : ''}
          </div>

          ${
            groups.low.length || groups.out.length
              ? `<button class="btn btn--secondary btn--full" data-go="/stock" style="margin-bottom:24px">
                   📋 ${esc(t('home.viewLowStock'))}
                 </button>`
              : ''
          }

          ${section(
            t('home.recentActivity'),
            recent.length
              ? `<ul class="plist">${recent
                  .map((m) => {
                    const product = productById(m.productId)
                    return movementRow(
                      { ...m, when: formatDateTime(m.createdAt, getLang()) },
                      product,
                      localizedName(product),
                    )
                  })
                  .join('')}</ul>`
              : `<div class="card"><p class="small muted center">${esc(t('home.noActivity'))}</p></div>`,
          )}`
        }
      </div>
    </div>

    ${state.products.length ? `<button class="fab" data-add aria-label="${escAttr(t('home.quickAdd'))}">+</button>` : ''}`

  on(root, 'click', '[data-add]', () => navigate('/product/new'))
  on(root, 'click', '[data-go]', (_e, el) => navigate(el.dataset.go))
}

/**
 * Aaj ki bikri sab se upar — dukandar din me sab se zyada yehi dekhta hai:
 * "abhi tak kitna bika, kitna bacha".
 */
function todayCard() {
  const today = todayTotals()
  const currency = state.settings.currency

  return `
    <div class="card today" style="margin-bottom:16px">
      <div class="row row--between" style="margin-bottom:10px">
        <span class="stat__label">${esc(t('sales.todayTotal'))}</span>
        <button class="btn btn--ghost btn--sm" data-go="/sales">${esc(t('sales.viewAll'))}</button>
      </div>

      <p style="font-size:1.9rem;font-weight:700;line-height:1.1">
        ${esc(formatMoney(today.total, currency))}
      </p>
      <p class="small muted" style="margin-top:2px">
        ${esc(t('sales.todayCount', { count: today.count }))} ·
        <span style="color:var(--brand)">${esc(t('sales.profitLine', { amount: formatMoney(today.profit, currency) }))}</span>
      </p>

      <button class="btn btn--primary btn--full" data-go="/sale" style="margin-top:14px">
        🧾 ${esc(t('sale.new'))}
      </button>
    </div>`
}

function stat(label, value, tone = '', goTo = '', small = false) {
  const cls = tone ? ` stat--${tone}` : ''
  const attrs = goTo ? ` data-go="${escAttr(goTo)}"` : ''
  const tag = goTo ? 'button' : 'div'

  return `
    <${tag} class="stat${cls}"${attrs}>
      <p class="stat__label">${esc(label)}</p>
      <p class="stat__value${small ? ' stat__value--sm' : ''}">${esc(value)}</p>
    </${tag}>`
}
