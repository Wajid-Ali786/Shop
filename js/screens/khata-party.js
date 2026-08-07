import { esc, escAttr, on, toast, $, openSheet, closeSheet } from '../lib/dom.js'
import { t, localizedName } from '../i18n/index.js'
import { goBack, navigate } from '../lib/router.js'
import {
  state,
  khataPartyById,
  khataCategoryById,
  watchKhataEntries,
  addKhataEntry,
  updateKhataEntry,
  deleteKhataEntry,
  khataSign,
  khataKindOf,
  khataField,
  khataCash,
  creditRoom,
  settleableAmount,
  settleFromDeposit,
  productById,
} from '../store.js'
import { appBar, field, icon, empty, loading } from '../components.js'
import { formatMoney, formatDateTime } from '../lib/format.js'
import { searchProducts } from '../lib/search.js'
import { confirmModal } from '../lib/modal.js'
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

/**
 * Chaar qismein — do simtein, magar dukandar ke liye chaar alag baatein.
 * Tafseel store ke `KHATA_KINDS` par likhi hai.
 */
const KINDS = [
  { kind: 'udhaar', key: 'khata.kindUdhaar', cls: 'kindbtn--out' },
  { kind: 'milay', key: 'khata.kindMilay', cls: 'kindbtn--in' },
  { kind: 'jama', key: 'khata.kindJama', cls: 'kindbtn--in' },
  { kind: 'wapas', key: 'khata.kindWapas', cls: 'kindbtn--out' },
]

