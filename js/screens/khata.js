import { esc, escAttr, on } from '../lib/dom.js'
import { t, localizedName } from '../i18n/index.js'
import { navigate } from '../lib/router.js'
import { state, khataTotals, khataCategoryById } from '../store.js'
import { icon, empty, loading } from '../components.js'
import { formatMoney } from '../lib/format.js'
import { wireDragScroll } from '../lib/dragscroll.js'
import { PAGE_SIZE, moreBar, autoLoadMore, resetAutoLoad } from '../lib/paging.js'

/**
 * Udhaar khata — kis ne dukan ka kitna dena hai.
 *
 * Ye screen jaan boojh kar Products wali screen jaisi rakhi hai: wahi search,
 * wahi chips, wahi tarteeb, wahi "aur dikhayein". Dukandar ko nayi cheez
 * seekhni nahi parti — sirf list ka mazmoon alag hai.
 */

const ui = { query: '', categoryId: 'all', sort: 'recent', showSettled: false }

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

  const visible = filterParties()
  const totals = khataTotals()

  root.innerHTML = `
    <div class="screen">
      <div class="pad" style="padding-bottom:8px">
        <div class="card khatatotal">
          <p class="tiny muted">${esc(t('khata.totalOut'))}</p>
          <p class="khatatotal__value" dir="ltr">${esc(
            formatMoney(totals.total, state.settings.currency),
          )}</p>
          <p class="small muted">${esc(t('khata.fromPeople', { count: totals.people }))}</p>
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

    <button class="fab" data-add-party aria-label="${escAttr(t('khata.addParty'))}">+</button>`

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
  return Number(party.balance || 0) === 0 && Boolean(party.lastEntryAt)
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
  const cat = khataCategoryById((party.categoryIds || [])[0])
  const currency = state.settings.currency

  return `
    <div class="pcard">
      <button class="pcard__main" data-party="${escAttr(party.id)}">
        <span style="flex:1;min-width:0">
          <span class="bold truncate" dir="auto" style="display:block">${esc(party.name)}</span>
          <span class="tiny muted truncate" style="display:block">
            ${cat ? `${esc(cat.icon || '📓')} ${esc(localizedName(cat))}` : ''}
            ${party.phone ? `<span dir="ltr">${esc(party.phone)}</span>` : ''}
          </span>
        </span>
      </button>
      <div class="pcard__side">
        <span class="khatabal${balance > 0 ? ' khatabal--owed' : ''}" dir="ltr">
          ${esc(formatMoney(Math.abs(balance), currency))}
        </span>
      </div>
      ${icon('chevron', 'flip')}
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
  on(root, 'click', '[data-party]', (_e, el) => navigate(`/khata/${el.dataset.party}`))
}
