import { esc, escAttr, on, toast, openSheet, closeSheet, $ } from '../lib/dom.js'
import { confirmModal, alertModal, chooseModal } from '../lib/modal.js'
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
  mergeCategories,
} from '../store.js'
import { appBar, field, icon, loading } from '../components.js'

/** Karyana shops me aksar yehi icons kaam aate hain. */
const ICON_CHOICES = [
  '📦', '🌾', '🛢️', '🌶️', '🥛', '☕', '🍪', '🍞',
  '🧼', '🪥', '🧹', '🧊', '🥤', '🍬', '🥚', '🧴',
]

/**
 * Haath se milane wali halat: app sirf wo joriyan khud pakarti hai jin ke naam
 * mil jate hain. "Cold Drink" aur "Cold Drinks" jaisi joriyan dukandar hi
 * pehchan sakta hai, is liye chunne ka tareeqa bhi hona chahiye.
 */
let mergeMode = false
let picked = new Set()

function exitMergeMode() {
  mergeMode = false
  picked = new Set()
}

export function renderCategories(root) {
  if (!state.ready) {
    root.innerHTML = loading()
    return
  }

  // Jo category darmiyan me hat gayi (kisi doosre phone se) wo chuni na rahe.
  for (const id of picked) {
    if (!state.categories.some((c) => c.id === id)) picked.delete(id)
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
        action: `
          ${
            state.categories.length > 1
              ? `<button class="icon-btn${mergeMode ? ' icon-btn--brand' : ''}" data-merge-mode
                   aria-pressed="${mergeMode}"
                   aria-label="${escAttr(t('categories.mergeMode'))}">${icon('merge')}</button>`
              : ''
          }
          <button class="icon-btn icon-btn--brand" data-new
            aria-label="${escAttr(t('categories.add'))}">${icon('plus')}</button>`,
      })}

      <div class="pad">
        ${mergeMode ? `<p class="small muted" style="margin-bottom:12px">${esc(t('categories.mergeHint'))}</p>` : duplicateBanner()}
        ${
          state.categories.length === 0
            ? `<div class="empty">
                 <div class="empty__icon">🏷️</div>
                 <p class="empty__title">${esc(t('categories.empty'))}</p>
                 <button class="btn btn--secondary" data-seed>${esc(t('categories.restoreDefaults'))}</button>
               </div>`
            : `<ul class="plist">${state.categories
                .map((cat) => (mergeMode ? mergeRow(cat, counts) : normalRow(cat, counts)))
                .join('')}</ul>`
        }
      </div>
    </div>

    ${
      mergeMode && picked.size > 1
        ? `<div class="savebar">
             <button class="btn btn--primary btn--full" data-do-merge>
               ${esc(t('categories.mergeCount', { count: picked.size }))}
             </button>
           </div>`
        : ''
    }`

  on(root, 'click', '[data-back]', () => {
    exitMergeMode()
    goBack()
  })
  on(root, 'click', '[data-new]', () => openEditor(null))

  on(root, 'click', '[data-merge-mode]', () => {
    if (mergeMode) exitMergeMode()
    else mergeMode = true
    renderCategories(root)
  })

  on(root, 'click', '[data-pick]', (_e, el) => {
    const id = el.dataset.pick
    if (picked.has(id)) picked.delete(id)
    else picked.add(id)
    renderCategories(root)
  })

  on(root, 'click', '[data-do-merge]', async (_e, el) => {
    const chosen = state.categories.filter((c) => picked.has(c.id))
    if (chosen.length < 2) return

    // Kaun sa naam rehna hai — ye faisla dukandar ka hai, app ka nahi.
    const keepId = await chooseModal({
      title: t('categories.mergeKeepTitle'),
      message: t('categories.mergeKeepBody'),
      options: chosen.map((c) => ({
        label: `${c.icon || '📦'} ${localizedName(c)}`,
        description: t('categories.productCount', { count: counts.get(c.id) || 0 }),
        value: c.id,
      })),
    })
    if (!keepId) return

    const ids = chosen.map((c) => c.id)

    // Milane se PEHLE is halat se nikal jate hain. Firestore likhai local
    // cache par foran laagu kar deta hai, is liye screen commit ka intezar
    // kiye baghair dobara ban jati hai — baad me nikalte to wo dobari
    // banawat purani halat par ho jati aur nishan lage hi reh jate.
    exitMergeMode()
    el.disabled = true

    try {
      const result = await mergeCategories(keepId, ids)
      await alertModal({
        title: t('categories.mergeKeepTitle'),
        message: t('categories.mergeDone', { products: result.products }),
      })
    } catch (err) {
      // Nakami par chunaav wapas de dete hain, warna sab dobara chunna parta.
      mergeMode = true
      picked = new Set(ids)
      renderCategories(root)
      toast(err?.code === 'permission-denied' ? t('error.permission') : t('error.generic'))
    }
  })

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


}

function normalRow(cat, counts) {
  return `
    <li class="pcard">
      <span class="thumb" style="width:44px;height:44px;font-size:1.3rem">${esc(cat.icon || '📦')}</span>
      <button class="pcard__main" data-edit="${escAttr(cat.id)}">
        <div style="min-width:0;flex:1">
          <p class="bold truncate" dir="auto">${esc(localizedName(cat))}</p>
          <p class="tiny muted">${esc(t('categories.productCount', { count: counts.get(cat.id) || 0 }))}</p>
        </div>
      </button>
      ${icon('chevron', 'flip')}
    </li>`
}

/** Milane wali halat me poori row hi tap target hai — nishan lagana asaan ho. */
function mergeRow(cat, counts) {
  const on_ = picked.has(cat.id)
  return `
    <li class="pcard">
      <button class="pcard__main" data-pick="${escAttr(cat.id)}" aria-pressed="${on_}"
        style="gap:12px">
        <span class="tickbox${on_ ? ' tickbox--on' : ''}" aria-hidden="true">${on_ ? '✓' : ''}</span>
        <span style="font-size:1.3rem">${esc(cat.icon || '📦')}</span>
        <div style="min-width:0;flex:1">
          <p class="bold truncate" dir="auto">${esc(localizedName(cat))}</p>
          <p class="tiny muted">${esc(t('categories.productCount', { count: counts.get(cat.id) || 0 }))}</p>
        </div>
      </button>
    </li>`
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
      <button class="btn btn--primary btn--full" id="cat-save">${esc(t('common.save'))}</button>

      ${
        isNew
          ? ''
          : `<button class="btn btn--ghost btn--full" id="cat-delete"
               style="color:var(--danger);margin-top:10px">
               ${esc(t('categories.delete'))}
             </button>`
      }`

    body.querySelectorAll('[data-icon]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedIcon = btn.dataset.icon
        // Sirf pressed state badalti hai — poora dobara render karne ki zaroorat nahi.
        body.querySelectorAll('[data-icon]').forEach((b) => {
          b.setAttribute('aria-pressed', String(b.dataset.icon === selectedIcon))
        })
      })
    })

    /*
     * Delete category ke apne sheet me hai, list me nahi.
     *
     * Pehle har row par laal trash ka nishan tha — barah categories par barah
     * laal nishan, aur poora kaam ek ghalat tap ki doori par. Category delete
     * karna rozana ka kaam nahi hai; usay khol kar karna hi theek hai. Row par
     * tap karne se ab sirf editor khulta hai.
     */
    $('#cat-delete', body)?.addEventListener('click', async () => {
      const ok = await confirmModal({
        title: t('common.delete'),
        message: t('categories.deleteConfirm'),
        confirmLabel: t('common.delete'),
        danger: true,
      })
      if (!ok) return
      try {
        await deleteCategory(category.id)
        closeSheet()
        toast(t('common.done'))
      } catch (err) {
        toast(err?.code === 'permission-denied' ? t('error.permission') : t('error.generic'))
      }
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
