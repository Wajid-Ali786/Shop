import { esc, escAttr, on, toast, $ } from '../lib/dom.js'
import { t, getLang, setLang } from '../i18n/index.js'
import { navigate } from '../lib/router.js'
import {
  state,
  saveSetting,
  restoreExport,
  isValidExport,
  isNewerExport,
  catalogOn,
  publishCatalog,
  unpublishCatalog,
  backupReminderDays,
  BACKUP_REMINDER_CHOICES,
} from '../store.js'
import { appBar, field, options, icon, section } from '../components.js'
import { applyTheme, setTheme, getTheme } from '../lib/theme.js'
import { currentEmail, signOut } from '../firebase.js'
import { openChangeEmailSheet, openChangePasswordSheet, openTrustDeviceSheet } from './account.js'
import { chooseModal, alertModal, confirmModal } from '../lib/modal.js'
import { runBackup } from '../lib/backup.js'
import { installState, promptInstall, onInstallChange } from '../lib/install.js'
import { isTrusted, setTrusted } from '../lib/trusted.js'

export function renderSettings(root, rerender) {
  const settings = state.settings
  const theme = getTheme()
  const lang = getLang()

  root.innerHTML = `
    <div class="screen">
      ${appBar(t('settings.title'))}

      <div class="pad">
        ${section(
          t('settings.language'),
          `<div class="choices choices--2">
             <button class="choice${lang === 'en' ? ' choice--active' : ''}" data-lang="en">English</button>
             <button class="choice${lang === 'ur' ? ' choice--active' : ''}" data-lang="ur">اردو</button>
           </div>`,
        )}

        ${section(
          t('settings.theme'),
          `<div class="choices choices--3">
             <button class="choice${theme === 'light' ? ' choice--active' : ''}" data-theme="light">☀️ ${esc(t('settings.themeLight'))}</button>
             <button class="choice${theme === 'dark' ? ' choice--active' : ''}" data-theme="dark">🌙 ${esc(t('settings.themeDark'))}</button>
             <button class="choice${theme === 'system' ? ' choice--active' : ''}" data-theme="system">⚙️ ${esc(t('settings.themeSystem'))}</button>
           </div>`,
        )}

        ${installSection()}

        ${section(
          '',
          `<div class="card">
             ${field(
               t('settings.shopName'),
               `<input id="s-shopName" value="${escAttr(settings.shopName)}" dir="auto"
                  placeholder="${escAttr(t('settings.shopNamePlaceholder'))}">`,
             )}
             <div class="grid-2">
               ${field(
                 t('settings.currency'),
                 `<input id="s-currency" value="${escAttr(settings.currency)}" maxlength="5">`,
               )}
               ${field(
                 t('settings.defaultLowStock'),
                 `<input id="s-lowStock" type="number" min="0" inputmode="decimal"
                    value="${escAttr(settings.defaultLowStockAt)}">`,
               )}
             </div>
           </div>`,
        )}

        ${section(
          t('nav.settings'),
          `<button class="list-row" data-go="/categories">
             <span class="bold" style="flex:1">${esc(t('categories.title'))}</span>
             ${icon('chevron', 'flip')}
           </button>`,
        )}

        ${section(
          t('settings.dataSection'),
          `<div class="card">
             <p class="small muted" style="margin-bottom:12px">${esc(t('settings.exportDesc'))}</p>
             <button class="btn btn--secondary btn--full" data-export style="margin-bottom:10px">
               💾 ${esc(t('settings.export'))}
             </button>
             <button class="btn btn--secondary btn--full" data-restore>
               📂 ${esc(t('settings.restore'))}
             </button>
             <input type="file" accept="application/json,.json" id="restore-file" hidden>
             <p class="small muted" style="margin-top:12px">${esc(t('settings.restoreDesc'))}</p>

             <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:14px">
               ${field(
                 t('settings.backupReminder'),
                 `<select id="s-backupDays">${options(
                   BACKUP_REMINDER_CHOICES.map((d) => ({
                     value: String(d),
                     label: d === 0 ? t('settings.backupReminderOff') : t('settings.backupReminderDays', { days: d }),
                   })),
                   String(backupReminderDays(settings)),
                 )}</select>`,
                 { hint: t('settings.backupReminderHint') },
               )}
             </div>
           </div>`,
        )}

        ${section(
          t('settings.catalog'),
          `<div class="card">
             <p class="small muted" style="margin-bottom:12px">${esc(t('settings.catalogDesc'))}</p>
             <div class="choices choices--2" style="margin-bottom:10px">
               <button class="choice${catalogOn(settings) ? ' choice--active' : ''}" data-catalog="on">
                 ${esc(t('settings.catalogOn'))}
               </button>
               <button class="choice${catalogOn(settings) ? '' : ' choice--active'}" data-catalog="off">
                 ${esc(t('settings.catalogOff'))}
               </button>
             </div>
             <p class="field__hint">${esc(t('settings.catalogSafety'))}</p>
             ${
               catalogOn(settings)
                 ? `<button class="btn btn--secondary btn--full btn--sm" data-republish
                      style="margin-top:12px">🔄 ${esc(t('settings.catalogRepublish'))}</button>`
                 : ''
             }
           </div>`,
        )}

        ${trustedSection()}

        ${section(
          t('settings.account'),
          `<div class="card">
             <p class="tiny muted">${esc(t('account.signedInAs'))}</p>
             <p class="bold" dir="ltr" style="margin-bottom:14px">${esc(currentEmail())}</p>

             <button class="list-row" data-change-email style="margin-bottom:8px">
               <span style="flex:1">
                 <span class="bold">${esc(t('account.changeEmail'))}</span>
               </span>
               ${icon('chevron', 'flip')}
             </button>

             <button class="list-row" data-change-password style="margin-bottom:14px">
               <span style="flex:1">
                 <span class="bold">${esc(t('account.changePassword'))}</span>
               </span>
               ${icon('chevron', 'flip')}
             </button>

             <button class="btn btn--secondary btn--full" data-signout>${esc(t('auth.signOut'))}</button>
           </div>`,
        )}

        ${section(
          t('settings.about'),
          `<div class="card"><p class="small muted">${esc(t('settings.aboutCloud'))}</p></div>`,
        )}
      </div>
    </div>`

  // ---- app install ----
  on(root, 'click', '[data-install]', async (_e, el) => {
    el.disabled = true
    const outcome = await promptInstall()
    el.disabled = false
    if (outcome === 'accepted') toast(t('settings.installStarted'))
    // 'dismissed' par kuch nahi kehte — dukandar ne khud mana kiya hai.
    rerender()
  })

  // ---- trusted device ----
  on(root, 'click', '[data-trusted]', (_e, el) => {
    const turnOn = el.dataset.trusted === 'on'
    if (turnOn === isTrusted()) return

    if (turnOn) {
      // Pehle switch chalu karte hain — warna sheet me `rememberLogin()` ke
      // waqt switch band hota hai aur wo chup chaap kuch mehfooz nahi karta.
      setTrusted(true)
      openTrustDeviceSheet((saved) => {
        // Password tasdeeq na ho to switch bhi wapas band — warna dukandar ko
        // "chalu hai" dikhta rehta aur khane phir bhi khali aate.
        if (!saved) setTrusted(false)
        rerender()
      })
      return
    }

    setTrusted(false)
    // Band karte hi mehfooz kiya hua login mit chuka hai (dekhein trusted.js).
    toast(t('settings.trustedCleared'))
    rerender()
  })

  // ---- language / theme ----
  on(root, 'click', '[data-lang]', (_e, el) => {
    setLang(el.dataset.lang)
    rerender()
  })

  on(root, 'click', '[data-theme]', (_e, el) => {
    setTheme(el.dataset.theme)
    applyTheme()
    rerender()
  })

  on(root, 'click', '[data-go]', (_e, el) => navigate(el.dataset.go))

  // ---- settings fields: blur par save (har keystroke par nahi) ----
  bindSetting(root, '#s-shopName', 'shopName', (v) => v)
  bindSetting(root, '#s-currency', 'currency', (v) => v.trim() || 'Rs')
  bindSetting(root, '#s-lowStock', 'defaultLowStockAt', (v) => Number(v) || 0)
  bindSetting(root, '#s-backupDays', 'backupReminderDays', (v) => Number(v) || 0)

  // ---- export ----
  on(root, 'click', '[data-export]', async (_e, el) => {
    await runBackup(el)
  })

  // ---- restore ----
  on(root, 'click', '[data-restore]', () => $('#restore-file', root)?.click())

  $('#restore-file', root)?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    let data
    try {
      data = JSON.parse(await file.text())
    } catch {
      data = null
    }
    if (!isValidExport(data)) {
      await alertModal({
        title: t('settings.restore'),
        // Nayi file par alag paighaam — "ye file kharab hai" ghalat baat hoti,
        // file bilkul theek hai, bas app purani hai.
        message: isNewerExport(data) ? t('settings.restoreNewer') : t('settings.restoreInvalid'),
      })
      return
    }

    // Replace se maujooda data mit jata hai — is liye pehle poochte hain.
    const mode = await chooseModal({
      title: t('settings.restore'),
      message: t('settings.restoreMode', { products: data.products.length }),
      options: [
        {
          value: 'merge',
          label: t('settings.restoreMerge'),
          description: t('settings.restoreMergeDesc'),
        },
        {
          value: 'replace',
          label: t('settings.restoreReplace'),
          description: t('settings.restoreReplaceDesc'),
          danger: true,
        },
      ],
    })
    if (!mode) return

    toast(t('settings.restoring'))
    try {
      const result = await restoreExport(data, mode)
      await alertModal({
        title: t('settings.restore'),
        message: t('settings.restored', {
          products: result.products,
          categories: result.categories,
        }),
      })
    } catch {
      toast(t('error.generic'))
    }
  })

  // ---- grahak wala catalog ----
  on(root, 'click', '[data-catalog]', async (_e, el) => {
    const turnOn = el.dataset.catalog === 'on'
    if (turnOn === catalogOn(state.settings)) return

    if (!turnOn) {
      const ok = await confirmModal({
        title: t('settings.catalog'),
        message: t('settings.catalogOffConfirm'),
        confirmLabel: t('settings.catalogOff'),
        danger: true,
      })
      if (!ok) return
    }

    el.disabled = true
    toast(t('settings.catalogWorking'))
    try {
      // Switch pehle likhte hain, warna publishCatalog() ko catalog band lagta.
      await saveSetting('publicCatalog', turnOn)
      if (turnOn) {
        const count = await publishCatalog()
        await alertModal({
          title: t('settings.catalog'),
          message: t('settings.catalogPublished', { count }),
        })
      } else {
        await unpublishCatalog()
        toast(t('common.done'))
      }
    } catch (err) {
      await saveSetting('publicCatalog', !turnOn).catch(() => {})
      toast(err?.code === 'permission-denied' ? t('error.permission') : t('error.generic'))
    } finally {
      rerender()
    }
  })

  on(root, 'click', '[data-republish]', async (_e, el) => {
    el.disabled = true
    try {
      const count = await publishCatalog()
      await alertModal({
        title: t('settings.catalog'),
        message: t('settings.catalogPublished', { count }),
      })
    } catch (err) {
      toast(err?.code === 'permission-denied' ? t('error.permission') : t('error.generic'))
    } finally {
      el.disabled = false
    }
  })

  // ---- account ----
  on(root, 'click', '[data-change-email]', () => openChangeEmailSheet())
  on(root, 'click', '[data-change-password]', () => openChangePasswordSheet())

  // ---- sign out ----
  on(root, 'click', '[data-signout]', async () => {
    try {
      await signOut()
    } catch {
      toast(t('error.generic'))
    }
  })

  // Install ka mauqa aksar screen banne ke BAAD milta hai — us waqt button
  // khud aa jana chahiye, warna dukandar ko sirf hidayat nazar aati rehti hain.
  return onInstallChange(rerender)
}

