import { esc, openSheet, closeSheet, toast, $ } from '../lib/dom.js'
import { t } from '../i18n/index.js'
import { field } from '../components.js'
import { changePassword, changeEmail, currentEmail, authErrorKey } from '../firebase.js'

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
      `<input id="ac-current" type="password" dir="ltr" autocomplete="current-password">`,
      { required: true },
    )}
    ${field(
      t('account.newPassword'),
      `<input id="ac-new" type="password" dir="ltr" autocomplete="new-password">`,
      { hint: t('auth.passwordHint'), required: true },
    )}
    ${field(
      t('account.confirmPassword'),
      `<input id="ac-confirm" type="password" dir="ltr" autocomplete="new-password">`,
      { required: true },
    )}
    <div id="ac-error"></div>
    <button class="btn btn--primary btn--full" id="ac-save">${esc(t('common.save'))}</button>`)

  const body = wrap.querySelector('.sheet__body')
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
      `<input id="ae-password" type="password" dir="ltr" autocomplete="current-password">`,
      { required: true },
    )}
    <div class="card card--warn" style="margin-bottom:16px">
      <p class="small">${esc(t('account.emailChangeNote'))}</p>
    </div>
    <div id="ae-error"></div>
    <button class="btn btn--primary btn--full" id="ae-save">${esc(t('account.sendVerification'))}</button>`)

  const body = wrap.querySelector('.sheet__body')
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
