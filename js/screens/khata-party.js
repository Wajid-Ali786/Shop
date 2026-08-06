import { esc, escAttr, on, toast, $, openSheet, closeSheet } from '../lib/dom.js'
import { t, localizedName } from '../i18n/index.js'
import { goBack, navigate } from '../lib/router.js'
import {
  state,
  khataPartyById,
  khataCategoryById,
  watchKhataEntries,
  addKhataEntry,
  productById,
} from '../store.js'
import { appBar, field, icon, empty, loading } from '../components.js'
import { formatMoney, formatDateTime } from '../lib/format.js'
import { searchProducts } from '../lib/search.js'
import { PAGE_SIZE, moreBar, autoLoadMore, resetAutoLoad } from '../lib/paging.js'

/**
 * Ek khate ki poori tafseel.
 *
 * Entries sirf yahan mangwai jati hain, app ke saath nahi — warna har dukan ke
 * har khate ki har entry hamesha download hoti rehti. Wahi tareeqa jo product
 * ki stock history me hai.
 */
let entries = []
let shownCount = PAGE_SIZE

export function renderKhataParty(root, partyId, rerender) {
  if (!state.ready) {
    root.innerHTML = loading()
    return
  }

  const party = khataPartyById(partyId)
  if (!party) {
    navigate('/khata')
    return
  }

  draw()

  const stop = watchKhataEntries(partyId, (rows) => {
    entries = rows
    draw()
  })

  function draw() {
    if (!root.isConnected) return

    const balance = Number(party.balance || 0)
    const currency = state.settings.currency
    const cats = (party.categoryIds || [])
      .map((id) => khataCategoryById(id))
      .filter(Boolean)

    root.innerHTML = `
      <div class="screen">
        ${appBar(party.name, {
          back: true,
          action: `<button class="icon-btn" data-edit
                     aria-label="${escAttr(t('common.edit'))}">${icon('edit')}</button>`,
        })}

        <div class="pad">
          <div class="card khatatotal" style="margin-bottom:16px">
            <p class="tiny muted">${esc(balance >= 0 ? t('khata.owesYou') : t('khata.advance'))}</p>
            <p class="khatatotal__value${balance > 0 ? ' khatatotal__value--owed' : ''}" dir="ltr">
              ${esc(formatMoney(Math.abs(balance), currency))}
            </p>
            ${
              cats.length
                ? `<p class="small muted">${cats
                    .map((c) => `${esc(c.icon || '📓')} ${esc(localizedName(c))}`)
                    .join(' · ')}</p>`
                : ''
            }
            ${party.phone ? `<p class="small muted" dir="ltr">${esc(party.phone)}</p>` : ''}
            ${party.note ? `<p class="small muted" dir="auto">${esc(party.note)}</p>` : ''}
          </div>

          <div class="grid-2" style="margin-bottom:16px">
            <button class="btn btn--danger" data-entry="diya">${esc(t('khata.gave'))}</button>
            <button class="btn btn--primary" data-entry="mila">${esc(t('khata.received'))}</button>
          </div>

          ${party.phone ? whatsappButton(party, balance, currency) : ''}

          <p class="formhead" style="margin:20px 0 10px">${esc(t('khata.history'))}</p>
          <div id="ke-results">${historyHtml(currency)}</div>
        </div>
      </div>`

    autoLoadMore(root, () => {
      shownCount += PAGE_SIZE
      draw()
    })
  }

  on(root, 'click', '[data-back]', () => goBack())
  on(root, 'click', '[data-edit]', () => navigate(`/khata/${partyId}/edit`))
  on(root, 'click', '[data-show-more]', () => {
    shownCount += PAGE_SIZE
    draw()
  })
  on(root, 'click', '[data-entry]', (_e, el) => openEntrySheet(partyId, el.dataset.entry))

  // Screen chhorte waqt listener band — warna khate jama hote rehte hain.
  return () => {
    stop()
    entries = []
    shownCount = PAGE_SIZE
    resetAutoLoad()
  }
}

