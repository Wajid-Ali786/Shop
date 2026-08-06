import { esc, escAttr, on, toast } from '../lib/dom.js'
import { t, localizedName, getLang } from '../i18n/index.js'
import { navigate } from '../lib/router.js'
import {
  state,
  productById,
  backupDue,
  daysSinceBackup,
  khataTotals,
  historyCleanupDue,
  countOldMovements,
  pruneOldMovements,
  snoozeHistoryCleanup,
} from '../store.js'
import { empty, loading, section, movementRow } from '../components.js'
import { formatMoney, formatDateTime } from '../lib/format.js'
import { runBackup } from '../lib/backup.js'
import { groupStockAlerts } from './stock.js'
import { confirmModal } from '../lib/modal.js'

export function renderDashboard(root) {
  if (!state.ready) {
    root.innerHTML = loading()
    return
  }

  const groups = groupStockAlerts(state.products)
  // Inventory value khareed rate par — cost na ho to sale price hi le lete hain.
  const value = state.products.reduce(
    (sum, p) => sum + (p.stockQty || 0) * (p.costPrice ?? p.salePrice ?? 0),
    0,
  )
  // Pehle wo movements chhanto jin ka product mojood hai, PHIR 6 lo — warna
  // agar aakhri 6 kisi delete-shuda product ki hon to list khali lagti hai.
  const recent = state.movements.filter((m) => productById(m.productId)).slice(0, 6)

  root.innerHTML = `
    <div class="screen">
      <header class="pad" style="padding-bottom:8px;padding-top:calc(env(safe-area-inset-top) + 16px)">
        <p class="small muted">${esc(t('home.title'))}</p>
        <h1 dir="auto">${esc(state.settings.shopName || t('home.title'))}</h1>
      </header>

      <div class="pad" style="padding-top:0">
        ${backupCard()}
        ${historyCard()}
        ${
          state.products.length === 0
            ? empty(
                '🏪',
                t('home.emptyTitle'),
                t('home.emptyBody'),
                `<button class="btn btn--primary" data-add>${esc(t('home.quickAdd'))}</button>`,
              )
            : `
          <div class="grid-2" style="margin-bottom:12px">
            ${stat(t('home.totalProducts'), String(state.products.length), '', '/products')}
            ${stat(t('home.inventoryValue'), formatMoney(value, state.settings.currency), '', '', true)}
          </div>

          ${
            khataTotals().total > 0
              ? `<div class="grid-2" style="margin-bottom:12px">
                   ${stat(
                     t('khata.totalOut'),
                     formatMoney(khataTotals().total, state.settings.currency),
                     'warn',
                     '/khata',
                   )}
                   ${stat(
                     t('khata.count', { count: khataTotals().people }),
                     String(khataTotals().people),
                     '',
                     '/khata',
                   )}
                 </div>`
              : ''
          }

          <div class="grid-2" style="margin-bottom:24px">
            ${stat(t('home.lowStock'), String(groups.low.length), groups.low.length ? 'warn' : '', '/stock')}
            ${stat(t('home.outOfStock'), String(groups.out.length), groups.out.length ? 'danger' : '', '/stock')}
            ${groups.expiring.length ? stat(t('home.expiringSoon'), String(groups.expiring.length), 'warn', '/stock') : ''}
            ${groups.expired.length ? stat(t('home.expired'), String(groups.expired.length), 'danger', '/stock') : ''}
          </div>

          ${
            groups.low.length || groups.out.length
              ? `<button class="btn btn--secondary btn--full" data-go="/stock" style="margin-bottom:24px">
                   📋 ${esc(t('home.viewLowStock'))}
                 </button>`
              : ''
          }

          ${section(
            t('home.recentActivity'),
            recent.length
              ? `<ul class="plist">${recent
                  .map((m) => {
                    const product = productById(m.productId)
                    return movementRow(
                      { ...m, when: formatDateTime(m.createdAt, getLang()) },
                      product,
                      localizedName(product),
                    )
                  })
                  .join('')}</ul>`
              : `<div class="card"><p class="small muted center">${esc(t('home.noActivity'))}</p></div>`,
          )}`
        }
      </div>
    </div>

    ${state.products.length ? `<button class="fab" data-add aria-label="${escAttr(t('home.quickAdd'))}">+</button>` : ''}`

  // Card par likha hai "backup mehfooz karein" — to dabate hi wahi hona
  // chahiye. Pehle ye Settings kholta tha, jo wada poora nahi karta tha.
  on(root, 'click', '[data-history-later]', async () => {
    await snoozeHistoryCleanup().catch(() => {})
  })

  on(root, 'click', '[data-history-clean]', async (_e, el) => {
    el.disabled = true
    try {
      const count = await countOldMovements()
      if (!count) {
        await snoozeHistoryCleanup()
        return
      }
      const ok = await confirmModal({
        title: t('settings.historyClean'),
        message: t('settings.historyConfirm', { count }),
        confirmLabel: t('common.delete'),
        danger: true,
      })
      if (!ok) return
      const gone = await pruneOldMovements()
      toast(t('settings.historyDone', { count: gone }))
    } catch {
      toast(t('error.generic'))
    } finally {
      el.disabled = false
    }
  })

  on(root, 'click', '[data-backup-now]', async (_e, el) => {
    await runBackup(el)
  })

  on(root, 'click', '[data-add]', () => navigate('/product/new'))
  on(root, 'click', '[data-go]', (_e, el) => navigate(el.dataset.go))
}

