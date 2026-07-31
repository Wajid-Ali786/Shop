/**
 * Stock badalne ka sheet — Products list, Product detail aur Stock screen,
 * teenon yehi kholti hain.
 */
import { openSheet, closeSheet, toast, esc, escAttr, $ } from '../lib/dom.js'
import { t, unitLabel, localizedName } from '../i18n/index.js'
import { field, options } from '../components.js'
import { adjustStock, setStockCount } from '../store.js'
import {
  allowsFraction,
  compatibleUnits,
  formatQty,
  formatPackTotal,
  isPack,
  toBase,
} from '../lib/units.js'

const REASONS = {
  in: ['purchase', 'correction', 'other'],
  out: ['sale', 'damage', 'expired', 'other'],
  count: ['correction'],
}

export function openStockSheet(product, onDone) {
  let mode = 'in'
  const packed = isPack(product)

  // Pack products ginti me chalte hain (6 bottle), un me gram/ml ka koi
  // sawaal nahi. Khuli cheez me 500 g bhi likha ja sakta hai.
  const units = packed ? [] : compatibleUnits(product.unit)
  let entryUnit = packed ? product.packLabel || product.unit : product.unit

  const wrap = openSheet(localizedName(product), '')
  const body = wrap.querySelector('.sheet__body')

  function unitControl() {
    if (!packed && units.length > 1) {
      return `<select id="sheet-unit">${options(
        units.map((u) => ({ value: u, label: unitLabel(u) })),
        entryUnit,
      )}</select>`
    }
    return `<div class="unit-fixed">${esc(unitLabel(entryUnit))}</div>`
  }

  /** Pack me poora number; khuli cheez me 0.001 tak. */
  function toStock(value) {
    return packed ? Math.round(value) : toBase(value, entryUnit)
  }

  function draw() {
    const reasons = REASONS[mode]
    body.innerHTML = `
      <div class="card card--flat" style="margin-bottom:16px">
        <p class="tiny muted">${esc(t('stock.currentStock'))}</p>
        <p class="bold" style="font-size:1.15rem">
          ${esc(formatQty(product.stockQty, product, unitLabel))}
        </p>
      </div>

      <div class="choices choices--3" style="margin-bottom:16px">
        <button type="button" class="choice${mode === 'in' ? ' choice--active' : ''}" data-mode="in">
          + ${esc(t('stock.addStock'))}
        </button>
        <button type="button" class="choice${mode === 'out' ? ' choice--active' : ''}" data-mode="out">
          − ${esc(t('stock.removeStock'))}
        </button>
        <button type="button" class="choice${mode === 'count' ? ' choice--active' : ''}" data-mode="count">
          ${esc(t('stock.setCount'))}
        </button>
      </div>

      ${field(
        t('stock.quantity'),
        `<div class="input-group">
           <input id="sheet-qty" type="number" min="0"
             inputmode="${allowsFraction(product) ? 'decimal' : 'numeric'}"
             step="${allowsFraction(product) ? '0.001' : '1'}" placeholder="0" autofocus>
           ${unitControl()}
         </div>`,
        { required: true },
      )}

      <div id="sheet-preview"></div>

      ${
        mode === 'count'
          ? ''
          : field(
              t('stock.reason'),
              `<select id="sheet-reason">${options(
                reasons.map((r) => ({ value: r, label: t(`reason.${r}`) })),
                reasons[0],
              )}</select>`,
            )
      }

      ${field(
        t('stock.note'),
        `<input id="sheet-note" placeholder="${escAttr(t('common.optional'))}" dir="auto">`,
      )}

      <button class="btn btn--primary btn--full" id="sheet-save" disabled>
        ${esc(t('common.save'))}
      </button>`

    const qtyInput = $('#sheet-qty', body)
    const saveBtn = $('#sheet-save', body)
    const preview = $('#sheet-preview', body)

    function refresh() {
      const value = Number.parseFloat(qtyInput.value)
      const valid = Number.isFinite(value) && value >= 0 && qtyInput.value.trim() !== ''
      saveBtn.disabled = !valid

      if (!valid) {
        preview.innerHTML = ''
        return
      }
      const amount = toStock(value)
      const next =
        mode === 'count'
          ? amount
          : Math.max(0, product.stockQty + (mode === 'in' ? amount : -amount))
      const total = formatPackTotal(next, product, unitLabel)

      preview.innerHTML = `
        <div class="card card--flat" style="margin-bottom:16px;background:var(--brand-light);border-color:var(--brand)">
          <p class="tiny" style="color:var(--brand-text)">${esc(t('stock.newStock'))}</p>
          <p class="bold" style="font-size:1.15rem;color:var(--brand-text)">
            ${esc(formatQty(next, product, unitLabel))}${total ? ` <span class="small">= ${esc(total)}</span>` : ''}
          </p>
        </div>`
    }

    qtyInput.addEventListener('input', refresh)
    qtyInput.focus()

    const unitSelect = $('#sheet-unit', body)
    if (unitSelect) {
      unitSelect.addEventListener('change', () => {
        entryUnit = unitSelect.value
        refresh()
      })
    }

    body.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        mode = btn.dataset.mode
        draw()
      })
    })

    saveBtn.addEventListener('click', async () => {
      const value = Number.parseFloat(qtyInput.value)
      if (!Number.isFinite(value)) return

      saveBtn.disabled = true
      saveBtn.innerHTML = '<span class="spinner spinner--sm"></span>'

      try {
        const amount = toStock(value)
        const note = $('#sheet-note', body).value.trim()

        if (mode === 'count') {
          await setStockCount(product.id, amount, note)
        } else {
          // "0 shamil karein" ka koi matlab nahi — chup chaap wapas.
          if (amount === 0) {
            closeSheet()
            return
          }
          await adjustStock({
            productId: product.id,
            qty: amount,
            type: mode,
            reason: $('#sheet-reason', body).value,
            note,
          })
        }
        closeSheet()
        toast(t('stock.adjusted'))
        if (onDone) onDone()
      } catch (err) {
        saveBtn.disabled = false
        saveBtn.textContent = t('common.save')
        toast(err?.code === 'permission-denied' ? t('error.permission') : t('error.generic'))
      }
    })
  }

  draw()
}
