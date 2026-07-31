import { esc, escAttr, on } from '../lib/dom.js'
import { t, unitLabel, localizedName, getLang } from '../i18n/index.js'
import { goBack, navigate } from '../lib/router.js'
import { state, productById, categoriesOf, watchProductMovements, loadImage } from '../store.js'
import {
  appBar, icon, empty, loading, section, stockBadge,
  movementRow, productThumbLarge, fillImages,
} from '../components.js'
import { formatMoney, formatDate, formatDateTime, daysUntil } from '../lib/format.js'
import { formatQty, formatPackSize, formatPackTotal, priceUnitLabel } from '../lib/units.js'
import { openStockSheet } from './stock-sheet.js'

export function renderProductDetail(root, productId) {
  if (!state.ready) {
    root.innerHTML = loading()
    return undefined
  }

  const product = productById(productId)
  if (!product) {
    root.innerHTML = `
      <div class="screen">
        ${appBar(t('detail.notFound'), { back: true })}
        ${empty('❓', t('detail.notFound'))}
      </div>`
    on(root, 'click', '[data-back]', () => navigate('/products'))
    return undefined
  }

  let movements = null

  /**
   * Har product ki apni movements query.
   *
   * Pehle ye poori shop ki aakhri 100 movements me se filter hoti thi, is liye
   * shop me 100 nayi entries hote hi purane product ki history khali dikhne
   * lagti thi. Ab is product ki poori history aati hai.
   */
  const unsubscribe = watchProductMovements(
    productId,
    (rows) => {
      movements = rows
      draw()
    },
    () => {
      movements = []
      draw()
    },
  )

  function draw() {
    const categories = categoriesOf(product)
    // Cost price na ho to sale price par hi qeemat laga dete hain.
    const stockValue = (product.stockQty || 0) * (product.costPrice ?? product.salePrice ?? 0)
    const expiryDays = product.expiryDate ? daysUntil(product.expiryDate) : null
    const packSize = formatPackSize(product, unitLabel)
    const packTotal = formatPackTotal(product.stockQty, product, unitLabel)

    root.innerHTML = `
      <div class="screen screen--form">
        ${appBar(localizedName(product), {
          back: true,
          action: `<button class="icon-btn" data-edit aria-label="${escAttr(t('common.edit'))}">${icon('edit')}</button>`,
        })}

        <div class="pad">
          <div class="card row" style="margin-bottom:16px;align-items:flex-start">
            ${productThumbLarge(product, categories[0]?.icon)}
            <div style="min-width:0;flex:1">
              <h2 class="truncate" dir="auto">${esc(localizedName(product))}</h2>
              ${product.brand ? `<p class="small muted">${esc(product.brand)}</p>` : ''}
              ${packSize ? `<p class="small muted">${esc(t('form.packEach', { size: packSize }))}</p>` : ''}
              ${
                categories.length
                  ? `<p class="tiny muted" style="margin-top:4px">${categories
                      .map((c) => `${esc(c.icon || '')} ${esc(localizedName(c))}`)
                      .join(' · ')}</p>`
                  : ''
              }
              <div style="margin-top:8px">${stockBadge(product)}</div>
            </div>
          </div>

          <div class="grid-2" style="margin-bottom:16px">
            <div class="card">
              <p class="tiny muted">${esc(t('form.salePrice'))}</p>
              <p class="bold price" style="font-size:1.3rem">${esc(formatMoney(product.salePrice, state.settings.currency))}</p>
              <p class="tiny faint">${esc(t('form.perUnit', { unit: priceUnitLabel(product, unitLabel) }))}</p>
            </div>
            <div class="card">
              <p class="tiny muted">${esc(t('detail.stockValue'))}</p>
              <p class="bold" style="font-size:1.3rem">${esc(formatMoney(stockValue, state.settings.currency))}</p>
              <p class="tiny faint">
                ${esc(formatQty(product.stockQty, product, unitLabel))}
                ${packTotal ? ` = ${esc(packTotal)}` : ''}
              </p>
            </div>
          </div>

          ${pricesCard(product)}
          ${expiryCard(product, expiryDays)}
          ${tagsCard(product)}
          ${
            product.barcode
              ? `<div class="card" style="margin-bottom:16px">
                   <p class="tiny muted">${esc(t('form.barcode'))}</p>
                   <p class="bold" dir="ltr">${esc(product.barcode)}</p>
                 </div>`
              : ''
          }

          ${section(
            t('detail.history'),
            movements === null
              ? loading()
              : movements.length
                ? `<ul class="plist">${movements
                    .map((m) =>
                      movementRow({ ...m, when: formatDateTime(m.createdAt, getLang()) }, product),
                    )
                    .join('')}</ul>`
                : empty('📋', t('detail.noHistory')),
          )}
        </div>

        <div class="savebar">
          <button class="btn btn--primary btn--full" data-adjust-open>${esc(t('detail.adjustStock'))}</button>
        </div>
      </div>`

    on(root, 'click', '[data-back]', () => goBack())
    on(root, 'click', '[data-edit]', () => navigate(`/product/${productId}/edit`))
    on(root, 'click', '[data-adjust-open]', () => openStockSheet(product))
    fillImages(root, loadImage)
  }

  draw()
  // app.js screen chhodte hi ye chala dega — warna listener chalta reh jayega.
  return unsubscribe
}

function pricesCard(product) {
  const hasCost = product.costPrice !== null && product.costPrice !== undefined
  const hasWholesale = product.wholesalePrice !== null && product.wholesalePrice !== undefined
  if (!hasCost && !hasWholesale) return ''

  const currency = state.settings.currency
  return `
    <div class="card row" style="margin-bottom:16px;gap:24px">
      ${hasCost ? `<div>
          <p class="tiny muted">${esc(t('form.costPrice'))}</p>
          <p class="bold">${esc(formatMoney(product.costPrice, currency))}</p>
        </div>` : ''}
      ${hasWholesale ? `<div>
          <p class="tiny muted">${esc(t('form.wholesalePrice'))}</p>
          <p class="bold">${esc(formatMoney(product.wholesalePrice, currency))}</p>
        </div>` : ''}
      ${hasCost ? `<div>
          <p class="tiny muted">${esc(t('form.profit'))}</p>
          <p class="bold price">${esc(formatMoney((product.salePrice || 0) - product.costPrice, currency))}</p>
        </div>` : ''}
    </div>`
}

function expiryCard(product, expiryDays) {
  if (!product.expiryDate) return ''
  const expired = expiryDays !== null && expiryDays < 0
  const soon = expiryDays !== null && expiryDays >= 0 && expiryDays <= 30
  const cls = expired ? ' card--danger' : soon ? ' card--warn' : ''

  return `
    <div class="card${cls}" style="margin-bottom:16px">
      <p class="tiny muted">${esc(expired ? t('detail.expiredOn') : t('detail.expires'))}</p>
      <p class="bold">
        ${esc(formatDate(product.expiryDate, getLang()))}
        ${!expired && expiryDays !== null ? `<span class="small muted"> (${esc(t('detail.daysLeft', { days: expiryDays }))})</span>` : ''}
      </p>
    </div>`
}

function tagsCard(product) {
  if (!product.tags?.length) return ''
  const tags = product.tags
    .map((tag) => `<li class="tag tag--plain" dir="auto">${esc(tag)}</li>`)
    .join('')
  return `
    <div class="card" style="margin-bottom:16px">
      <p class="tiny muted" style="margin-bottom:8px">${esc(t('detail.tagsLabel'))}</p>
      <ul class="taglist" style="margin-bottom:0">${tags}</ul>
    </div>`
}