function kindLabel(kind) {
  const found = KINDS.find((k) => k.kind === kind)
  return found ? t(found.key) : t('khata.kindUdhaar')
}

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
    const deposit = Number(party.deposit || 0)
    const currency = state.settings.currency
    const cats = (party.categoryIds || [])
      .map((id) => khataCategoryById(id))
      .filter(Boolean)
    const settleable = settleableAmount(party)

    root.innerHTML = `
      <div class="screen">
        ${appBar(party.name, {
          back: true,
          action: `<button class="icon-btn" data-edit-party
                     aria-label="${escAttr(t('common.edit'))}">${icon('edit')}</button>`,
        })}

        <div class="pad">
          <!--
            Do alag card, ek nahi. Udhaar aur jama do alag baatein hain — inhein
            ek hi adad me milane se dono chhup jate hain.
          -->
          <div class="${party.hasDeposit ? 'balcards' : ''}" style="margin-bottom:14px">
            <div class="card khatatotal">
              <p class="tiny muted">${esc(balance < 0 ? t('khata.youOwe') : t('khata.owesYou'))}</p>
              <p class="khatatotal__value${
                balance > 0
                  ? ' khatatotal__value--owed'
                  : balance < 0
                    ? ' khatatotal__value--advance'
                    : ''
              }" dir="ltr">${esc(formatMoney(Math.abs(balance), currency))}</p>
            </div>
            ${
              party.hasDeposit
                ? `<div class="card khatatotal">
                     <p class="tiny muted">${esc(t('khata.depositHeld'))}</p>
                     <p class="khatatotal__value khatatotal__value--advance" dir="ltr">${esc(
                       formatMoney(Math.abs(deposit), currency),
                     )}</p>
                   </div>`
                : ''
            }
          </div>

          ${
            cats.length || party.phone || party.note || creditRoom(party)
              ? `<div class="card" style="margin-bottom:14px;text-align:center">
                   ${
                     cats.length
                       ? `<p class="small muted">${cats
                           .map((c) => `${esc(c.icon || '📓')} ${esc(localizedName(c))}`)
                           .join(' · ')}</p>`
                       : ''
                   }
                   ${party.phone ? `<p class="small muted" dir="ltr">${esc(party.phone)}</p>` : ''}
                   ${party.note ? `<p class="small muted" dir="auto">${esc(party.note)}</p>` : ''}
                   ${limitLine(party, currency)}
                 </div>`
              : ''
          }

          <!-- Jama wale do button sirf us khate par jis par ye chalu ho. -->
          <div class="kindgrid">
            ${KINDS.filter((k) => party.hasDeposit || khataField(k.kind) === 'balance')
              .map(
                (k) => `
              <button class="kindbtn ${k.cls}" data-entry="${escAttr(k.kind)}">
                ${esc(t(k.key))}
              </button>`,
              )
              .join('')}
          </div>

          <!--
            Jama aur udhaar dono chal rahe hon to inhein aamne saamne karne ka
            ek button. Sirf usi soorat me dikhta hai jab waqai kuch chukaya ja
            sakta ho — warna ye jagah gher kar khara rehta aur kuch karta bhi
            nahi.
          -->
          ${
            settleable
              ? `<button class="btn btn--secondary btn--full" data-settle style="margin-top:12px">
                   ⚖️ ${esc(t('khata.settleFromDeposit', { amount: formatMoney(settleable, currency) }))}
                 </button>`
              : ''
          }

          ${party.phone ? whatsappButton(party, balance, currency) : ''}

          <p class="formhead" style="margin:20px 0 10px">${esc(t('khata.history'))}</p>
          ${historyHtml(currency)}
        </div>
      </div>`

    autoLoadMore(root, () => {
      shownCount += PAGE_SIZE
      draw()
    })
  }

  on(root, 'click', '[data-back]', () => goBack())
  on(root, 'click', '[data-edit-party]', () => navigate(`/khata/${partyId}/edit`))
  on(root, 'click', '[data-row]', (_e, el) => {
    const entry = entries.find((x) => x.id === el.dataset.row)
    if (entry) openEntryDetail(entry)
  })
  on(root, 'click', '[data-show-more]', () => {
    shownCount += PAGE_SIZE
    draw()
  })
  on(root, 'click', '[data-entry]', (_e, el) => openEntrySheet(partyId, el.dataset.entry))

  on(root, 'click', '[data-settle]', async (_e, el) => {
    const current = khataPartyById(partyId)
    const amount = settleableAmount(current)
    if (!amount) return

    // Do entries banti hain aur hisaab do jagah badalta hai — is se pehle ek
    // dafa poochh lena banta hai.
    const ok = await confirmModal({
      title: t('khata.settleTitle'),
      message: t('khata.settleConfirm', {
        amount: formatMoney(amount, state.settings.currency),
        name: current.name,
      }),
      confirmLabel: t('khata.settleDo'),
    })
    if (!ok) return

    el.disabled = true
    try {
      await settleFromDeposit(partyId)
      toast(t('khata.settleDone'))
    } catch {
      toast(t('error.generic'))
    } finally {
      el.disabled = false
    }
  })

  // Screen chhorte waqt listener band — warna khate jama hote rehte hain.
  return () => {
    stop()
    entries = []
    shownCount = PAGE_SIZE
    resetAutoLoad()
  }
}

/**
 * Udhaar ki hadd — kitni gunjaish baqi hai.
 *
 * Hadd na ho to kuch nahi likha jata. Hadd se bahar ja chuke hon to laal,
 * warna sirf itna ke aur kitna diya ja sakta hai.
 */
