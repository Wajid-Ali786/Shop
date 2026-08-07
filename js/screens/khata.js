import { esc, escAttr, on, toast } from '../lib/dom.js'
import { t, localizedName } from '../i18n/index.js'
import { navigate } from '../lib/router.js'
import {
  state,
  khataTotals,
  khataCategoryById,
  deleteKhataParties,
  creditRoom,
} from '../store.js'
import { icon, empty, loading } from '../components.js'
import { formatMoney } from '../lib/format.js'
import { wireDragScroll } from '../lib/dragscroll.js'
import { confirmModal } from '../lib/modal.js'
import { PAGE_SIZE, moreBar, autoLoadMore, resetAutoLoad } from '../lib/paging.js'

/**
 * Udhaar khata — kis ne dukan ka kitna dena hai.
 *
 * Ye screen jaan boojh kar Products wali screen jaisi rakhi hai: wahi search,
 * wahi chips, wahi tarteeb, wahi "aur dikhayein". Dukandar ko nayi cheez
 * seekhni nahi parti — sirf list ka mazmoon alag hai.
 */

const ui = { query: '', categoryId: 'all', sort: 'recent', showSettled: false }

/**
 * Kai khate ek saath chunne ki halat.
 *
 * Bekaar khate jama ho jate hain aur ek ek kar ke mitana itna bora kaam hai ke
 * koi karta hi nahi — list bhari rehti hai aur asal baqaya us me gum ho jata
 * hai.
 */
let selecting = false
let picked = new Set()

function exitSelect() {
  selecting = false
  picked = new Set()
}

let shownCount = PAGE_SIZE

function resetPaging() {
  shownCount = PAGE_SIZE
  resetAutoLoad()
}

export function renderKhata(root, rerender) {
  if (!state.ready) {
    root.innerHTML = loading()
    return
  }

  // Koi khata darmiyan me hat gaya (doosre phone se) to chuna na reh jaye.
  for (const id of picked) {
    if (!state.khataParties.some((p) => p.id === id)) picked.delete(id)
  }

  const visible = filterParties()
  const totals = khataTotals()

  root.innerHTML = `
    <div class="screen">
      <div class="pad" style="padding-bottom:8px">
        <div class="card khatatotal">
          <p class="tiny muted">${esc(t('khata.totalOut'))}</p>
          <!--
            Sifar laal nahi hota. Laal ka matlab hai "dhyan do" — aur jab
            dukan ka koi paisa bahar nahi, to dhyan dene ki koi baat hi nahi.
            Bara laal sifar sab se upar khara ho to nazar ko bay-wajah dhoka
            deta hai.
          -->
          <p class="khatatotal__value${
            totals.total > 0 ? ' khatatotal__value--owed' : ''
          }" dir="ltr">${esc(formatMoney(totals.total, state.settings.currency))}</p>
          <p class="small muted">${esc(t('khata.fromPeople', { count: totals.people }))}</p>
          ${
            totals.deposit > 0
              ? `<p class="khatatotal__split">
                   ${esc(t('khata.totalIn'))}
                   <span class="tx__amount--in bold" dir="ltr">${esc(
                     formatMoney(totals.deposit, state.settings.currency),
                   )}</span>
                 </p>`
              : ''
          }
        </div>
      </div>

      <div class="searchbar">
        <div class="searchbar__wrap">
          <span class="searchbar__icon">${icon('search')}</span>
          <input type="search" id="kq" value="${escAttr(ui.query)}"
            placeholder="${escAttr(t('khata.searchPlaceholder'))}"
            aria-label="${escAttr(t('common.search'))}" dir="auto">
        </div>
      </div>

      ${categoryChips()}

      <div class="row row--between pad" style="padding-top:4px;padding-bottom:4px">
        <span class="tiny muted" id="k-count">${esc(t('khata.count', { count: visible.length }))}</span>
        ${
          state.khataParties.length && !selecting
            ? `<button class="btn btn--ghost btn--sm" data-select-mode>${esc(t('khata.select'))}</button>`
            : ''
        }
        <select id="ksort" class="tiny"
          style="width:auto;border:0;background:transparent;padding:4px;color:var(--text-muted)">
          <option value="recent"${ui.sort === 'recent' ? ' selected' : ''}>${esc(t('khata.sortRecent'))}</option>
          <option value="amount"${ui.sort === 'amount' ? ' selected' : ''}>${esc(t('khata.sortAmount'))}</option>
          <option value="name"${ui.sort === 'name' ? ' selected' : ''}>${esc(t('khata.sortName'))}</option>
        </select>
      </div>

      <div id="k-results">${listOrEmpty(visible)}</div>
      ${settledToggle()}
    </div>

    ${
      selecting
        ? `<div class="selectbar">
             <button class="btn btn--secondary btn--sm" data-select-cancel>
               ${esc(t('common.cancel'))}
             </button>
             <span class="small bold" style="flex:1;text-align:center">
               ${esc(t('khata.selected', { count: picked.size }))}
             </span>
             <button class="btn btn--danger btn--sm" data-select-delete ${
               picked.size ? '' : 'disabled'
             }>🗑️ ${esc(t('common.delete'))}</button>
           </div>`
        : `<button class="fab" data-add-party aria-label="${escAttr(t('khata.addParty'))}">+</button>`
    }`

  wire(root, rerender)
  afterList(root, rerender)
}

