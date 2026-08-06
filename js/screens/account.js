import { esc, openSheet, closeSheet, toast, $ } from '../lib/dom.js'
import { t } from '../i18n/index.js'
import { field, passwordInput, wirePasswordToggles } from '../components.js'
import { changePassword, changeEmail, currentEmail, authErrorKey, verifyPassword } from '../firebase.js'
import { updateSavedPassword, rememberLogin } from '../lib/trusted.js'

/**
 * Email aur password badalne wale sheets.
 *
 * Dono me maujooda password maanga jata hai — Firebase ki shart bhi yehi hai,
 * aur is se koi doosra shakhs khuli hui app par aa kar account apne naam nahi
 * kar sakta.
 */

export function openChangePasswordSheet() {
  const wrap = openSheet(t('account.changePassword'), `
    ${field(
      t('account.currentPassword'),
      passwordInput('ac-current', { autocomplete: 'current-password' }),
      { required: true },
    )}
    ${field(
      t('account.newPassword'),
      passwordInput('ac-new', { autocomplete: 'new-password' }),
      { hint: t('auth.passwordHint'), required: true },
    )}
    ${field(
      t('account.confirmPassword'),
      passwordInput('ac-confirm', { autocomplete: 'new-password' }),
      { required: true },
    )}
    <div id="ac-error"></div>
    <button class="btn btn--primary btn--full" id="ac-save">${esc(t('common.save'))}</button>`)

  const body = wrap.querySelector('.sheet__body')
  wirePasswordToggles(body)
  const save = $('#ac-save', body)
  const errorBox = $('#ac-error', body)

  const fail = (message) => {
    errorBox.innerHTML = `<div class="auth__error">${esc(message)}</div>`
    save.disabled = false
    save.textContent = t('common.save')
  }

  save.addEventListener('click', async () => {
    const current = $('#ac-current', body).value
    const next = $('#ac-new', body).value
    const confirm = $('#ac-confirm', body).value

    errorBox.innerHTML = ''
    if (!current || !next) return fail(t('account.errAllFields'))
    if (next.length < 6) return fail(t('auth.errWeakPassword'))
    if (next !== confirm) return fail(t('account.errPasswordMismatch'))
    if (next === current) return fail(t('account.errSamePassword'))

    save.disabled = true
    save.innerHTML = '<span class="spinner spinner--sm"></span>'

    try {
      await changePassword(current, next)
      // Bharosay wale phone par purana password mehfooz para hoga — naya likh
      // do, warna agli dafa wohi purana khud bhar kar "ghalat password" dega.
      updateSavedPassword(next)
      closeSheet()
      toast(t('account.passwordChanged'))
    } catch (err) {
      fail(t(accountErrorKey(err?.code)))
    }
  })

  $('#ac-current', body).focus()
}

export function openChangeEmailSheet() {
  const wrap = openSheet(t('account.changeEmail'), `
    <p class="small muted" style="margin-bottom:16px">
      ${esc(t('account.currentEmailIs', { email: currentEmail() }))}
    </p>
    ${field(
      t('account.newEmail'),
      `<input id="ae-email" type="email" inputmode="email" dir="ltr"
         autocapitalize="none" spellcheck="false" autocomplete="email">`,
      { required: true },
    )}
    ${field(
      t('account.currentPassword'),
      passwordInput('ae-password', { autocomplete: 'current-password' }),
      { required: true },
    )}
    <div class="card card--warn" style="margin-bottom:16px">
      <p class="small">${esc(t('account.emailChangeNote'))}</p>
    </div>
    <div id="ae-error"></div>
    <button class="btn btn--primary btn--full" id="ae-save">${esc(t('account.sendVerification'))}</button>`)

  const body = wrap.querySelector('.sheet__body')
  wirePasswordToggles(body)
  const save = $('#ae-save', body)
  const errorBox = $('#ae-error', body)

  const fail = (message) => {
    errorBox.innerHTML = `<div class="auth__error">${esc(message)}</div>`
    save.disabled = false
    save.textContent = t('account.sendVerification')
  }

  save.addEventListener('click', async () => {
    const email = $('#ae-email', body).value.trim()
    const password = $('#ae-password', body).value

    errorBox.innerHTML = ''
    if (!email || !password) return fail(t('account.errAllFields'))
    if (email.toLowerCase() === currentEmail().toLowerCase()) {
      return fail(t('account.errSameEmail'))
    }

    save.disabled = true
    save.innerHTML = '<span class="spinner spinner--sm"></span>'

    try {
      await changeEmail(password, email)
      closeSheet()
      toast(t('account.verificationSent', { email }))
    } catch (err) {
      fail(t(accountErrorKey(err?.code)))
    }
  })

  $('#ae-email', body).focus()
}

/** Galat maujooda password sab se aam galti hai — usay saaf batate hain. */
function accountErrorKey(code) {
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/invalid-login-credentials'
  ) {
    return 'account.errWrongCurrentPassword'
  }
  if (code === 'auth/email-already-in-use') return 'account.errEmailTaken'
  if (code === 'auth/requires-recent-login') return 'account.errWrongCurrentPassword'
  return authErrorKey(code)
}

/**
 * "Ye mera apna phone hai" chalu karte waqt password poochta hai.
 *
 * Switch chalu karne se khud ba khud kuch mehfooz nahi ho sakta: us waqt app ke
 * paas password hota hi nahi — Firebase sirf ek token rakhta hai. Is ke baghair
 * dukandar switch chalu karta, sign out karta, aur khane phir bhi khali milte.
 * Ek dafa poochna is ki sab se saaf shakl hai, aur sath hi tasdeeq bhi ho jati
 * hai ke ye wahi shakhs hai.
 */
export function openTrustDeviceSheet(onDone) {
  const wrap = openSheet(t('settings.trusted'), `
    <p class="small muted" style="margin-bottom:16px">${esc(t('settings.trustedAsk'))}</p>
    ${field(
      t('account.currentPassword'),
      passwordInput('td-password', { autocomplete: 'current-password' }),
      { required: true },
    )}
    <div class="card card--warn" style="margin-bottom:16px">
      <p class="small">${esc(t('settings.trustedWarn'))}</p>
    </div>
    <div id="td-error"></div>
    <button class="btn btn--primary btn--full" id="td-save">${esc(t('common.done'))}</button>`)

  const body = wrap.querySelector('.sheet__body')
  wirePasswordToggles(body)
  const save = $('#td-save', body)
  const errorBox = $('#td-error', body)

  const fail = (message) => {
    errorBox.innerHTML = `<div class="auth__error">${esc(message)}</div>`
    save.disabled = false
    save.textContent = t('common.done')
  }

  save.addEventListener('click', async () => {
    const password = $('#td-password', body).value
    errorBox.innerHTML = ''
    if (!password) return fail(t('account.errAllFields'))

    save.disabled = true
    save.innerHTML = '<span class="spinner spinner--sm"></span>'

    try {
      await verifyPassword(password)
      rememberLogin(currentEmail(), password)
      closeSheet()
      toast(t('common.done'))
      onDone?.(true)
    } catch (err) {
      const wrong =
        err?.code === 'auth/invalid-credential' || err?.code === 'auth/wrong-password'
      fail(wrong ? t('account.errWrongCurrentPassword') : t(authErrorKey(err?.code)))
    }
  })
}
