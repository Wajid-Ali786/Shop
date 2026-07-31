import { esc, escAttr } from './dom.js'
import { t } from '../i18n/index.js'

/**
 * App ke apne modals — browser ke `confirm()` / `prompt()` ki jagah.
 *
 * Native dialogs mobile par bare-bhaday lagte hain: URL dikhate hain, app ke
 * rang aur zabaan se mel nahi khate, Urdu me RTL nahi hote, aur andar HTML
 * (jaise product ka naam mota karna) nahi ja sakti.
 *
 * Sab functions Promise lautate hain.
 */

let openModal = null

function close(result, resolve) {
  if (openModal) {
    openModal.el.remove()
    document.removeEventListener('keydown', openModal.onKey)
    document.body.classList.remove('no-scroll')
    openModal = null
  }
  resolve(result)
}

function build({ title, body, actions, onMount }) {
  return new Promise((resolve) => {
    // Ek waqt me ek hi modal.
    if (openModal) close(null, () => {})

    const el = document.createElement('div')
    el.className = 'modal-backdrop'
    el.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-label="${escAttr(title)}">
        <h3 class="modal__title">${esc(title)}</h3>
        <div class="modal__body">${body}</div>
        <div class="modal__actions">${actions}</div>
      </div>`
    document.body.appendChild(el)
    document.body.classList.add('no-scroll')

    const onKey = (e) => {
      if (e.key === 'Escape') close(null, resolve)
    }
    document.addEventListener('keydown', onKey)
    openModal = { el, onKey }

    // Backdrop par tap = cancel.
    el.addEventListener('click', (e) => {
      if (e.target === el) close(null, resolve)
    })
    el.querySelectorAll('[data-modal-cancel]').forEach((b) =>
      b.addEventListener('click', () => close(null, resolve)),
    )

    if (onMount) onMount(el, (value) => close(value, resolve))
  })
}

/**
 * Haan/nahi. `danger: true` par tasdeeq wala button laal hota hai — jahan
 * kuch mit raha ho wahan ye farq ahem hai.
 */
export function confirmModal({ title, message, confirmLabel, danger = false }) {
  return build({
    title,
    body: `<p class="modal__text">${esc(message)}</p>`,
    actions: `
      <button class="btn btn--secondary" data-modal-cancel>${esc(t('common.cancel'))}</button>
      <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-modal-ok>
        ${esc(confirmLabel || t('common.yes'))}
      </button>`,
    onMount: (el, done) => {
      el.querySelector('[data-modal-ok]').addEventListener('click', () => done(true))
    },
  }).then((v) => v === true)
}

/** Ek line ka input. Cancel par `null`. */
export function promptModal({ title, label, value = '', placeholder = '', confirmLabel }) {
  return build({
    title,
    body: `
      <label class="field" style="margin-bottom:0">
        ${label ? `<span class="field__label">${esc(label)}</span>` : ''}
        <input id="modal-input" value="${escAttr(value)}"
          placeholder="${escAttr(placeholder)}" dir="auto">
      </label>`,
    actions: `
      <button class="btn btn--secondary" data-modal-cancel>${esc(t('common.cancel'))}</button>
      <button class="btn btn--primary" data-modal-ok>${esc(confirmLabel || t('common.save'))}</button>`,
    onMount: (el, done) => {
      const input = el.querySelector('#modal-input')
      const submit = () => {
        const v = input.value.trim()
        if (v) done(v)
      }
      el.querySelector('[data-modal-ok]').addEventListener('click', submit)
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          submit()
        }
      })
      input.focus()
      input.select()
    },
  })
}

/** Sirf ittila — ek "theek hai" button. */
export function alertModal({ title, message }) {
  return build({
    title,
    body: `<p class="modal__text">${esc(message)}</p>`,
    actions: `<button class="btn btn--primary" data-modal-cancel>${esc(t('common.done'))}</button>`,
  })
}

/**
 * Kai me se ek chunna — har option ka apna unwan aur tafseel.
 * Cancel par `null`.
 */
export function chooseModal({ title, message, options }) {
  const list = options
    .map(
      (o, i) => `
      <button class="modal__choice${o.danger ? ' modal__choice--danger' : ''}" data-choice="${i}">
        <span class="bold">${esc(o.label)}</span>
        ${o.description ? `<span class="small muted">${esc(o.description)}</span>` : ''}
      </button>`,
    )
    .join('')

  return build({
    title,
    body: `
      ${message ? `<p class="modal__text">${esc(message)}</p>` : ''}
      <div class="modal__choices">${list}</div>`,
    actions: `<button class="btn btn--secondary" data-modal-cancel>${esc(t('common.cancel'))}</button>`,
    onMount: (el, done) => {
      el.querySelectorAll('[data-choice]').forEach((b) =>
        b.addEventListener('click', () => done(options[Number(b.dataset.choice)].value)),
      )
    },
  })
}