/** Sirf list dobara — search ka khana chhua nahi jata (wahi wajah jo products me hai). */
function refreshList(root, rerender) {
  const area = root.querySelector('#k-results')
  if (!area) return rerender()

  const visible = filterParties()
  area.innerHTML = listOrEmpty(visible)

  const count = root.querySelector('#k-count')
  if (count) count.textContent = t('khata.count', { count: visible.length })

  afterList(root, rerender)
}

function afterList(root, rerender) {
  wireDragScroll(root)
  autoLoadMore(root, () => {
    shownCount += PAGE_SIZE
    refreshList(root, rerender)
  })
}

function filterParties() {
  let list = state.khataParties

  if (ui.categoryId !== 'all') {
    list = list.filter((p) => (p.categoryIds || []).includes(ui.categoryId))
  }

  const query = ui.query.trim().toLowerCase()
  if (query) {
    // Phone bhi dhoonda jata hai — dukandar ko aksar naam se pehle number yaad
    // aata hai ("wo 0300 wala").
    list = list.filter((p) =>
      `${p.name || ''} ${p.phone || ''} ${p.note || ''}`.toLowerCase().includes(query),
    )
  } else if (!ui.showSettled) {
    list = list.filter((p) => !isSettled(p))
  }

  const sorted = [...list]
  if (ui.sort === 'amount') sorted.sort((a, b) => Number(b.balance || 0) - Number(a.balance || 0))
  else if (ui.sort === 'name') sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  else sorted.sort((a, b) => (b.lastEntryAt || b.createdAt || 0) - (a.lastEntryAt || a.createdAt || 0))
  return sorted
}

/**
 * Hisaab barabar ho chuka?
 *
 * Sirf sifar dekhna kaafi nahi tha: naya khata bhi sifar se shuru hota hai, to
 * dukandar khata banata aur wo bante hi list se ghayab ho jata — sirf "barabar
 * ho chuke dikhayein" dabane par milta. Barabar wohi hai jis par kuch chala ho
 * aur ab kuch baqi na ho.
 */
function isSettled(party) {
  // Jama bhi dekhna zaroori hai. Jis shakhs ne Rs 5,000 dukan me rakhe hain aur
  // udhaar kuch nahi, us ka `balance` sifar hota hai — sirf usay dekh kar app
  // us khate ko "barabar ho chuka" samajh kar chhupa deti thi, aur dukandar ke
  // paas para hua paisa rozana ki list se ghayab ho jata tha.
  return (
    Number(party.balance || 0) === 0 &&
    Number(party.deposit || 0) === 0 &&
    Boolean(party.lastEntryAt)
  )
}

function settledToggle() {
  const settled = state.khataParties.filter(isSettled)
  if (!settled.length) return ''

  return `
    <div class="pad" style="padding-top:0">
      <button class="btn btn--secondary btn--full btn--sm" data-toggle-settled>
        ${
          ui.showSettled
            ? esc(t('khata.hideSettled'))
            : esc(t('khata.showSettled', { count: settled.length }))
        }
      </button>
    </div>`
}

function categoryChips() {
  if (!state.khataCategories.length) return ''

  const chips = state.khataCategories
    .map(
      (c) => `
      <button class="chip${ui.categoryId === c.id ? ' chip--active' : ''}" data-kcat="${escAttr(c.id)}">
        ${esc(c.icon || '📓')} ${esc(localizedName(c))}
      </button>`,
    )
    .join('')

  return `
    <div class="chips">
      <button class="chip${ui.categoryId === 'all' ? ' chip--active' : ''}" data-kcat="all">
        ${esc(t('common.all'))}
      </button>
      ${chips}
    </div>`
}

