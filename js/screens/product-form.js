import { esc, escAttr, on, toast, $ } from '../lib/dom.js'
import { confirmModal, promptModal } from '../lib/modal.js'
import { t, unitLabel, localizedName } from '../i18n/index.js'
import { goBack, navigate } from '../lib/router.js'
import {
  state,
  productById,
  createProduct,
  updateProduct,
  deleteProduct,
  createCategory,
  findCategoryByName,
  saveImage,
  loadImage,
  deleteImage,
} from '../store.js'
import { appBar, field, options, icon, loading } from '../components.js'
import {
  LOOSE_BASE_UNITS,
  PACK_LABELS,
  PACK_SIZE_UNITS,
  allowsFraction,
  fromBase,
  toBase,
} from '../lib/units.js'
import { formatMoney } from '../lib/format.js'
import { compressImage } from '../lib/images.js'
import { suggestTags } from '../lib/search.js'

/**
 * Function hai, constant nahi — aur ye ahem hai.
 *
 * Ek sanjha object `{ ...EMPTY }` se copy karne par `tags` aur `categoryIds`
 * ke ARRAYS sanjhe reh jate the (shallow copy). Nateeja: ek product par tag
 * lagate hi wo tag agle naye product ki form me pehle se mojood hota tha.
 */
function emptyForm() {
  return {
    nameEn: '',
    nameUr: '',
    brand: '',
    categoryIds: [],
    // 'loose' = tol kar bikti hai, 'pack' = packet/bottle gine jate hain.
    sellBy: 'pack',
    unit: 'kg', // loose ke liye
    packLabel: 'piece', // pack ke liye
    packSize: '', // ek packet me kitna (optional)
    packUnit: 'ml',
    costPrice: '',
    salePrice: '',
    wholesalePrice: '',
    stockQty: '',
    lowStockAt: '',
    tags: [],
    barcode: '',
    expiryDate: '',
    status: 'active',
    imageId: null,
    imageData: '', // preview ke liye; save par hi upload hota hai
  }
}

