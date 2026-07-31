import { esc, escAttr, on } from '../lib/dom.js'
import { t, localizedName, getLang } from '../i18n/index.js'
import { navigate } from '../lib/router.js'
import { state, productById } from '../store.js'
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
  const recent = state.movements.slice(0, 6)

  root.innerHTML = `
    <div class="screen">
      <header class="pad" style="padding-bottom:8px;padding-top:calc(env(safe-area-inset-top) + 16px)">
        <p class="small muted">${esc(t('home.title'))}</p>
        <h1 dir="auto">${esc(state.settings.shopName || t('home.title'))}</h1>
      </header>

      <div class="pad" style="padding-top:0">
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
                    if (!product) return ''
                    return movementRow(
                      { ...m, when: formatDateTime(m.createdAt, getLang()) },
                      product.unit,
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