function listOrEmpty(visible) {
  if (!visible.length) {
    if (!state.khataParties.length) {
      return empty(
        '📓',
        t('khata.empty'),
        t('khata.emptyHint'),
        `<button class="btn btn--primary" data-add-party>${esc(t('khata.addParty'))}</button>`,
      )
    }
    return empty('🔍', t('khata.noResults'), '')
  }

  const rows = visible
    .slice(0, shownCount)
    .map((p) => `<li>${partyRow(p)}</li>`)
    .join('')

  return `<ul class="plist pad" style="padding-top:0">${rows}</ul>
    ${moreBar(Math.min(shownCount, visible.length), visible.length)}`
}

function partyRow(party) {
  const balance = Number(party.balance || 0)
  const deposit = Number(party.deposit || 0)
  const cat = khataCategoryById((party.categoryIds || [])[0])
  const currency = state.settings.currency

  const on = picked.has(party.id)

  return `
    <div class="pcard${selecting && on ? ' pcard--picked' : ''}">
      ${
        selecting
          ? `<span class="pickbox${on ? ' pickbox--on' : ''}" aria-hidden="true">${on ? '✓' : ''}</span>`
          : ''
      }
      <button class="pcard__main" data-party="${escAttr(party.id)}">
        <span style="flex:1;min-width:0">
          <span class="bold truncate" dir="auto" style="display:block">${esc(party.name)}</span>
          <span class="tiny muted truncate" style="display:block">
            ${cat ? `${esc(cat.icon || '📓')} ${esc(localizedName(cat))}` : ''}
            ${party.phone ? `<span dir="ltr">${esc(party.phone)}</span>` : ''}
          </span>
          <!-- Hadd se bahar ja chuka khata rozana ki list me nazar aana chahiye. -->
          ${
            creditRoom(party)?.left < 0
              ? `<span class="limitflag">⚠️ ${esc(t('khata.overLimit'))}</span>`
              : ''
          }
        </span>
      </button>
      <div class="pcard__side">
        <!--
          Udhaar sifar ho magar jama para ho to wohi dikhana chahiye — warna
          row par "Rs 0" likha aata hai aur us ka paisa kahin nazar nahi aata.
        -->
        ${
          balance === 0 && deposit > 0
            ? `<span class="khatabal khatabal--advance" dir="ltr">
                 ${esc(formatMoney(deposit, currency))}
               </span>
               <span class="tiny muted">${esc(t('khata.jamaShort'))}</span>`
            : `<span class="khatabal${
                balance > 0 ? ' khatabal--owed' : balance < 0 ? ' khatabal--advance' : ''
              }" dir="ltr">
                 ${esc(formatMoney(Math.abs(balance), currency))}
               </span>`
        }
      </div>
      ${selecting ? '' : icon('chevron', 'flip')}
    </div>`
}

function wire(root, rerender) {
  const search = root.querySelector('#kq')
  if (search) {
    let timer
    search.addEventListener('input', (e) => {
      ui.query = e.target.value
      clearTimeout(timer)
      timer = setTimeout(() => {
        resetPaging()
        refreshList(root, rerender)
      }, 180)
    })
  }

  const sortSelect = root.querySelector('#ksort')
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      ui.sort = e.target.value
      resetPaging()
      rerender()
    })
  }

  on(root, 'click', '[data-kcat]', (_e, el) => {
    const value = el.dataset.kcat
    ui.categoryId = ui.categoryId === value ? 'all' : value
    resetPaging()
    rerender()
  })

  on(root, 'click', '[data-toggle-settled]', () => {
    ui.showSettled = !ui.showSettled
    resetPaging()
    rerender()
  })

  on(root, 'click', '[data-show-more]', () => {
    shownCount += PAGE_SIZE
    refreshList(root, rerender)
  })

  on(root, 'click', '[data-add-party]', () => navigate('/khata/new'))

  on(root, 'click', '[data-select-mode]', () => {
    selecting = true
    rerender()
  })

  on(root, 'click', '[data-select-cancel]', () => {
    exitSelect()
    rerender()
  })

  on(root, 'click', '[data-select-delete]', async () => {
    const ids = [...picked]
    if (!ids.length) return

    const ok = await confirmModal({
      title: t('khata.deleteParty'),
      message: t('khata.deleteManyConfirm', { count: ids.length }),
      confirmLabel: t('common.delete'),
      danger: true,
    })
    if (!ok) return

    try {
      await deleteKhataParties(ids)
      exitSelect()
      toast(t('common.done'))
    } catch {
      toast(t('error.generic'))
    }
    rerender()
  })

  on(root, 'click', '[data-party]', (_e, el) => {
    const id = el.dataset.party
    // Chunne ki halat me tap khata kholta nahi — sirf nishan lagata hai.
    if (!selecting) return navigate(`/khata/${id}`)
    if (picked.has(id)) picked.delete(id)
    else picked.add(id)
    rerender()
  })
}
