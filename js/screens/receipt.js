import { esc, openSheet, closeSheet, toast, $ } from '../lib/dom.js'
import { t, unitLabel, getLang } from '../i18n/index.js'
import { state } from '../store.js'
import { formatMoney, formatDateTime } from '../lib/format.js'
import { formatQty } from '../lib/units.js'

/**
 * Parchi.
 *
 * Chhoti dukan par printer nahi hota, lekin har grahak ke paas WhatsApp hota
 * hai — is liye parchi saada text hai jo copy ya share ho jati hai. Print
 * karna ho to browser ka apna print bhi chal jata hai.
 */

function lineUnit(item) {
  // Parchi me wahi unit jo bikte waqt thi — product baad me badla ho to bhi.
  return formatQty(item.qty, { sellBy: item.sellBy, unit: item.unit, packLabel: item.packLabel }, unitLabel)
}

export function receiptText(sale) {
  const currency = state.settings.currency
  const head = state.settings.shopName || t('home.title')

  const lines = (sale.items || []).map(
    (i) => `${i.name}  ${lineUnit(i)} × ${formatMoney(i.price, currency)} = ${formatMoney(i.total, currency)}`,
  )

  return [
    head,
    formatDateTime(sale.createdAt || Date.now(), getLang()),
    '',
    ...lines,
    '',
    `${t('sale.total')}: ${formatMoney(sale.total, currency)}`,
  ].join('\n')
}

export function openReceipt(sale) {
  const currency = state.settings.currency

  const rows = (sale.items || [])
    .map(
      (i) => `
      <li class="receipt__line">
        <span class="truncate" dir="auto">${esc(i.name)}</span>
        <span class="tiny muted">${esc(lineUnit(i))} × ${esc(formatMoney(i.price, currency))}</span>
        <span class="bold">${esc(formatMoney(i.total, currency))}</span>
      </li>`,
    )
    .join('')

  const wrap = openSheet(t('sale.receipt'), `
    <div class="receipt">
      <p class="center bold" dir="auto">${esc(state.settings.shopName || t('home.title'))}</p>
      <p class="center tiny muted" style="margin-bottom:14px">
        ${esc(formatDateTime(sale.createdAt || Date.now(), getLang()))}
      </p>

      <ul class="receipt__lines">${rows}</ul>

      <div class="receipt__total">
        <span class="bold">${esc(t('sale.total'))}</span>
        <span class="bold" style="font-size:1.35rem">${esc(formatMoney(sale.total, currency))}</span>
      </div>

      ${
        sale.profit !== undefined
          ? `<p class="tiny muted center" style="margin-top:8px">
               ${esc(t('sale.profitLine', { amount: formatMoney(sale.profit, currency) }))}
             </p>`
          : ''
      }
    </div>

    <div class="row" style="gap:8px;margin-top:18px">
      <button class="btn btn--primary" style="flex:1" id="receipt-share">
        📤 ${esc(t('common.share'))}
      </button>
      <button class="btn btn--secondary" style="flex:1" id="receipt-done">
        ${esc(t('common.done'))}
      </button>
    </div>`)

  const body = wrap.querySelector('.sheet__body')

  $('#receipt-done', body).addEventListener('click', () => closeSheet())

  $('#receipt-share', body).addEventListener('click', async () => {
    const text = receiptText(sale)
    if (navigator.share) {
      try {
        await navigator.share({ title: t('sale.receipt'), text })
        return
      } catch {
        // Share sheet band kar di — neeche clipboard par gir jate hain.
      }
    }
    try {
      await navigator.clipboard.writeText(text)
      toast(t('common.copied'))
    } catch {
      toast(t('error.generic'))
    }
  })
}