/**
 * Backup ki yaad-dihani.
 *
 * Sirf tab aati hai jab dukan me maal ho aur backup ko kaafi arsa ho gaya ho.
 * Ise band karne ka button jaan boojh kar nahi rakha — band karne wala
 * shopkeeper phir kabhi backup nahi karta. Ek tap me kaam ho jata hai, aur
 * backup ho jane par banner khud chala jata hai.
 */
/**
 * Purani stock history ki yaad dehani.
 *
 * Har das din me ek dafa, aur sirf tab jab waqai purana maal jama ho. "Abhi
 * nahi" dabane par bhi das din khamoshi rehti hai — rozana ka kaam karte hue
 * ye card baar baar saamne aana khud ek museebat ban jata.
 */
function historyCard() {
  if (!historyCleanupDue()) return ''

  return `
    <div class="card card--warn" style="margin-bottom:16px">
      <div class="row" style="gap:12px;align-items:flex-start">
        <span style="font-size:1.4rem;line-height:1">🧹</span>
        <div style="flex:1;min-width:0;text-align:start">
          <p class="bold">${esc(t('home.historyTitle'))}</p>
          <p class="small muted">${esc(t('home.historyBody'))}</p>
        </div>
      </div>
      <div class="grid-2" style="margin-top:12px">
        <button class="btn btn--secondary btn--sm" data-history-later>
          ${esc(t('home.historyLater'))}
        </button>
        <button class="btn btn--primary btn--sm" data-history-clean>
          ${esc(t('settings.historyClean'))}
        </button>
      </div>
    </div>`
}

function backupCard() {
  if (!backupDue()) return ''

  const days = daysSinceBackup()
  return `
    <button class="card card--warn card--tap" data-backup-now style="margin-bottom:16px">
      <div class="row" style="gap:12px;align-items:flex-start">
        <span style="font-size:1.4rem;line-height:1">💾</span>
        <div style="flex:1;min-width:0;text-align:start">
          <p class="bold">${esc(t('home.backupTitle'))}</p>
          <p class="small muted">
            ${esc(days === null ? t('home.backupNever') : t('home.backupOld', { days }))}
          </p>
        </div>
      </div>
    </button>`
}

function stat(label, value, tone = '', goTo = '', small = false) {
  const cls = tone ? ` stat--${tone}` : ''
  const attrs = goTo ? ` data-go="${escAttr(goTo)}"` : ''
  const tag = goTo ? 'button' : 'div'

  return `
    <${tag} class="stat${cls}"${attrs}>
      <p class="stat__label">${esc(label)}</p>
      <p class="stat__value${small ? ' stat__value--sm' : ''}">${esc(value)}</p>
    </${tag}>`
}
