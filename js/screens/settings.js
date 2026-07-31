import { esc, escAttr, on, toast, $ } from '../lib/dom.js'
import { t, getLang, setLang } from '../i18n/index.js'
import { navigate } from '../lib/router.js'
import { state, saveSetting, buildExport } from '../store.js'
import { appBar, field, icon, section } from '../components.js'
import { applyTheme, setTheme, getTheme } from '../lib/theme.js'
import { auth, signOut } from '../firebase.js'

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
             <button class="btn btn--secondary btn--full" data-export>
               💾 ${esc(t('settings.export'))}
             </button>
           </div>`,
        )}

        ${section(
          t('settings.account'),
          `<div class="card">
             <p class="small muted" style="margin-bottom:12px" dir="ltr">
               ${esc(t('auth.signedInAs', { email: auth?.currentUser?.email || '' }))}
             </p>
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
  on(root, 'click', '[data-export]', () => {
    const blob = new Blob([JSON.stringify(buildExport(), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const stamp = new Date().toISOString().slice(0, 10)
    a.download = `karyana-${stamp}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast(t('settings.exported'))
  })

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