export function renderProductForm(root, productId) {
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

  const form = isEdit
    ? toForm(existing)
    : { ...emptyForm(), lowStockAt: String(state.settings.defaultLowStockAt) }

  let showMore = isEdit
    ? Boolean(
        existing.brand || existing.wholesalePrice || existing.barcode ||
        existing.expiryDate || existing.nameUr || existing.status !== 'active',
      )
    : false
  let errors = {}
  let saving = false
  let tagInputValue = ''
  /** Purani inline tasveer (product doc ke andar) — sirf purane records me. */
  const legacyImage = isEdit ? existing.image || '' : ''

  // Edit par tasveer alag collection se aati hai.
  if (isEdit && existing.imageId && !form.imageData) {
    loadImage(existing.imageId).then((data) => {
      if (!data) return
      form.imageData = data
      const preview = $('#img-preview', root)
      if (preview) preview.innerHTML = `<img src="${escAttr(data)}" alt="">`
    })
  }

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
          </div>

          ${sellByCard()}

          <div class="card" style="margin-bottom:16px">
            ${categoryPicker()}
          </div>

          <!-- Hidden tags ka apna card — ye app ka khaas feature hai. -->
          <div class="card" style="margin-bottom:16px">
            ${field(t('form.tags'), tagBox(), { hint: t('form.tagsHint') })}
            ${tagIdeas()}
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

  // ------------------------------------------------------------- sell-by

  /**
   * App ka sab se ahem sawaal: cheez tol kar bikti hai ya gin kar?
   * Isi se tay hota hai ke "6" ka matlab 6 litre hai ya 6 bottle.
   */
  function sellByCard() {
    const isPack = form.sellBy === 'pack'

    return `
      <div class="card" style="margin-bottom:16px">
        <span class="field__label">${esc(t('form.sellBy'))}</span>
        <div class="choices choices--2" style="margin-bottom:6px">
          <button type="button" class="choice${isPack ? ' choice--active' : ''}" data-sellby="pack">
            📦 ${esc(t('form.sellByPack'))}
          </button>
          <button type="button" class="choice${!isPack ? ' choice--active' : ''}" data-sellby="loose">
            ⚖️ ${esc(t('form.sellByLoose'))}
          </button>
        </div>
        <p class="field__hint" style="margin-bottom:16px">
          ${esc(isPack ? t('form.sellByPackHint') : t('form.sellByLooseHint'))}
        </p>

        ${isPack ? packFields() : looseFields()}

        <div class="grid-2">
          ${field(
            t('form.salePrice'),
            `<input id="f-salePrice" type="number" inputmode="decimal" min="0" step="0.01"
               value="${escAttr(form.salePrice)}" placeholder="0">`,
            { required: true, error: errors.salePrice, hint: pricePerHint() },
          )}
          ${field(
            t('form.lowStockAt'),
            `<input id="f-lowStockAt" type="number" min="0"
               inputmode="${fractionAllowed() ? 'decimal' : 'numeric'}"
               step="${fractionAllowed() ? '0.001' : '1'}"
               value="${escAttr(form.lowStockAt)}" placeholder="0">`,
          )}
        </div>
      </div>`
  }

  function packFields() {
    return `
      <div class="grid-2">
        ${field(
          t('form.packLabel'),
          `<select id="f-packLabel">${options(
            PACK_LABELS.map((u) => ({ value: u, label: unitLabel(u) })),
            form.packLabel,
          )}</select>`,
        )}
        ${field(
          t('form.stockQty'),
          `<input id="f-stockQty" type="number" min="0" inputmode="numeric" step="1"
             value="${escAttr(form.stockQty)}" placeholder="0"${isEdit ? ' disabled' : ''}>`,
          { hint: isEdit ? t('form.stockLocked') : '' },
        )}
      </div>

      ${field(
        t('form.packSize'),
        `<div class="input-group">
           <input id="f-packSize" type="number" inputmode="decimal" min="0" step="0.001"
             value="${escAttr(form.packSize)}" placeholder="${escAttr(t('form.packSizePlaceholder'))}">
           <select id="f-packUnit">${options(
             PACK_SIZE_UNITS.map((u) => ({ value: u, label: unitLabel(u) })),
             form.packUnit,
           )}</select>
         </div>`,
        { hint: t('form.packSizeHint') },
      )}`
  }

  function looseFields() {
    return `
      <div class="grid-2">
        ${field(
          t('form.unit'),
          `<select id="f-unit">${options(
            LOOSE_BASE_UNITS.map((u) => ({ value: u, label: unitLabel(u) })),
            form.unit,
          )}</select>`,
        )}
        ${field(
          t('form.stockQty'),
          `<input id="f-stockQty" type="number" min="0"
             inputmode="${fractionAllowed() ? 'decimal' : 'numeric'}"
             step="${fractionAllowed() ? '0.001' : '1'}"
             value="${escAttr(form.stockQty)}" placeholder="0"${isEdit ? ' disabled' : ''}>`,
          { hint: isEdit ? t('form.stockLocked') : '' },
        )}
      </div>`
  }

  function fractionAllowed() {
    return allowsFraction({ sellBy: form.sellBy, unit: form.unit })
  }

  function pricePerHint() {
    const label = form.sellBy === 'pack' ? form.packLabel : form.unit
    return t('form.perUnit', { unit: unitLabel(label) })
  }

  // ------------------------------------------------------------ categories

  /** Ek product kai categories me ho sakti hai — is liye checkbox list. */
  function categoryPicker() {
    const list = state.categories
      .map(
        (c) => `
        <label class="catpick${form.categoryIds.includes(c.id) ? ' catpick--on' : ''}">
          <input type="checkbox" data-cat="${escAttr(c.id)}"
            ${form.categoryIds.includes(c.id) ? 'checked' : ''}>
          <span>${esc(c.icon || '📦')} ${esc(localizedName(c))}</span>
        </label>`,
      )
      .join('')

    return `
      <span class="field__label">${esc(t('form.categories'))}</span>
      <div class="catpick-list">${list || `<p class="small muted">${esc(t('categories.empty'))}</p>`}</div>
      <button type="button" class="btn btn--ghost btn--sm" data-new-cat style="margin-top:8px">
        + ${esc(t('categories.add'))}
      </button>`
  }

  // ------------------------------------------------------------------ tags

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
        <input id="f-tag" value="${escAttr(tagInputValue)}"
          placeholder="${escAttr(t('form.tagsPlaceholder'))}" dir="auto">
      </div>`
  }

  /**
   * Tajaweez <label> se BAHAR rehni chahiyen — label ke andar button dabane par
   * click input par chala jata hai, button par nahi.
   */
  function tagIdeas() {
    const ideas = suggestTags(state.products, tagInputValue, form.tags)
    if (!ideas.length) return ''

    const chips = ideas
      .map((tag) => `<button type="button" class="tagchip" data-add-tag="${escAttr(tag)}">+ ${esc(tag)}</button>`)
      .join('')

    return `
      <div class="tagideas">
        <p class="tiny muted" style="margin-bottom:6px">${esc(t('form.tagSuggestions'))}</p>
        <div class="tagideas__row">${chips}</div>
      </div>`
  }

  // ----------------------------------------------------------------- image

  function imageField() {
    const preview = form.imageData || legacyImage
    return `
      <div class="field">
        <span class="field__label">${esc(t('form.image'))}</span>
        <div class="row">
          <div class="thumb thumb--lg" id="img-preview">
            ${preview ? `<img src="${escAttr(preview)}" alt="">` : '📷'}
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
              preview
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

        <span class="field__label">${esc(t('form.status'))}</span>
        <div class="choices" style="grid-template-columns:1fr">
          ${[
            ['active', t('form.statusActive'), t('form.statusActiveHint')],
            ['hidden', t('form.statusHidden'), t('form.statusHiddenHint')],
            ['discontinued', t('form.statusDiscontinued'), t('form.statusDiscontinuedHint')],
          ]
            .map(
              ([value, label, hint]) => `
              <button type="button" class="statuspick${form.status === value ? ' statuspick--on' : ''}"
                data-status="${value}">
                <span class="bold">${esc(label)}</span>
                <span class="tiny muted">${esc(hint)}</span>
              </button>`,
            )
            .join('')}
        </div>
      </div>`
  }

  // --------------------------------------------------------------- events

  function readInputs() {
    const get = (id) => {
      const el = $(`#${id}`, root)
      return el ? el.value : undefined
    }
    const set = (key, id) => {
      const v = get(id)
      if (v !== undefined) form[key] = v
    }

    set('nameEn', 'f-nameEn')
    set('salePrice', 'f-salePrice')
    set('lowStockAt', 'f-lowStockAt')
    set('unit', 'f-unit')
    set('packLabel', 'f-packLabel')
    set('packSize', 'f-packSize')
    set('packUnit', 'f-packUnit')
    if (!isEdit) set('stockQty', 'f-stockQty')

    const tagEl = $('#f-tag', root)
    if (tagEl) tagInputValue = tagEl.value

    if (showMore) {
      set('nameUr', 'f-nameUr')
      set('brand', 'f-brand')
      set('costPrice', 'f-costPrice')
      set('wholesalePrice', 'f-wholesalePrice')
      set('barcode', 'f-barcode')
      set('expiryDate', 'f-expiryDate')

    }
  }

  function redraw() {
    readInputs()
    draw()
  }

  function wire() {
    on(root, 'click', '[data-back]', () => goBack())
    on(root, 'click', '[data-toggle-more]', () => {
      readInputs()
      showMore = !showMore
      draw()
    })

    on(root, 'click', '[data-status]', (_e, el) => {
      readInputs()
      form.status = el.dataset.status
      draw()
    })

    on(root, 'click', '[data-sellby]', (_e, el) => {
      readInputs()
      form.sellBy = el.dataset.sellby
      draw()
    })

    // Unit/pack-label badle to decimal aur "per bottle" wala hint bhi badalta hai.
    for (const id of ['f-unit', 'f-packLabel', 'f-packUnit']) {
      $(`#${id}`, root)?.addEventListener('change', redraw)
    }
    if (showMore) {
      for (const id of ['f-costPrice', 'f-salePrice']) {
        $(`#${id}`, root)?.addEventListener('change', redraw)
      }
    }

    // ---- categories ----
    on(root, 'change', '[data-cat]', (_e, el) => {
      const id = el.dataset.cat
      if (el.checked) {
        if (!form.categoryIds.includes(id)) form.categoryIds.push(id)
      } else {
        form.categoryIds = form.categoryIds.filter((c) => c !== id)
      }
      readInputs()
      draw()
    })

    on(root, 'click', '[data-new-cat]', async () => {
      readInputs()
      const name = await promptModal({
        title: t('categories.add'),
        label: t('categories.nameEn'),
        confirmLabel: t('common.add'),
      })
      if (!name) return

      // Isi naam ki category pehle se ho to nayi banane ke bajaye wahi laga do —
      // dukandar ki murad bhi yehi hoti hai.
      const existing = findCategoryByName(name)
      if (existing) {
        if (!form.categoryIds.includes(existing.id)) form.categoryIds.push(existing.id)
        toast(t('categories.alreadyThere', { name: existing.nameEn }))
        draw()
        return
      }

      try {
        const id = await createCategory({ nameEn: name.trim(), icon: '📦' })
        if (id) form.categoryIds.push(id)
        draw()
      } catch (err) {
        toast(err?.code === 'permission-denied' ? t('error.permission') : t('error.generic'))
      }
    })

    // ---- tags ----
    const tagInput = $('#f-tag', root)
    if (tagInput) {
      const commit = (raw) => {
        const value = raw.trim().replace(/,$/, '')
        if (!value) return
        if (!form.tags.some((tag) => tag.toLowerCase() === value.toLowerCase())) {
          form.tags.push(value)
        }
        tagInputValue = ''
        readInputs()
        tagInputValue = ''
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

      // Har harf par tajaweez dobara banti hain.
      let timer
      tagInput.addEventListener('input', () => {
        if (tagInput.value.endsWith(',')) {
          commit(tagInput.value)
          return
        }
        clearTimeout(timer)
        timer = setTimeout(() => {
          const caret = tagInput.selectionStart
          readInputs()
          draw()
          const next = $('#f-tag', root)
          if (next) {
            next.focus()
            next.setSelectionRange(caret, caret)
          }
        }, 200)
      })
    }

    on(root, 'click', '[data-add-tag]', (_e, el) => {
      const tag = el.dataset.addTag
      if (!form.tags.some((x) => x.toLowerCase() === tag.toLowerCase())) form.tags.push(tag)
      readInputs()
      tagInputValue = ''
      draw()
    })

    on(root, 'click', '[data-rm-tag]', (_e, el) => {
      form.tags.splice(Number(el.dataset.rmTag), 1)
      readInputs()
      draw()
    })

    // ---- image ----
    on(root, 'click', '[data-pick]', (_e, el) => {
      $(el.dataset.pick === 'camera' ? '#file-camera' : '#file-gallery', root)?.click()
    })

    for (const id of ['#file-camera', '#file-gallery']) {
      $(id, root)?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (!file) return

        const preview = $('#img-preview', root)
        if (preview) preview.innerHTML = '<div class="spinner spinner--sm"></div>'

        try {
          form.imageData = await compressImage(file)
          readInputs()
          draw()
        } catch {
          toast(t('error.imageFailed'))
          draw()
        }
      })
    }

    on(root, 'click', '[data-remove-image]', () => {
      form.imageData = ''
      form.imageId = null
      readInputs()
      draw()
    })

    // ---- delete ----
    on(root, 'click', '[data-delete]', async () => {
      const ok = await confirmModal({
        title: t('common.delete'),
        message: t('form.deleteConfirm'),
        confirmLabel: t('common.delete'),
        danger: true,
      })
      if (!ok) return
      try {
        await deleteProduct(productId)
        toast(t('common.done'))
        navigate('/products')
      } catch (err) {
        toast(err?.code === 'permission-denied' ? t('error.permission') : t('error.generic'))
      }
    })

    // ---- save ----
    on(root, 'click', '[data-save]', save)
  }

  async function save() {
    if (saving) return
    readInputs()

    errors = {}
    if (!form.nameEn.trim()) errors.nameEn = t('form.nameRequired')
    const price = Number.parseFloat(form.salePrice)
    if (!String(form.salePrice).trim() || !Number.isFinite(price) || price < 0) {
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
    const isPack = form.sellBy === 'pack'

    try {
      // Tasveer alag collection me jati hai; product me sirf uska id.
      let imageId = form.imageId
      if (form.imageData && form.imageData !== (isEdit ? existing.image : '')) {
        const previous = imageId
        imageId = await saveImage(form.imageData)
        if (previous) await deleteImage(previous)
      } else if (!form.imageData && isEdit && existing.imageId) {
        await deleteImage(existing.imageId)
        imageId = null
      }

      const payload = {
        nameEn: form.nameEn.trim(),
        nameUr: form.nameUr.trim() || null,
        brand: form.brand.trim() || null,
        categoryIds: form.categoryIds,
        categoryId: null, // purana single field khatam
        sellBy: form.sellBy,
        unit: isPack ? form.packLabel : form.unit,
        packLabel: isPack ? form.packLabel : null,
        packSize: isPack ? num(form.packSize) : null,
        packUnit: isPack && num(form.packSize) ? form.packUnit : null,
        costPrice: num(form.costPrice),
        salePrice: num(form.salePrice) ?? 0,
        wholesalePrice: num(form.wholesalePrice),
        lowStockAt: stockToBase(form.lowStockAt, isPack),
        tags: form.tags,
        barcode: form.barcode.trim() || null,
        expiryDate: form.expiryDate || null,
        status: form.status,
        isActive: form.status === 'active', // purane record padhne walon ke liye
        imageId,
        image: null, // purani inline tasveer hata dete hain
      }

      if (isEdit) {
        // stockQty jaan boojh kar bahar — stock sirf adjustStock() se badalta hai,
        // warna movement history asal stock se mismatch ho jayegi.
        await updateProduct(productId, payload)
      } else {
        await createProduct({ ...payload, stockQty: stockToBase(form.stockQty, isPack) ?? 0 })
      }
      toast(t('form.saved'))
      goBack()
    } catch (err) {
      saving = false
      draw()
      toast(err?.code === 'permission-denied' ? t('error.permission') : t('error.generic'))
    }
  }

  /** Pack ki ginti waise hi rehti hai; loose ko base unit me badalte hain. */
  function stockToBase(value, isPack) {
    if (String(value ?? '').trim() === '') return null
    const n = Number.parseFloat(value)
    if (!Number.isFinite(n)) return null
    return isPack ? Math.round(n) : toBase(n, form.unit)
  }

  draw()
}

function toForm(p) {
  const isPack = p.sellBy === 'pack'
  return {
    nameEn: p.nameEn || '',
    nameUr: p.nameUr || '',
    brand: p.brand || '',
    categoryIds: [...(p.categoryIds || [])],
    sellBy: p.sellBy || 'pack',
    unit: isPack ? 'kg' : p.unit || 'kg',
    packLabel: p.packLabel || p.unit || 'piece',
    packSize: p.packSize ?? '',
    packUnit: p.packUnit || 'ml',
    costPrice: p.costPrice ?? '',
    salePrice: p.salePrice ?? '',
    wholesalePrice: p.wholesalePrice ?? '',
    stockQty: isPack ? String(p.stockQty || 0) : String(fromBase(p.stockQty || 0, p.unit)),
    lowStockAt:
      p.lowStockAt === null || p.lowStockAt === undefined
        ? ''
        : isPack
          ? String(p.lowStockAt)
          : String(fromBase(p.lowStockAt, p.unit)),
    tags: [...(p.tags || [])],
    barcode: p.barcode || '',
    expiryDate: p.expiryDate || '',
    status: p.status || (p.isActive === false ? 'hidden' : 'active'),
    imageId: p.imageId || null,
    imageData: '',
  }
}