/**
 * WhatsApp par khata bhejna.
 *
 * Dukandar ka asal tareeqa yehi hai: yaad dilane ke liye phone karna ya
 * message karna. Message me sirf baqaya raqam jati hai — poori history nahi,
 * kyunki wo grahak ke liye bay-maani hai aur jhagre ki jar banti hai.
 */
function whatsappButton(party, balance, currency) {
  if (balance <= 0) return ''
  const digits = String(party.phone || '').replace(/\D/g, '')
  if (!digits) return ''
  // 03xx… → 923xx… (Pakistan). Pehle se 92 ho to waisa hi rehne do.
  const intl = digits.startsWith('0') ? `92${digits.slice(1)}` : digits
  const text = t('khata.whatsappText', {
    shop: state.settings.shopName || t('welcome.title'),
    amount: formatMoney(balance, currency),
  })

  return `
    <a class="btn btn--secondary btn--full" target="_blank" rel="noopener"
       href="https://wa.me/${escAttr(intl)}?text=${encodeURIComponent(text)}">
      ${esc(t('khata.whatsapp'))}
    </a>`
}

function historyHtml(currency) {
  if (!entries.length) return empty('🧾', t('khata.noEntries'), t('khata.noEntriesHint'))

  const rows = entries
    .slice(0, shownCount)
    .map((e) => entryRow(e, currency))
    .join('')

  return `<ul class="mlist">${rows}</ul>
    ${moreBar(Math.min(shownCount, entries.length), entries.length)}`
}

function entryRow(entry, currency) {
  const gave = entry.type === 'diya'
  const items = (entry.items || [])
    .map((it) => {
      const product = it.productId ? productById(it.productId) : null
      const name = product ? localizedName(product) : it.text
      return it.qty ? `${name} × ${it.qty}` : name
    })
    .filter(Boolean)

  return `
    <li class="mrow">
      <span class="mrow__sign${gave ? ' mrow__sign--out' : ' mrow__sign--in'}">${gave ? '+' : '−'}</span>
      <div class="mrow__body">
        <p class="small bold">${esc(gave ? t('khata.gave') : t('khata.received'))}</p>
        ${items.length ? `<p class="small" dir="auto">${esc(items.join(', '))}</p>` : ''}
        ${
          entry.collectedBy
            ? `<p class="tiny muted" dir="auto">${esc(
                t('khata.collectedByLine', { name: entry.collectedBy }),
              )}</p>`
            : ''
        }
        <p class="tiny muted">
          <span dir="ltr">${esc(formatDateTime(entry.createdAt))}</span>${
            entry.note ? ` · ${esc(entry.note)}` : ''
          }
        </p>
      </div>
      <div class="mrow__qty">
        <p class="small bold" dir="ltr">${gave ? '+' : '−'}${esc(formatMoney(entry.amount, currency))}</p>
        <p class="tiny faint" dir="ltr">→ ${esc(formatMoney(entry.balanceAfter, currency))}</p>
      </div>
    </li>`
}

// ------------------------------------------------------------- entry sheet

/**
 * Nayi lein dein likhna.
 *
 * Do khane aise hain jo aam apps me nahi hote aur dukandar ke liye asal kaam
 * ke hain:
 *
 *   "kya le kar gaya" — app ki product chun sakte hain YA haath se likh sakte
 *   hain. Product chunne se stock NAHI badalta; ye jaan boojh kar hai, aur
 *   sheet me likha bhi hua hai taake dukandar ko gumaan na rahe.
 *
 *   "kaun aaya tha" — khata kisi aur ka hota hai aur lene aksar koi aur aata
 *   hai (bachcha, mulazim, parosi). Ye naam na likha ho to baad me jhagra
 *   hota hai ke "maine to liya hi nahi".
 */
