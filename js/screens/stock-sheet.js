/**
 * Stock badalne ka sheet — Products list, Product detail aur Stock screen,
 * teenon yehi kholti hain.
 */
import { openSheet, closeSheet, toast, esc, escAttr, $ } from '../lib/dom.js'
import { t, unitLabel, localizedName } from '../i18n/index.js'
import { field, options } from '../components.js'
import { adjustStock, setStockCount } from '../store.js'
import { allowsFraction, compatibleUnits, formatQty, toBase } from '../lib/units.js'

const REASONS = {
  in: ['purchase', 'correction', 'other'],
  out: ['sale', 'damage', 'expired', 'other'],
  count: ['correction'],
}

export function openStockSheet(product, onDone) {
  let mode = 'in'
  let entryUnit = product.unit
  const units = compatibleUnits(product.unit)

  const wrap = openSheet(localizedName(product), '')
  const body = wrap.querySelector('.sheet__body')

  function unitControl() {
    if (units.length > 1) {
      return `<select id="sheet-unit">${options(
        units.map((u) => ({ value: u, label: unitLabel(u) })),
        entryUnit,
      )}</select>`
    }
    return `<div class="unit-fixed">${esc(unitLabel(product.unit))}</div>`
  }

  function draw() {
    const reasons = REASONS[mode]
    body.innerHTML = `
      <div class="card card--flat" style="margin-bottom:16px">
        <p class="tiny muted">${esc(t('stock.currentStock'))}</p>
        <p class="bold" style="font-size:1.15rem">
          ${esc(formatQty(product.stockQty, product.unit, unitLabel))}
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
             inputmode="${allowsFraction(entryUnit) ? 'decimal' : 'numeric'}"
             step="${allowsFraction(entryUnit) ? '0.001' : '1'}" placeholder="0" autofocus>
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
      const base = toBase(value, entryUnit)
      const next =
        mode === 'count'
          ? base
          : Math.max(0, product.stockQty + (mode === 'in' ? base : -base))

      preview.innerHTML = `
        <div class="card card--flat" style="margin-bottom:16px;background:var(--brand-light);border-color:var(--brand)">
          <p class="tiny" style="color:var(--brand-text)">${esc(t('stock.newStock'))}</p>
          <p class="bold" style="font-size:1.15rem;color:var(--brand-text)">
            ${esc(formatQty(next, product.unit, unitLabel))}
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
        const base = toBase(value, entryUnit)
        const note = $('#sheet-note', body).value.trim()

        if (mode === 'count') {
          await setStockCount(product.id, base, note)
        } else {
          await adjustStock({
            productId: product.id,
            qty: base,
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
