import { esc, escAttr, on, toast, openSheet, closeSheet, $ } from '../lib/dom.js'
import { confirmModal, alertModal } from '../lib/modal.js'
import { t, localizedName } from '../i18n/index.js'
import { goBack } from '../lib/router.js'
import {
  state,
  createCategory,
  updateCategory,
  deleteCategory,
  seedDefaultCategories,
  findDuplicateCategories,
  mergeDuplicateCategories,
} from '../store.js'
import { appBar, field, icon, loading } from '../components.js'

/** Karyana shops me aksar yehi icons kaam aate hain. */
const ICON_CHOICES = [
  '📦', '🌾', '🛢️', '🌶️', '🥛', '☕', '🍪', '🍞',
  '🧼', '🪥', '🧹', '🧊', '🥤', '🍬', '🥚', '🧴',
]

export function renderCategories(root) {
  if (!state.ready) {
    root.innerHTML = loading()
    return
  }

  const counts = new Map()
  for (const p of state.products) {
    // Ek product kai categories me gina jata hai.
    for (const id of p.categoryIds || []) counts.set(id, (counts.get(id) || 0) + 1)
  }

  root.innerHTML = `
    <div class="screen">
      ${appBar(t('categories.title'), {
        back: true,
        action: `<button class="icon-btn icon-btn--brand" data-new
          aria-label="${escAttr(t('categories.add'))}">${icon('plus')}</button>`,
      })}

      <div class="pad">
        ${duplicateBanner()}
        ${
          state.categories.length === 0
            ? `<div class="empty">
                 <div class="empty__icon">🏷️</div>
                 <p class="empty__title">${esc(t('categories.empty'))}</p>
                 <button class="btn btn--secondary" data-seed>${esc(t('categories.restoreDefaults'))}</button>
               </div>`
            : `<ul class="plist">${state.categories
                .map(
                  (cat) => `
                <li class="pcard">
                  <span class="thumb" style="width:44px;height:44px;font-size:1.3rem">${esc(cat.icon || '📦')}</span>
                  <button class="pcard__main" data-edit="${escAttr(cat.id)}">
                    <div style="min-width:0;flex:1">
                      <p class="bold truncate" dir="auto">${esc(localizedName(cat))}</p>
                      <p class="tiny muted">${esc(t('categories.productCount', { count: counts.get(cat.id) || 0 }))}</p>
                    </div>
                  </button>
                  <button class="icon-btn icon-btn--danger" data-del="${escAttr(cat.id)}"
                    aria-label="${escAttr(t('common.delete'))}">${icon('trash')}</button>
                </li>`,
                )
                .join('')}</ul>`
        }
      </div>
    </div>`

  on(root, 'click', '[data-back]', () => goBack())
  on(root, 'click', '[data-new]', () => openEditor(null))

  on(root, 'click', '[data-merge-dupes]', async (_e, el) => {
    const dupes = findDuplicateCategories()
    const ok = await confirmModal({
      title: t('categories.duplicatesTitle'),
      message: t('categories.duplicatesConfirm', {
        names: dupes.map((d) => d.keep.nameEn).join(', '),
      }),
      confirmLabel: t('categories.merge'),
    })
    if (!ok) return

    el.disabled = true
    try {
      const result = await mergeDuplicateCategories()
      await alertModal({
        title: t('categories.duplicatesTitle'),
        message: t('categories.merged', {
          count: result.merged,
          products: result.products,
        }),
      })
    } catch (err) {
      el.disabled = false
      toast(err?.code === 'permission-denied' ? t('error.permission') : t('error.generic'))
    }
  })
  on(root, 'click', '[data-edit]', (_e, el) => {
    openEditor(state.categories.find((c) => c.id === el.dataset.edit))
  })

  on(root, 'click', '[data-seed]', async (_e, el) => {
    el.disabled = true
    try {
      await seedDefaultCategories()
    } catch (err) {
      el.disabled = false
      toast(err?.code === 'permission-denied' ? t('error.permission') : t('error.generic'))
    }
  })

  on(root, 'click', '[data-del]', async (_e, el) => {
    const ok = await confirmModal({
      title: t('common.delete'),
      message: t('categories.deleteConfirm'),
      confirmLabel: t('common.delete'),
      danger: true,
    })
    if (!ok) return
    try {
      await deleteCategory(el.dataset.del)
      toast(t('common.done'))
    } catch (err) {
      toast(err?.code === 'permission-denied' ? t('error.permission') : t('error.generic'))
    }
  })
}

