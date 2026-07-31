import { esc, escAttr, on, toast, confirmAction, $ } from '../lib/dom.js'
import { t, unitLabel, localizedName } from '../i18n/index.js'
import { goBack, navigate } from '../lib/router.js'
import { state, productById, createProduct, updateProduct, deleteProduct } from '../store.js'
import { appBar, field, options, icon, loading } from '../components.js'
import { ALL_UNITS, allowsFraction, fromBase, toBase } from '../lib/units.js'
import { formatMoney } from '../lib/format.js'
import { compressImage } from '../lib/images.js'

const EMPTY = {
  nameEn: '',
  nameUr: '',
  brand: '',
  categoryId: '',
  unit: 'piece',
  costPrice: '',
  salePrice: '',
  wholesalePrice: '',
  stockQty: '',
  lowStockAt: '',
  tags: [],
  barcode: '',
  expiryDate: '',
  isActive: true,
  image: '',
}

export function renderProductForm(root, productId, rerender) {
  const isEdit = Boolean(productId)
  const existing = isEdit ? productById(productId) : null

  if (isEdit && !state.ready) {
    root.innerHTML = loading()
    return
  }
  if (isEdit && !existing) {
    navigate('/products')
    return
  }

  const form = isEdit ? toForm(existing) : { ...EMPTY, lowStockAt: String(state.settings.defaultLowStockAt) }
  let showMore = isEdit
    ? Boolean(
        existing.brand || existing.wholesalePrice || existing.barcode ||
        existing.expiryDate || existing.nameUr || existing.isActive === false,
      )
    : false
  let errors = {}
  let saving = false

  function draw() {
    root.innerHTML = `
      <div class="screen screen--form">
        ${appBar(isEdit ? t('form.editTitle') : t('form.addTitle'), {
          back: true,
          action: isEdit
            ? `<button class="icon-btn icon-btn--danger" data-delete
                 aria-label="${escAttr(t('common.delete'))}">${icon('trash')}</button>`
            : '',
        })}

        <div class="pad">
          <div class="card" style="margin-bottom:16px">
            ${imageField()}

            ${field(
              t('form.nameEn'),
              `<input id="f-nameEn" value="${escAttr(form.nameEn)}" dir="auto"
                 placeholder="${escAttr(t('form.nameEnPlaceholder'))}">`,
              { required: true, error: errors.nameEn },
            )}

            ${field(
              t('form.category'),
              `<select id="f-categoryId">
                 <option value="">${esc(t('common.uncategorized'))}</option>
                 ${options(
                   state.categories.map((c) => ({
                     value: c.id,
                     label: `${c.icon || '📦'} ${localizedName(c)}`,
                   })),
                   form.categoryId,
                 )}
               </select>`,
            )}

            <div class="grid-2">
              ${field(
                t('form.salePrice'),
                `<input id="f-salePrice" type="number" inputmode="decimal" min="0" step="0.01"
                   value="${escAttr(form.salePrice)}" placeholder="0">`,
                { required: true, error: errors.salePrice },
              )}
              ${field(
                t('form.unit'),
                `<select id="f-unit">${options(
                  ALL_UNITS.map((u) => ({ value: u, label: unitLabel(u) })),
                  form.unit,
                )}</select>`,
              )}
            </div>

            <div class="grid-2">
              ${field(
                t('form.stockQty'),
                `<input id="f-stockQty" type="number" min="0"
                   inputmode="${allowsFraction(form.unit) ? 'decimal' : 'numeric'}"
                   step="${allowsFraction(form.unit) ? '0.001' : '1'}"
                   value="${escAttr(form.stockQty)}" placeholder="0"${isEdit ? ' disabled' : ''}>`,
                { hint: isEdit ? t('form.stockLocked') : '' },
              )}
              ${field(
                t('form.lowStockAt'),
                `<input id="f-lowStockAt" type="number" min="0"
                   inputmode="${allowsFraction(form.unit) ? 'decimal' : 'numeric'}"
                   step="${allowsFraction(form.unit) ? '0.001' : '1'}"
                   value="${escAttr(form.lowStockAt)}" placeholder="0">`,
              )}
            </div>
          </div>

          <!-- Hidden tags ka apna card — ye app ka khaas feature hai. -->
          <div class="card" style="margin-bottom:16px">
            ${field(t('form.tags'), tagBox(), { hint: t('form.tagsHint') })}
          </div>

          <button class="btn btn--secondary btn--full" data-toggle-more style="margin-bottom:16px">
            ${showMore ? `▲ ${esc(t('form.lessOptions'))}` : `▼ ${esc(t('form.moreOptions'))}`}
          </button>

          ${showMore ? moreCard() : ''}
        </div>

        <div class="savebar">
          <button class="btn btn--primary btn--full" data-save ${saving ? 'disabled' : ''}>
            ${saving ? '<span class="spinner spinner--sm"></span>' : esc(t('common.save'))}
          </button>
        </div>
      </div>`

    wire()
  }

  function imageField() {
    return `
      <div class="field">
        <span class="field__label">${esc(t('form.image'))}</span>
        <div class="row">
          <div class="thumb thumb--lg" id="img-preview">
            ${form.image ? `<img src="${escAttr(form.image)}" alt="">` : '📷'}
          </div>
          <div class="col" style="flex:1;gap:8px">
            <div class="row" style="gap:8px">
              <button type="button" class="btn btn--secondary btn--sm" data-pick="camera" style="flex:1">
                📷 ${esc(t('form.takePhoto'))}
              </button>
              <button type="button" class="btn btn--secondary btn--sm" data-pick="gallery" style="flex:1">
                🖼️ ${esc(t('form.choosePhoto'))}
              </button>
            </div>
            ${
              form.image
                ? `<button type="button" class="btn btn--ghost btn--sm" data-remove-image
                     style="color:var(--danger);align-self:flex-start">
                     ${esc(t('form.removePhoto'))}
                   </button>`
                : ''
            }
          </div>
        </div>
        <input type="file" accept="image/*" capture="environment" id="file-camera" hidden>
        <input type="file" accept="image/*" id="file-gallery" hidden>
      </div>`
  }

  function tagBox() {
    const tags = form.tags
      .map(
        (tag, i) => `
        <li class="tag">
          <span dir="auto">${esc(tag)}</span>
          <button type="button" data-rm-tag="${i}" aria-label="${escAttr(t('common.delete'))}">✕</button>
        </li>`,
      )
      .join('')

    return `
      <div class="tagbox">
        ${tags ? `<ul class="taglist">${tags}</ul>` : ''}
        <input id="f-tag" placeholder="${escAttr(t('form.tagsPlaceholder'))}" dir="auto">
      </div>`
  }

  function moreCard() {
    const cost = Number.parseFloat(form.costPrice)
    const sale = Number.parseFloat(form.salePrice)
    const showProfit = Number.isFinite(cost) && Number.isFinite(sale) && cost > 0
    const profit = showProfit ? sale - cost : 0
    const margin = showProfit && sale > 0 ? (profit / sale) * 100 : 0

    return `
      <div class="card">
        ${field(
          t('form.nameUr'),
          `<input id="f-nameUr" value="${escAttr(form.nameUr)}" dir="rtl"
             placeholder="${escAttr(t('form.nameUrPlaceholder'))}">`,
        )}
        ${field(
          t('form.brand'),
          `<input id="f-brand" value="${escAttr(form.brand)}" dir="auto"
             placeholder="${escAttr(t('form.brandPlaceholder'))}">`,
        )}

        <div class="grid-2">
          ${field(
            t('form.costPrice'),
            `<input id="f-costPrice" type="number" inputmode="decimal" min="0" step="0.01"
               value="${escAttr(form.costPrice)}" placeholder="0">`,
          )}
          ${field(
            t('form.wholesalePrice'),
            `<input id="f-wholesalePrice" type="number" inputmode="decimal" min="0" step="0.01"
               value="${escAttr(form.wholesalePrice)}" placeholder="0">`,
          )}
        </div>

        ${
          showProfit
            ? `<div class="card card--flat" style="background:var(--brand-light);border-color:var(--brand);margin-bottom:16px">
                 <div class="row" style="gap:24px">
                   <div>
                     <p class="tiny" style="color:var(--brand-text)">${esc(t('form.profit'))}</p>
                     <p class="bold" style="color:var(--brand-text)">${esc(formatMoney(profit, state.settings.currency))}</p>
                   </div>
                   <div>
                     <p class="tiny" style="color:var(--brand-text)">${esc(t('form.margin'))}</p>
                     <p class="bold" style="color:var(--brand-text)">${margin.toFixed(1)}%</p>
                   </div>
                 </div>
               </div>`
            : ''
        }

        ${field(
          t('form.barcode'),
          `<input id="f-barcode" value="${escAttr(form.barcode)}" inputmode="numeric" dir="ltr"
             placeholder="8964000...">`,
        )}
        ${field(
          t('form.expiryDate'),
          `<input id="f-expiryDate" type="date" value="${escAttr(form.expiryDate)}" dir="ltr">`,
        )}

        <label class="checkbox-row">
          <input type="checkbox" id="f-isActive" ${form.isActive ? 'checked' : ''}>
          <span class="small bold">${esc(t('form.isActive'))}</span>
        </label>
      </div>`
  }

  // --------------------------------------------------------------- events

  function readInputs() {
    const get = (id) => {
      const el = $(`#${id}`, root)
      return el ? el.value : ''
    }
    form.nameEn = get('f-nameEn')
    form.categoryId = get('f-categoryId')
    form.salePrice = get('f-salePrice')
    form.unit = get('f-unit') || form.unit
    form.lowStockAt = get('f-lowStockAt')
    if (!isEdit) form.stockQty = get('f-stockQty')

    if (showMore) {
      form.nameUr = get('f-nameUr')
      form.brand = get('f-brand')
      form.costPrice = get('f-costPrice')
      form.wholesalePrice = get('f-wholesalePrice')
      form.barcode = get('f-barcode')
      form.expiryDate = get('f-expiryDate')
      const active = $('#f-isActive', root)
      if (active) form.isActive = active.checked
    }
  }

  function wire() {
    on(root, 'click', '[data-back]', () => goBack())

    on(root, 'click', '[data-toggle-more]', () => {
      readInputs()
      showMore = !showMore
      draw()
    })

    // Unit badle to decimal/step bhi badalta hai — dobara render kar dete hain.
    const unitSelect = $('#f-unit', root)
    if (unitSelect) {
      unitSelect.addEventListener('change', () => {
        readInputs()
        draw()
      })
    }

    // Cost/sale badle to profit ka box live update ho.
    for (const id of ['f-costPrice', 'f-salePrice']) {
      const el = $(`#${id}`, root)
      if (el && showMore) {
        el.addEventListener('change', () => {
          readInputs()
          draw()
        })
      }
    }

    // ---- tags ----
    const tagInput = $('#f-tag', root)
    if (tagInput) {
      const commit = (raw) => {
        const value = raw.trim().replace(/,$/, '')
        if (!value) return
        if (!form.tags.some((tag) => tag.toLowerCase() === value.toLowerCase())) {
          form.tags.push(value)
        }
        readInputs()
        draw()
        $('#f-tag', root)?.focus()
      }

      tagInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit(tagInput.value)
        } else if (e.key === 'Backspace' && !tagInput.value && form.tags.length) {
          form.tags.pop()
          readInputs()
          draw()
          $('#f-tag', root)?.focus()
        }
      })
      // Comma bhi tag mukammal karta hai — mobile keyboard par Enter se asaan.
      tagInput.addEventListener('input', () => {
        if (tagInput.value.endsWith(',')) commit(tagInput.value)
      })
    }

    on(root, 'click', '[data-rm-tag]', (_e, el) => {
      form.tags.splice(Number(el.dataset.rmTag), 1)
      readInputs()
      draw()
    })

    // ---- image ----
    on(root, 'click', '[data-pick]', (_e, el) => {
      const input = $(el.dataset.pick === 'camera' ? '#file-camera' : '#file-gallery', root)
      input?.click()
    })

    for (const id of ['#file-camera', '#file-gallery']) {
      const input = $(id, root)
      if (!input) continue
      input.addEventListener('change', async (e) => {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (!file) return

        const preview = $('#img-preview', root)
        if (preview) preview.innerHTML = '<div class="spinner spinner--sm"></div>'

        try {
          form.image = await compressImage(file)
          readInputs()
          draw()
        } catch {
          toast(t('error.imageFailed'))
          draw()
        }
      })
    }

    on(root, 'click', '[data-remove-image]', () => {
      form.image = ''
      readInputs()
      draw()
    })

    // ---- delete ----
    on(root, 'click', '[data-delete]', async () => {
      if (!confirmAction(t('form.deleteConfirm'))) return
      try {
        await deleteProduct(productId)
        toast(t('common.done'))
        navigate('/products')
      } catch (err) {
        toast(err?.code === 'permission-denied' ? t('error.permission') : t('error.generic'))
      }
    })

    // ---- save ----
    on(root, 'click', '[data-save]', async () => {
      if (saving) return
      readInputs()

      errors = {}
      if (!form.nameEn.trim()) errors.nameEn = t('form.nameRequired')
      const price = Number.parseFloat(form.salePrice)
      if (!form.salePrice.trim() || !Number.isFinite(price) || price < 0) {
        errors.salePrice = t('form.priceRequired')
      }
      if (Object.keys(errors).length) {
        draw()
        return
      }

      saving = true
      draw()

      const num = (v) => {
        const n = Number.parseFloat(v)
        return Number.isFinite(n) ? n : null
      }

      const payload = {
        nameEn: form.nameEn.trim(),
        nameUr: form.nameUr.trim() || null,
        brand: form.brand.trim() || null,
        categoryId: form.categoryId || null,
        unit: form.unit,
        costPrice: num(form.costPrice),
        salePrice: num(form.salePrice) ?? 0,
        wholesalePrice: num(form.wholesalePrice),
        lowStockAt:
          form.lowStockAt.trim() === '' ? null : toBase(num(form.lowStockAt) ?? 0, form.unit),
        tags: form.tags,
        barcode: form.barcode.trim() || null,
        expiryDate: form.expiryDate || null,
        isActive: form.isActive,
        image: form.image || null,
      }

      try {
        if (isEdit) {
          // stockQty jaan boojh kar bahar — stock sirf adjustStock() se badalta hai,
          // warna movement history asal stock se mismatch ho jayegi.
          await updateProduct(productId, payload)
        } else {
          await createProduct({ ...payload, stockQty: toBase(num(form.stockQty) ?? 0, form.unit) })
        }
        toast(t('form.saved'))
        goBack()
      } catch (err) {
        saving = false
        draw()
        toast(err?.code === 'permission-denied' ? t('error.permission') : t('error.generic'))
      }
    })
  }

  draw()
  void rerender
}

function toForm(p) {
  return {
    nameEn: p.nameEn || '',
    nameUr: p.nameUr || '',
    brand: p.brand || '',
    categoryId: p.categoryId || '',
    unit: p.unit || 'piece',
    costPrice: p.costPrice ?? '',
    salePrice: p.salePrice ?? '',
    wholesalePrice: p.wholesalePrice ?? '',
    stockQty: String(fromBase(p.stockQty || 0, p.unit)),
    lowStockAt: p.lowStockAt === null || p.lowStockAt === undefined
      ? ''
      : String(fromBase(p.lowStockAt, p.unit)),
    tags: [...(p.tags || [])],
    barcode: p.barcode || '',
    expiryDate: p.expiryDate || '',
    isActive: p.isActive !== false,
    image: p.image || '',
  }
}
