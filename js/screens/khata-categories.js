import { esc, escAttr, on, toast, openSheet, closeSheet, $ } from '../lib/dom.js'
import { confirmModal } from '../lib/modal.js'
import { t, localizedName } from '../i18n/index.js'
import { goBack } from '../lib/router.js'
import {
  state,
  createKhataCategory,
  updateKhataCategory,
  deleteKhataCategory,
} from '../store.js'
import { appBar, field, icon, empty, loading } from '../components.js'

/**
 * Khata ki categories.
 *
 * Products wali categories se alag rakhi gayi hain — "Grains & Pulses" kisi
 * aadmi par nahi lagti, aur "Bara khata" kisi product par nahi. Do alag list
 * hone se dono jagah sirf kaam ki cheezein nazar aati hain.
 */

/** Logon ke khaton par jo nishan kaam aate hain. */
const ICON_CHOICES = [
  '📓', '🟢', '🔴', '⏳', '⭐', '🏠', '🏢', '🛵',
  '👨‍🌾', '🧾', '📌', '🔵', '🟡', '🟠', '🤝', '📅',
]

export function renderKhataCategories(root) {
  if (!state.ready) {
    root.innerHTML = loading()
    return
  }

  // Har category par kitne khate hain — khali category mitane me jhijhak nahi
  // honi chahiye, aur bhari mitane se pehle pata hona chahiye.
  const counts = new Map()
  for (const party of state.khataParties) {
    for (const id of party.categoryIds || []) counts.set(id, (counts.get(id) || 0) + 1)
  }

  const rows = state.khataCategories
    .map(
      (c) => `
      <button class="list-row" data-edit="${escAttr(c.id)}">
        <span class="list-row__icon">${esc(c.icon || '📓')}</span>
        <span style="flex:1;min-width:0">
          <span class="bold truncate" dir="auto" style="display:block">${esc(localizedName(c))}</span>
          <span class="tiny muted">${esc(
            t('khataCat.partyCount', { count: counts.get(c.id) || 0 }),
          )}</span>
        </span>
        ${icon('chevron', 'flip')}
      </button>`,
    )
    .join('')

  root.innerHTML = `
    <div class="screen">
      ${appBar(t('khataCat.title'), { back: true })}

      <div class="pad">
        ${
          rows
            ? `<div class="col" style="gap:8px">${rows}</div>`
            : empty('📓', t('khataCat.empty'), t('khataCat.emptyHint'))
        }

        <button class="btn btn--secondary btn--full" data-add style="margin-top:16px">
          + ${esc(t('categories.add'))}
        </button>
      </div>
    </div>`

  on(root, 'click', '[data-back]', () => goBack())
  on(root, 'click', '[data-add]', () => openEditor(null))
  on(root, 'click', '[data-edit]', (_e, el) => {
    const category = state.khataCategories.find((c) => c.id === el.dataset.edit)
    if (category) openEditor(category, counts.get(category.id) || 0)
  })
}

/**
 * Banane aur badalne ka ek hi sheet.
 *
 * Delete andar hai, har row par nahi — rozana ki list me delete ka button
 * ungli ke neeche aa jata hai aur ghalti se dab jata hai.
 */
function openEditor(category, partyCount = 0) {
  const isNew = !category
  let selectedIcon = category?.icon || '📓'

  const wrap = openSheet(isNew ? t('categories.add') : t('categories.edit'), '')
  const body = wrap.querySelector('.sheet__body')

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
      `<input id="kc-en" value="${escAttr(category?.nameEn || '')}" dir="auto">`,
      { required: true },
    )}
    ${field(
      t('categories.nameUr'),
      `<input id="kc-ur" value="${escAttr(category?.nameUr || '')}" dir="rtl">`,
    )}

    <button class="btn btn--primary btn--full" id="kc-save">${esc(t('common.save'))}</button>
    ${
      isNew
        ? ''
        : `<button class="btn btn--secondary btn--full" id="kc-delete" style="margin-top:10px">
             🗑️ ${esc(t('common.delete'))}
           </button>`
    }`

  body.querySelectorAll('[data-icon]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedIcon = btn.dataset.icon
      body.querySelectorAll('[data-icon]').forEach((b) => {
        b.setAttribute('aria-pressed', String(b.dataset.icon === selectedIcon))
      })
    })
  })

  const saveBtn = $('#kc-save', body)

  saveBtn.addEventListener('click', async () => {
    const nameEn = $('#kc-en', body).value.trim()
    if (!nameEn) return

    saveBtn.disabled = true
    saveBtn.innerHTML = '<span class="spinner spinner--sm"></span>'

    const payload = {
      nameEn,
      nameUr: $('#kc-ur', body).value.trim() || null,
      icon: selectedIcon,
    }

    try {
      if (isNew) await createKhataCategory(payload)
      else await updateKhataCategory(category.id, payload)
      closeSheet()
      toast(t('form.saved'))
    } catch (err) {
      saveBtn.disabled = false
      saveBtn.textContent = t('common.save')
      toast(err?.code === 'permission-denied' ? t('error.permission') : t('error.generic'))
    }
  })

  $('#kc-delete', body)?.addEventListener('click', async () => {
    // Khate nahi mitte — sirf un par se ye nishan hat jata hai. Ye baat pehle
    // se batana zaroori hai, warna dukandar delete dabane se darta rehta hai.
    const ok = await confirmModal({
      title: t('common.delete'),
      message: t('khataCat.deleteConfirm', {
        name: localizedName(category),
        count: partyCount,
      }),
      confirmLabel: t('common.delete'),
      danger: true,
    })
    if (!ok) return

    try {
      await deleteKhataCategory(category.id)
      closeSheet()
    } catch (err) {
      toast(err?.code === 'permission-denied' ? t('error.permission') : t('error.generic'))
    }
  })

  $('#kc-en', body).focus()
}
