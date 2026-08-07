import { esc, escAttr, on, toast, $ } from '../lib/dom.js'
import { t, localizedName } from '../i18n/index.js'
import { goBack, navigate } from '../lib/router.js'
import {
  state,
  khataPartyById,
  createKhataParty,
  updateKhataParty,
  deleteKhataParty,
  createKhataCategory,
} from '../store.js'
import { appBar, field, icon, loading } from '../components.js'
import { confirmModal, promptModal } from '../lib/modal.js'
import { wireDragScroll } from '../lib/dragscroll.js'

/**
 * Naya khata / khata badalna.
 *
 * Product wali form ki tarah yahan bhi draft screen se BAHAR rehta hai. Wajah
 * wahi hai: poori app ek `render()` se dobara banti hai aur koi bhi Firestore
 * tabdeeli use chala deti hai — nayi category banate hi likha hua sab ur jata.
 */
let draft = null

export function clearKhataDraft() {
  draft = null
}

export function renderKhataForm(root, partyId, rerender) {
  const isEdit = Boolean(partyId)
  const existing = isEdit ? khataPartyById(partyId) : null

  if (isEdit && !state.ready) {
    root.innerHTML = loading()
    return
  }
  if (isEdit && !existing) {
    navigate('/khata')
    return
  }

  const key = partyId || 'new'
  if (!draft || draft.key !== key) {
    draft = {
      key,
      form: isEdit
        ? {
            name: existing.name || '',
            phone: existing.phone || '',
            note: existing.note || '',
            categoryIds: [...(existing.categoryIds || [])],
            hasDeposit: Boolean(existing.hasDeposit),
            creditLimit: existing.creditLimit ?? '',
          }
        : { name: '', phone: '', note: '', categoryIds: [], hasDeposit: false, creditLimit: '' },
      saving: false,
    }
  }

  const form = draft.form
  let error = ''

  function readInputs() {
    const name = $('#kf-name', root)
    const phone = $('#kf-phone', root)
    const note = $('#kf-note', root)
    const limit = $('#kf-limit', root)
    if (limit) form.creditLimit = limit.value
    if (name) form.name = name.value
    if (phone) form.phone = phone.value
    if (note) form.note = note.value
  }

  function draw() {
    // Screen beech me dobara ban chuki ho to purane tukre par likhna bekar hai.
    if (!root.isConnected && rerender) return rerender()

    root.innerHTML = `
      <div class="screen screen--form">
        ${appBar(isEdit ? t('khata.editParty') : t('khata.addParty'), {
          back: true,
          action: isEdit
            ? `<button class="icon-btn icon-btn--danger" data-delete
                 aria-label="${escAttr(t('common.delete'))}">${icon('trash')}</button>`
            : '',
        })}

        <div class="pad">
          ${error ? `<div class="auth__error" style="margin-bottom:16px">${esc(error)}</div>` : ''}

          <div class="card" style="margin-bottom:16px">
            ${field(
              t('khata.name'),
              `<input id="kf-name" value="${escAttr(form.name)}" dir="auto"
                 placeholder="${escAttr(t('khata.namePlaceholder'))}">`,
              { required: true },
            )}
            ${field(
              t('khata.phone'),
              `<input id="kf-phone" type="tel" inputmode="tel" dir="ltr"
                 value="${escAttr(form.phone)}" placeholder="03xx xxxxxxx">`,
              { hint: t('khata.phoneHint') },
            )}
            <!--
              Udhaar ki hadd — is grahak ka "credit score". Khali chhorne ka
              matlab koi hadd nahi.
            -->
            ${field(
              t('khata.creditLimit'),
              `<input id="kf-limit" type="number" inputmode="decimal" min="0" step="1" dir="ltr"
                 value="${escAttr(form.creditLimit)}" placeholder="${escAttr(t('khata.creditLimitNone'))}">`,
              { hint: t('khata.creditLimitHint') },
            )}
          </div>

          <div class="card" style="margin-bottom:16px">
            <div class="row row--between" style="margin-bottom:10px">
              <p class="formhead" style="margin:0">${esc(t('khata.categories'))}</p>
              ${
                form.categoryIds.length
                  ? `<span class="tiny muted">${esc(
                      t('form.categoriesChosen', { count: form.categoryIds.length }),
                    )}</span>`
                  : ''
              }
            </div>
            <div class="catchips">${categoryChips()}</div>
            <button class="btn btn--ghost btn--sm" data-new-kcat style="margin-top:8px">
              + ${esc(t('categories.add'))}
            </button>
          </div>

          <!--
            Jama ka option har khate par nahi.

            Sirf kuch log paisa dukan me rakhte hain. Har khate par do fazool
            button lagana rozana ka kaam bhaari kar deta hai — is liye dukandar
            khud, us khaas grahak ke liye chalu karta hai.
          -->
          <div class="card" style="margin-bottom:16px">
            <div class="row row--between">
              <span style="flex:1">
                <span class="bold" style="display:block">${esc(t('khata.hasDeposit'))}</span>
                <span class="tiny muted">${esc(t('khata.hasDepositHint'))}</span>
              </span>
              <div class="choices choices--2" style="width:auto;flex-shrink:0">
                <button class="choice${form.hasDeposit ? ' choice--active' : ''}" data-dep="on">
                  ${esc(t('settings.catalogOn'))}
                </button>
                <button class="choice${form.hasDeposit ? '' : ' choice--active'}" data-dep="off">
                  ${esc(t('settings.catalogOff'))}
                </button>
              </div>
            </div>
          </div>

          <div class="card">
            ${field(
              t('khata.note'),
              `<textarea id="kf-note" rows="2" dir="auto"
                 placeholder="${escAttr(t('khata.notePlaceholder'))}">${esc(form.note)}</textarea>`,
            )}
          </div>
        </div>
      </div>

      <div class="savebar">
        <button class="btn btn--primary btn--full" data-save ${draft.saving ? 'disabled' : ''}>
          ${draft.saving ? '<span class="spinner spinner--sm"></span>' : esc(t('common.save'))}
        </button>
      </div>`

    wireDragScroll(root)
  }

  function categoryChips() {
    if (!state.khataCategories.length) {
      return `<p class="small muted">${esc(t('categories.empty'))}</p>`
    }
    const chosen = form.categoryIds
    return state.khataCategories
      .map(
        (c) => `
        <button type="button" class="catchip${chosen.includes(c.id) ? ' catchip--on' : ''}"
          data-kcat="${escAttr(c.id)}" aria-pressed="${chosen.includes(c.id)}">
          ${esc(c.icon || '📓')} ${esc(localizedName(c))}
        </button>`,
      )
      .join('')
  }

  draw()

  on(root, 'click', '[data-back]', () => goBack())

  on(root, 'click', '[data-dep]', (_e, el) => {
    form.hasDeposit = el.dataset.dep === 'on'
    readInputs()
    draw()
  })

  on(root, 'click', '[data-kcat]', (_e, el) => {
    const id = el.dataset.kcat
    form.categoryIds = form.categoryIds.includes(id)
      ? form.categoryIds.filter((c) => c !== id)
      : [...form.categoryIds, id]
    readInputs()
    draw()
  })

  on(root, 'click', '[data-new-kcat]', async () => {
    readInputs()
    const name = await promptModal({
      title: t('categories.add'),
      label: t('categories.nameEn'),
      confirmLabel: t('common.add'),
    })
    if (!name) return

    try {
      const id = await createKhataCategory({ nameEn: name.trim() })
      if (id) form.categoryIds = [...form.categoryIds, id]
      draw()
    } catch (err) {
      toast(err?.code === 'permission-denied' ? t('error.permission') : t('error.generic'))
    }
  })

  on(root, 'click', '[data-delete]', async () => {
    const ok = await confirmModal({
      title: t('khata.deleteParty'),
      message: t('khata.deleteConfirm', { name: existing.name }),
      confirmLabel: t('common.delete'),
      danger: true,
    })
    if (!ok) return

    try {
      await deleteKhataParty(partyId)
      clearKhataDraft()
      navigate('/khata')
    } catch {
      toast(t('error.generic'))
    }
  })

  on(root, 'click', '[data-save]', async () => {
    readInputs()
    if (!form.name.trim()) {
      error = t('khata.errNoName')
      draw()
      return
    }

    error = ''
    draft.saving = true
    draw()

    try {
      // Khali khana = koi hadd nahi.
      const limit = String(form.creditLimit).trim()
      const payload = { ...form, creditLimit: limit ? Number(limit) : null }

      if (isEdit) await updateKhataParty(partyId, payload)
      else await createKhataParty(payload)
      clearKhataDraft()
      goBack()
    } catch (err) {
      draft.saving = false
      error = err?.code === 'permission-denied' ? t('error.permission') : t('error.generic')
      draw()
    }
  })
}