/**
 * "Ye mera apna phone hai" — login ke khane khud bhare hue aayein.
 *
 * Tanbeeh jaan boojh kar chhoti nahi likhi. Dukandar ko ye faisla samajh kar
 * karna chahiye: is ke chalu hote hi password is phone me mehfooz ho jata hai,
 * aur phone kisi aur ke haath lage to wo andar pahunch sakta hai. Isi liye ye
 * by default band hai.
 */
function trustedSection() {
  const on = isTrusted()

  return section(
    t('settings.trusted'),
    `<div class="card">
       <p class="small muted" style="margin-bottom:12px">${esc(t('settings.trustedDesc'))}</p>
       <div class="choices choices--2" style="margin-bottom:10px">
         <button class="choice${on ? ' choice--active' : ''}" data-trusted="on">
           ${esc(t('settings.catalogOn'))}
         </button>
         <button class="choice${on ? '' : ' choice--active'}" data-trusted="off">
           ${esc(t('settings.catalogOff'))}
         </button>
       </div>
       <p class="field__hint">${esc(t('settings.trustedWarn'))}</p>
     </div>`,
  )
}

/**
 * "App install karein" — home screen par icon.
 *
 * Chaar halatein hain aur teen me koi button hi nahi hota: iPhone par Safari
 * install ka mauqa deta hi nahi (sirf Share menu se hota hai), aur baqi
 * browsers me mauqa aane se pehle sirf tareeqa bataya ja sakta hai. Is liye
 * har soorat me kuch na kuch likha hota hai — khali dabba kabhi nahi.
 */
function installSection() {
  const stateName = installState()

  const body =
    stateName === 'installed'
      ? `<p class="small" style="margin:0">✅ ${esc(t('settings.installDone'))}</p>`
      : stateName === 'ready'
        ? `<p class="small muted" style="margin-bottom:12px">${esc(t('settings.installDesc'))}</p>
           <button class="btn btn--primary btn--full" data-install>
             ⬇️ ${esc(t('settings.installBtn'))}
           </button>`
        : `<p class="small muted" style="margin-bottom:8px">${esc(t('settings.installDesc'))}</p>
           <p class="field__hint">${esc(
             stateName === 'ios' ? t('settings.installIos') : t('settings.installManual'),
           )}</p>`

  return section(t('settings.install'), `<div class="card">${body}</div>`)
}

function bindSetting(root, selector, key, transform) {
  const el = $(selector, root)
  if (!el) return
  el.addEventListener('change', async () => {
    try {
      await saveSetting(key, transform(el.value))
    } catch (err) {
      toast(err?.code === 'permission-denied' ? t('error.permission') : t('error.generic'))
    }
  })
}