/**
 * Duplicate check baad me laga tha, is liye purane data me ek jaise naam ki
 * categories ho sakti hain. Milti hain to yahan safai ka rasta dikhate hain.
 */
function duplicateBanner() {
  const dupes = findDuplicateCategories()
  if (!dupes.length) return ''

  const extras = dupes.reduce((n, d) => n + d.extras.length, 0)
  return `
    <div class="card card--warn" style="margin-bottom:16px">
      <p class="bold" style="margin-bottom:4px">${esc(t('categories.duplicatesTitle'))}</p>
      <p class="small" style="margin-bottom:12px">
        ${esc(t('categories.duplicatesFound', { count: extras }))}
      </p>
      <button class="btn btn--primary btn--full btn--sm" data-merge-dupes>
        ${esc(t('categories.merge'))}
      </button>
    </div>`
}

function openEditor(category) {
  const isNew = !category
  let selectedIcon = category?.icon || '📦'

  const wrap = openSheet(isNew ? t('categories.add') : t('categories.edit'), '')
  const body = wrap.querySelector('.sheet__body')

  function draw() {
    body.innerHTML = `
      ${field(
        t('categories.icon'),
        `<div class="icon-grid">${ICON_CHOICES.map(
          (ic) =>
            `<button type="button" data-icon="${escAttr(ic)}" aria-pressed="${ic === selectedIcon}">${esc(ic)}</button>`,
        ).join('')}</div>`,
      )}

      ${field(
        t('categories.nameEn'),
        `<input id="cat-en" value="${escAttr(category?.nameEn || '')}" dir="auto" autofocus>`,
        { required: true },
      )}
      ${field(
        t('categories.nameUr'),
        `<input id="cat-ur" value="${escAttr(category?.nameUr || '')}" dir="rtl">`,
      )}

      <div id="cat-error"></div>
      <button class="btn btn--primary btn--full" id="cat-save">${esc(t('common.save'))}</button>`

    body.querySelectorAll('[data-icon]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedIcon = btn.dataset.icon
        // Sirf pressed state badalti hai — poora dobara render karne ki zaroorat nahi.
        body.querySelectorAll('[data-icon]').forEach((b) => {
          b.setAttribute('aria-pressed', String(b.dataset.icon === selectedIcon))
        })
      })
    })

    const saveBtn = $('#cat-save', body)
    const errorBox = $('#cat-error', body)

    saveBtn.addEventListener('click', async () => {
      const nameEn = $('#cat-en', body).value.trim()
      errorBox.innerHTML = ''
      if (!nameEn) return

      saveBtn.disabled = true
      saveBtn.innerHTML = '<span class="spinner spinner--sm"></span>'

      const payload = {
        nameEn,
        nameUr: $('#cat-ur', body).value.trim() || null,
        icon: selectedIcon,
      }

      try {
        if (isNew) await createCategory(payload)
        else await updateCategory(category.id, payload)
        closeSheet()
        toast(t('form.saved'))
      } catch (err) {
        saveBtn.disabled = false
        saveBtn.textContent = t('common.save')

        // Duplicate naam form ke andar hi batana behtar hai — toast gayab ho
        // jata hai aur user ko pata nahi chalta ke kya theek karna hai.
        if (err?.code === 'duplicate-category') {
          errorBox.innerHTML = `<div class="auth__error">${esc(t('categories.duplicate', { name: nameEn }))}</div>`
          return
        }
        toast(err?.code === 'permission-denied' ? t('error.permission') : t('error.generic'))
      }
    })

    $('#cat-en', body).focus()
  }

  draw()
}
