import { esc, $ } from '../lib/dom.js'
import { t } from '../i18n/index.js'
import { field } from '../components.js'
import { navigate } from '../lib/router.js'
import { signIn, signUp, authErrorKey } from '../firebase.js'

/**
 * Login / account banane ka form. Site khulne par ye seedha nazar nahi aata —
 * welcome screen se button daba kar yahan aate hain.
 *
 * Login lagana zaroori hai: Firebase ka web config public hota hai, is liye
 * database ko sirf Firestore rules + login hi mehfooz rakhte hain.
 */
export function renderLogin(root, initialMode = 'signin') {
  let mode = initialMode
  let error = ''
  let busy = false

  function draw() {
    const isSignUp = mode === 'signup'

    root.innerHTML = `
      <div class="auth">
        <button class="auth__back" data-back>
          <span class="flip">←</span> ${esc(t('common.back'))}
        </button>

        <img class="auth__logo" src="assets/icon-192.png" alt="">
        <h1 class="auth__title">${esc(isSignUp ? t('auth.signUp') : t('auth.signIn'))}</h1>
        <p class="auth__sub">${esc(isSignUp ? t('auth.subtitleSignUp') : t('auth.subtitle'))}</p>

        ${error ? `<div class="auth__error">${esc(error)}</div>` : ''}

        <form id="auth-form" novalidate>
          ${field(
            t('auth.email'),
            `<input id="auth-email" type="email" inputmode="email" autocomplete="email"
               autocapitalize="none" spellcheck="false" required dir="ltr">`,
          )}
          ${field(
            t('auth.password'),
            `<input id="auth-password" type="password" dir="ltr"
               autocomplete="${isSignUp ? 'new-password' : 'current-password'}" required>`,
            { hint: isSignUp ? t('auth.passwordHint') : '' },
          )}

          <button type="submit" class="btn btn--primary btn--full" ${busy ? 'disabled' : ''}>
            ${busy ? '<span class="spinner spinner--sm"></span>' : esc(isSignUp ? t('auth.signUp') : t('auth.signIn'))}
          </button>
        </form>

        <button class="auth__switch" id="auth-switch">
          ${esc(isSignUp ? t('auth.toSignIn') : t('auth.toSignUp'))}
        </button>
      </div>`

    $('[data-back]', root).addEventListener('click', () => navigate('/'))

    $('#auth-switch', root).addEventListener('click', () => {
      mode = isSignUp ? 'signin' : 'signup'
      error = ''
      draw()
    })

    $('#auth-form', root).addEventListener('submit', async (e) => {
      e.preventDefault()
      if (busy) return

      const email = $('#auth-email', root).value
      const password = $('#auth-password', root).value

      busy = true
      error = ''
      draw()

      try {
        if (isSignUp) await signUp(email, password)
        else await signIn(email, password)
        // Kamyabi par onAuthStateChanged khud app ko aage le jayega.
      } catch (err) {
        busy = false
        error = t(authErrorKey(err?.code))
        draw()
        $('#auth-email', root).value = email
      }
    })
  }

  draw()
}

/** Config bhari hui na ho to ye screen dikhti hai. */
export function renderSetupNeeded(root) {
  root.innerHTML = `
    <div class="setup">
      <div class="empty__icon">🔧</div>
      <h1 class="empty__title">${esc(t('setup.title'))}</h1>
      <p class="empty__body">${esc(t('setup.body'))}</p>
      <pre>js/config.js

export const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "my-shop.firebaseapp.com",
  projectId: "my-shop",
  storageBucket: "my-shop.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123:web:abc"
}</pre>
      <p class="empty__body" style="margin-top:16px">
        ${esc(t('setup.guide'))}
      </p>
    </div>`
}
