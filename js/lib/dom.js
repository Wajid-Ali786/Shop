/**
 * Chhote DOM helpers. Koi framework nahi — HTML template strings se banate hain
 * aur events delegation se sunte hain.
 */

/**
 * HTML me daalne se pehle text ko mehfooz banata hai.
 *
 * Ye ZAROORI hai: product ka naam, tag, note — sab user ka likha hua hai. Agar
 * koi naam me <script> likh de aur hum use waise hi innerHTML me daal dein to
 * wo chal jayega. Har user-content ko isi se guzarna hai.
 */
export function esc(value) {
  if (value === undefined || value === null) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Attribute ke andar rakhne ke liye (quotes ke sath). */
export function escAttr(value) {
  return esc(value)
}

export function $(selector, root = document) {
  return root.querySelector(selector)
}

export function $$(selector, root = document) {
  return Array.from(root.querySelectorAll(selector))
}

/**
 * Event delegation: root par ek listener, andar jo bhi `selector` se match
 * kare us par chalta hai. Is se har render par listeners dobara lagane ki
 * zaroorat nahi parti.
 */
/**
 * Delegated event — root par ek listener, andar ke elements ke liye.
 *
 * Wahi root + type + selector dobara aane par PURANA hata diya jata hai.
 *
 * Is ke baghair ek sanjeeda bug tha: kuch screens (jaise product detail) apne
 * hi root me baar baar dobara banti hain — jab Firestore ka naya snapshot aata
 * hai. Har dafa wahi handler dobara lag jata tha, aur listener jamā hote rehte.
 * Nateeja: back ek dafa dabane par `history.back()` do teen dafa chalta tha aur
 * dukandar products ki jagah Settings par pahunch jata tha. Yehi baat delete
 * aur stock wale buttons par bhi lagti thi — wo bhi kai baar chalte the.
 */
export function on(root, type, selector, handler) {
  const key = `${type}|${selector}`
  if (!root.__delegated) root.__delegated = new Map()

  const previous = root.__delegated.get(key)
  if (previous) root.removeEventListener(type, previous)

  const listener = (event) => {
    const target = event.target.closest(selector)
    if (target && root.contains(target)) handler(event, target)
  }
  root.__delegated.set(key, listener)
  root.addEventListener(type, listener)

  return () => {
    root.removeEventListener(type, listener)
    if (root.__delegated.get(key) === listener) root.__delegated.delete(key)
  }
}

/** Chhota toast neeche se. */
let toastTimer
export function toast(message) {
  let el = document.getElementById('toast')
  if (!el) {
    el = document.createElement('div')
    el.id = 'toast'
    el.className = 'toast'
    document.body.appendChild(el)
  }
  el.textContent = message
  el.classList.add('toast--show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('toast--show'), 2400)
}

/** Bottom sheet kholta hai. `html` andar ka content hai. */
export function openSheet(title, html) {
  closeSheet()
  const wrap = document.createElement('div')
  wrap.className = 'sheet-backdrop'
  wrap.id = 'sheet'
  wrap.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${escAttr(title)}">
      <div class="sheet__head">
        <h3>${esc(title)}</h3>
        <button class="icon-btn" data-sheet-close aria-label="Close">✕</button>
      </div>
      <div class="sheet__body">${html}</div>
    </div>`
  document.body.appendChild(wrap)
  document.body.classList.add('no-scroll')

  wrap.addEventListener('click', (e) => {
    if (e.target === wrap || e.target.closest('[data-sheet-close]')) closeSheet()
  })
  document.addEventListener('keydown', escToClose)
  return wrap
}

export function closeSheet() {
  const el = document.getElementById('sheet')
  if (el) el.remove()
  document.body.classList.remove('no-scroll')
  document.removeEventListener('keydown', escToClose)
}

function escToClose(e) {
  if (e.key === 'Escape') closeSheet()
}