function openEntrySheet(partyId, type) {
  const gave = type === 'diya'
  const items = []
  let productQuery = ''

  const wrap = openSheet(gave ? t('khata.gave') : t('khata.received'), `
    ${field(
      t('khata.amount'),
      `<input id="ke-amount" type="number" inputmode="decimal" min="0" step="0.01"
         dir="ltr" placeholder="0">`,
      { required: true },
    )}

    ${
      gave
        ? `<div id="ke-itembox">
             <p class="formhead" style="margin:4px 0 8px">${esc(t('khata.items'))}</p>
             <div id="ke-chosen"></div>
             <input id="ke-item" dir="auto" placeholder="${escAttr(t('khata.itemPlaceholder'))}">
             <div id="ke-suggest" class="tagideas__row"></div>
             <p class="field__hint" style="margin-bottom:14px">${esc(t('khata.itemsHint'))}</p>
           </div>

           ${field(
             t('khata.collectedBy'),
             `<input id="ke-by" dir="auto" placeholder="${escAttr(t('khata.collectedByPlaceholder'))}">`,
             { hint: t('khata.collectedByHint') },
           )}`
        : ''
    }

    ${field(t('khata.note'), `<input id="ke-note" dir="auto">`)}

    <div id="ke-error"></div>
    <button class="btn btn--primary btn--full" id="ke-save">${esc(t('common.save'))}</button>`)

  const body = wrap.querySelector('.sheet__body')
  const save = $('#ke-save', body)
  const errorBox = $('#ke-error', body)

  const fail = (message) => {
    errorBox.innerHTML = `<div class="auth__error">${esc(message)}</div>`
    save.disabled = false
    save.textContent = t('common.save')
  }

  // ---- "kya le kar gaya" ----
  const itemInput = $('#ke-item', body)
  const chosenBox = $('#ke-chosen', body)
  const suggestBox = $('#ke-suggest', body)

  function drawItems() {
    if (!chosenBox) return
    chosenBox.innerHTML = items.length
      ? `<ul class="taglist">${items
          .map(
            (it, i) => `
            <li class="tag">
              <span dir="auto">${esc(it.qty ? `${it.text} × ${it.qty}` : it.text)}</span>
              <button type="button" data-drop-item="${i}" aria-label="${escAttr(t('common.delete'))}">✕</button>
            </li>`,
          )
          .join('')}</ul>`
      : ''
  }

  function drawSuggestions() {
    if (!suggestBox) return
    const q = productQuery.trim()
    if (!q) {
      suggestBox.innerHTML = ''
      return
    }
    const found = searchProducts(state.products, q).slice(0, 5)
    suggestBox.innerHTML = found
      .map(
        (p) => `<button type="button" class="tagchip" data-pick="${escAttr(p.id)}">
                  ${esc(localizedName(p))}
                </button>`,
      )
      .join('')
  }

  function addItem(text, productId = null) {
    const clean = (text || '').trim()
    if (!clean) return
    items.push({ text: clean, productId, qty: null })
    productQuery = ''
    if (itemInput) itemInput.value = ''
    drawItems()
    drawSuggestions()
  }

  itemInput?.addEventListener('input', (e) => {
    productQuery = e.target.value
    drawSuggestions()
  })

  itemInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addItem(itemInput.value)
    }
  })

  body.addEventListener('click', (e) => {
    const pick = e.target.closest('[data-pick]')
    if (pick) {
      const product = productById(pick.dataset.pick)
      if (product) addItem(localizedName(product), product.id)
      return
    }
    const drop = e.target.closest('[data-drop-item]')
    if (drop) {
      items.splice(Number(drop.dataset.dropItem), 1)
      drawItems()
    }
  })

  save.addEventListener('click', async () => {
    const amount = Number($('#ke-amount', body).value)
    errorBox.innerHTML = ''
    if (!amount || amount <= 0) return fail(t('khata.errNoAmount'))

    // Khane me likha hua magar abhi tak jama na kiya gaya item bhi le lo —
    // warna dukandar ka likha hua chup chaap gum ho jata hai.
    if (itemInput?.value.trim()) addItem(itemInput.value)

    save.disabled = true
    save.innerHTML = '<span class="spinner spinner--sm"></span>'

    try {
      await addKhataEntry({
        partyId,
        type,
        amount,
        items,
        collectedBy: $('#ke-by', body)?.value,
        note: $('#ke-note', body)?.value,
      })
      closeSheet()
      toast(t('common.done'))
    } catch (err) {
      fail(err?.code === 'permission-denied' ? t('error.permission') : t('error.generic'))
    }
  })
}