function limitLine(party, currency) {
  const room = creditRoom(party)
  if (!room) return ''

  return room.left < 0
    ? `<p class="small" style="color:var(--danger);font-weight:700">${esc(
        t('khata.overLimitBy', {
          amount: formatMoney(Math.abs(room.left), currency),
          limit: formatMoney(room.limit, currency),
        }),
      )}</p>`
    : `<p class="small muted">${esc(
        t('khata.limitLeft', {
          left: formatMoney(room.left, currency),
          limit: formatMoney(room.limit, currency),
        }),
      )}</p>`
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

/**
 * History — bank wali app jaisi.
 *
 * Qism ka naam har row par nahi likha jata. Simt sirf RANG se batayi jati hai
 * (laal = grahak ka dena barha, sabz = ghata), aur `+` / `−` ke nishan bhi
 * nahi — do ishare ek hi baat ke liye sirf shor karte hain. Row par wohi hai
 * jo aankh dhoondti hai: kya liya aur kab.
 *
 * Baqi sab tafseel tap karne par khulti hai.
 */
function historyHtml(currency) {
  if (!entries.length) return empty('🧾', t('khata.noEntries'), t('khata.noEntriesHint'))

  const rows = entries
    .slice(0, shownCount)
    .map((e) => entryRow(e, currency))
    .join('')

  return `<ul class="txlist">${rows}</ul>
    ${moreBar(Math.min(shownCount, entries.length), entries.length)}`
}

function entryRow(entry, currency) {
  // Rang paisa ki simt batata hai, hisaab ki nahi — dekhein store ka `khataCash`.
  const up = khataCash(khataKindOf(entry)) === 'out'
  const title = itemsLine(entry) || kindLabel(khataKindOf(entry))

  return `
    <li>
      <button class="tx" data-row="${escAttr(entry.id)}">
        <span class="tx__body">
          <span class="tx__title truncate" dir="auto">${esc(title)}</span>
          <span class="tx__time" dir="ltr">${esc(formatDateTime(entry.createdAt))}</span>
        </span>
        <span class="tx__amount ${up ? 'tx__amount--out' : 'tx__amount--in'}" dir="ltr">
          ${esc(formatMoney(entry.amount, currency))}
        </span>
      </button>
    </li>`
}

/** "Basmati Rice, cheeni aadha kilo" — jo le kar gaya. */
function itemsLine(entry) {
  return (entry.items || [])
    .map((it) => {
      const product = it.productId ? productById(it.productId) : null
      const name = product ? localizedName(product) : it.text
      return it.qty ? `${name} × ${it.qty}` : name
    })
    .filter(Boolean)
    .join(', ')
}

// --------------------------------------------------------- entry ki tafseel

/**
 * Ek lein dein ki poori tafseel — aur usay theek karne ka rasta.
 *
 * Editable hona zaroori hai. Dukandar jaldi me likhta hai: raqam ka ek hindsa
 * ghalat, ya qism ghalat chun li. Pehle is ka koi ilaj nahi tha — sirf ek
 * "ulta" entry likhna, jo history ko aur uljha deta hai. Ab tabdeeli par us ke
 * baad ka poora hisaab khud dobara ban jata hai (store ka `recalcParty`).
 */
function openEntryDetail(entry) {
  const currency = state.settings.currency
  const up = khataCash(khataKindOf(entry)) === 'out'
  const items = itemsLine(entry)

  const wrap = openSheet(t('khata.entryDetail'), `
    <div class="txdetail">
      <p class="txdetail__amount ${up ? 'tx__amount--out' : 'tx__amount--in'}" dir="ltr">
        ${esc(formatMoney(entry.amount, currency))}
      </p>
      <p class="small muted center">${esc(kindLabel(khataKindOf(entry)))}</p>
    </div>

    <dl class="deflist">
      ${defRow(t('khata.entryWhen'), formatDateTime(entry.createdAt), 'ltr')}
      ${items ? defRow(t('khata.items'), items) : ''}
      ${entry.collectedBy ? defRow(t('khata.collectedBy'), entry.collectedBy) : ''}
      ${entry.note ? defRow(t('khata.note'), entry.note) : ''}
      ${defRow(
        khataField(khataKindOf(entry)) === 'deposit'
          ? t('khata.depositAfter')
          : t('khata.balanceAfter'),
        balanceLabel(entry.balanceAfter ?? 0, currency, khataField(khataKindOf(entry))),
      )}
      ${entry.editedAt ? defRow(t('khata.edited'), formatDateTime(entry.editedAt), 'ltr') : ''}
    </dl>

    <button class="btn btn--primary btn--full" id="td-edit">${esc(t('common.edit'))}</button>
    <button class="btn btn--secondary btn--full" id="td-del" style="margin-top:10px">
      🗑️ ${esc(t('common.delete'))}
    </button>`)

  const body = wrap.querySelector('.sheet__body')

  $('#td-edit', body).addEventListener('click', () => {
    closeSheet()
    openEntrySheet(entry.partyId, khataKindOf(entry), entry)
  })

  $('#td-del', body).addEventListener('click', async () => {
    const ok = await confirmModal({
      title: t('khata.deleteEntry'),
      message: t('khata.deleteEntryConfirm'),
      confirmLabel: t('common.delete'),
      danger: true,
    })
    if (!ok) return
    try {
      await deleteKhataEntry(entry.id)
      closeSheet()
      toast(t('common.done'))
    } catch {
      toast(t('error.generic'))
    }
  })
}

/**
 * Balance ko lafzon me batana.
 *
 * `formatMoney(-550)` "Rs -550" deta hai — ek manfi nishan jo dukandar ko kuch
 * nahi batata. Manfi ka matlab yahan bilkul saaf hai: dukandar ne dena hai.
 * Wohi likh dete hain, nishan ke bajaye.
 */
function balanceLabel(value, currency, field = 'balance') {
  const amount = formatMoney(Math.abs(value), currency)
  // Jama ka hisaab hamesha "dukan me para hua" hota hai — us par lena/dena ka
  // sawal hi nahi uthta.
  if (field === 'deposit') return amount
  if (value > 0) return `${amount} · ${t('khata.owesYou')}`
  if (value < 0) return `${amount} · ${t('khata.youOwe')}`
  return t('khata.clear')
}

/**
 * `datetime-local` ke liye waqt.
 *
 * Wo khana hamesha LOCAL waqt maangta hai aur `toISOString()` UTC deta hai —
 * seedha daalne par Pakistan me har tareekh paanch ghante peeche chali jati.
 * Is liye offset khud nikal kar lagate hain.
 */
function localInput(ms) {
  if (!ms) return ''
  const d = new Date(ms)
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function defRow(label, value, dir = 'auto') {
  return `
    <div class="deflist__row">
      <dt>${esc(label)}</dt>
      <dd dir="${escAttr(dir)}">${esc(value)}</dd>
    </div>`
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
function openEntrySheet(partyId, kind, existing = null) {
  // Jama wale buttons sirf us khate par jis par dukandar ne ye chalu kiya ho.
  const allowDeposit = Boolean(khataPartyById(partyId)?.hasDeposit)
  const isEdit = Boolean(existing)
  const items = existing ? (existing.items || []).map((it) => ({ ...it })) : []
  let productQuery = ''
  let selectedKind = kind

  const wrap = openSheet(isEdit ? t('khata.editEntry') : kindLabel(kind), `
    <div class="kindpick">
      ${KINDS.filter((k) => allowDeposit || khataField(k.kind) === 'balance')
        .map(
          (k) => `
        <button type="button"
          class="kindpick__btn${k.kind === selectedKind ? ' kindpick__btn--on' : ''}"
          data-kind="${escAttr(k.kind)}">${esc(t(k.key))}</button>`,
        )
        .join('')}
    </div>

    ${field(
      t('khata.amount'),
      `<input id="ke-amount" type="number" inputmode="decimal" min="0" step="0.01"
         dir="ltr" placeholder="0" value="${escAttr(existing ? String(existing.amount) : '')}">`,
      { required: true },
    )}

    <div id="ke-itembox">
      <p class="formhead" style="margin:4px 0 8px">${esc(t('khata.items'))}</p>
      <div id="ke-chosen"></div>
      <input id="ke-item" dir="auto" placeholder="${escAttr(t('khata.itemPlaceholder'))}">
      <div id="ke-suggest" class="tagideas__row"></div>
      <p class="field__hint" style="margin-bottom:14px">${esc(t('khata.itemsHint'))}</p>
    </div>

    ${field(
      t('khata.collectedBy'),
      `<input id="ke-by" dir="auto" value="${escAttr(existing?.collectedBy || '')}"
         placeholder="${escAttr(t('khata.collectedByPlaceholder'))}">`,
      { hint: t('khata.collectedByHint') },
    )}

    ${field(
      t('khata.note'),
      `<input id="ke-note" dir="auto" value="${escAttr(existing?.note || '')}">`,
    )}

    <!--
      Tareekh dukandar chun sakta hai. Sham ko bahi khol kar din bhar ka
      likhna aam baat hai — us waqt har entry par aaj ka waqt lag jana history
      ko ghalat kar deta hai.
    -->
    ${field(
      t('khata.entryWhen'),
      `<input id="ke-when" type="datetime-local" dir="ltr" value="${escAttr(
        localInput(existing?.createdAt),
      )}">`,
    )}

    <div id="ke-limit"></div>
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

  body.querySelectorAll('[data-kind]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedKind = btn.dataset.kind
      body.querySelectorAll('[data-kind]').forEach((b) => {
        b.classList.toggle('kindpick__btn--on', b.dataset.kind === selectedKind)
      })
      drawLimit()
    })
  })

  /*
   * Udhaar ki hadd ki tanbeeh — likhte hi, save se pehle.
   *
   * Ye ROKTI nahi. Aakhri faisla dukandar ka hai: wo grahak ko jaanta hai, app
   * nahi. Rokne se wo app chhor kar kaghaz par likhne lagta, aur phir hisaab
   * do jagah bat jata — jo is se kahin bura hai.
   */
  const limitBox = $('#ke-limit', body)
  const amountInput = $('#ke-amount', body)

  function drawLimit() {
    // Sirf udhaar dene par — pesay milne par hadd ka sawal hi nahi.
    if (khataField(selectedKind) !== 'balance' || khataSign(selectedKind) < 0) {
      limitBox.innerHTML = ''
      return
    }
    const room = creditRoom(khataPartyById(partyId), Number(amountInput.value) || 0)
    if (!room || !room.exceeds) {
      limitBox.innerHTML = ''
      return
    }
    limitBox.innerHTML = `<div class="card card--warn" style="margin-bottom:12px">
      <p class="small bold">⚠️ ${esc(t('khata.limitWarnTitle'))}</p>
      <p class="small">${esc(
        t('khata.limitWarnBody', {
          limit: formatMoney(room.limit, state.settings.currency),
          after: formatMoney(room.after, state.settings.currency),
          over: formatMoney(room.over, state.settings.currency),
        }),
      )}</p>
    </div>`
  }

  amountInput.addEventListener('input', drawLimit)

  // ---- "kya le kar gaya" ----
  const itemInput = $('#ke-item', body)
  const chosenBox = $('#ke-chosen', body)
  const suggestBox = $('#ke-suggest', body)

  function drawItems() {
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
    itemInput.value = ''
    drawItems()
    drawSuggestions()
  }

  itemInput.addEventListener('input', (e) => {
    productQuery = e.target.value
    drawSuggestions()
  })

  itemInput.addEventListener('keydown', (e) => {
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

  drawItems()

  save.addEventListener('click', async () => {
    const amount = Number($('#ke-amount', body).value)
    errorBox.innerHTML = ''
    if (!amount || amount <= 0) return fail(t('khata.errNoAmount'))

    // Khane me likha hua magar abhi tak jama na kiya gaya item bhi le lo —
    // warna dukandar ka likha hua chup chaap gum ho jata hai.
    if (itemInput.value.trim()) addItem(itemInput.value)

    // Hadd se bahar ja raha ho to ek dafa poochte hain — mana nahi karte.
    const room = creditRoom(khataPartyById(partyId), amount)
    if (khataField(selectedKind) === 'balance' && khataSign(selectedKind) > 0 && room?.exceeds) {
      const go = await confirmModal({
        title: t('khata.limitWarnTitle'),
        message: t('khata.limitConfirm', {
          limit: formatMoney(room.limit, state.settings.currency),
          after: formatMoney(room.after, state.settings.currency),
        }),
        confirmLabel: t('khata.limitGoAhead'),
        danger: true,
      })
      if (!go) return
    }

    save.disabled = true
    save.innerHTML = '<span class="spinner spinner--sm"></span>'

    const when = $('#ke-when', body).value
    const payload = {
      kind: selectedKind,
      amount,
      items,
      collectedBy: $('#ke-by', body).value,
      note: $('#ke-note', body).value,
      // Khali chhora ho to abhi ka waqt — server tay karta hai.
      at: when ? new Date(when).getTime() : undefined,
    }

    try {
      if (isEdit) await updateKhataEntry(existing.id, payload)
      else await addKhataEntry({ partyId, ...payload })
      closeSheet()
      toast(t('common.done'))
    } catch (err) {
      fail(err?.code === 'permission-denied' ? t('error.permission') : t('error.generic'))
    }
  })
}
