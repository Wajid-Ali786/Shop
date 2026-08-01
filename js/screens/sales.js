import { esc, escAttr, on } from '../lib/dom.js'
import { t, getLang } from '../i18n/index.js'
import { goBack } from '../lib/router.js'
import { state, saleById, todayTotals, startOfToday } from '../store.js'
import { appBar, empty, loading, section } from '../components.js'
import { formatMoney, formatDateTime, formatDate } from '../lib/format.js'
import { openReceipt } from './receipt.js'

/** Aaj ka aur pichhle dinon ka hisaab. */
export function renderSales(root) {
  if (!state.ready) {
    root.innerHTML = loading()
    return
  }

  const today = todayTotals()
  const currency = state.settings.currency
  const older = state.sales.filter((s) => s.createdAt < startOfToday())

  root.innerHTML = `
    <div class="screen">
      ${appBar(t('sales.title'), { back: true })}

      <div class="pad">
        <div class="grid-2" style="margin-bottom:12px">
          <div class="card">
            <p class="stat__label">${esc(t('sales.todayTotal'))}</p>
            <p class="stat__value">${esc(formatMoney(today.total, currency))}</p>
          </div>
          <div class="card">
            <p class="stat__label">${esc(t('sales.todayProfit'))}</p>
            <p class="stat__value" style="color:var(--brand)">
              ${esc(formatMoney(today.profit, currency))}
            </p>
          </div>
        </div>
        <p class="tiny muted center" style="margin-bottom:20px">
          ${esc(t('sales.todayCount', { count: today.count }))}
        </p>

        ${
          today.sales.length
            ? section(t('sales.today'), `<ul class="plist">${today.sales.map(row).join('')}</ul>`)
            : empty('🧾', t('sales.emptyToday'), t('sales.emptyTodayHint'))
        }

        ${older.length ? section(t('sales.earlier'), `<ul class="plist">${older.map(row).join('')}</ul>`) : ''}
      </div>
    </div>`

  on(root, 'click', '[data-back]', () => goBack())
  on(root, 'click', '[data-sale]', (_e, el) => {
    const sale = saleById(el.dataset.sale)
    if (sale) openReceipt(sale)
  })
}

function row(sale) {
  const currency = state.settings.currency
  const count = (sale.items || []).length
  const isToday = sale.createdAt >= startOfToday()

  return `
    <li>
      <button class="list-row" data-sale="${escAttr(sale.id)}">
        <span style="flex:1;min-width:0">
          <span class="bold">${esc(formatMoney(sale.total, currency))}</span>
          <span class="tiny muted" style="display:block">
            ${esc(t('sales.itemCount', { count }))} ·
            ${esc(isToday ? formatDateTime(sale.createdAt, getLang()) : formatDate(sale.createdAt, getLang()))}
          </span>
        </span>
        <span class="tiny" style="color:var(--brand)">
          +${esc(formatMoney(sale.profit || 0, currency))}
        </span>
      </button>
    </li>`
}
