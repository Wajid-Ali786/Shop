import { esc, escAttr, on, toast, $ } from '../lib/dom.js'
import { t, getLang, setLang } from '../i18n/index.js'
import { navigate } from '../lib/router.js'
import { state, saveSetting, buildExport, restoreExport, isValidExport } from '../store.js'
import { appBar, field, icon, section } from '../components.js'
import { applyTheme, setTheme, getTheme } from '../lib/theme.js'
import { currentEmail, signOut } from '../firebase.js'
import { openChangeEmailSheet, openChangePasswordSheet } from './account.js'
import { chooseModal, alertModal } from '../lib/modal.js'

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
           </div>`,
        )}

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

  // ---- export ----
  on(root, 'click', '[data-export]', async (_e, el) => {
    el.disabled = true
    try {
      // Tasveerein aur poori movements server se aati hain, is liye await.
      const data = await buildExport()
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const stamp = new Date().toISOString().slice(0, 10)
      a.download = `karyana-${stamp}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)

      // Backup ki tareekh yaad rakhte hain — isi se yaad-dihani band hoti hai.
      // File banne ke BAAD likhi jati hai, warna nakam export bhi "ho gaya"
      // gina jata.
      await saveSetting('lastBackupAt', Date.now())
      toast(t('settings.exported'))
    } catch {
      toast(t('error.generic'))
    } finally {
      el.disabled = false
    }
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
      await alertModal({ title: t('settings.restore'), message: t('settings.restoreInvalid') })
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
