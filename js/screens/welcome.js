import { esc, on } from '../lib/dom.js'
import { t, getLang, setLang } from '../i18n/index.js'
import { navigate } from '../lib/router.js'

/**
 * Site khulne par sab se pehle yehi screen aati hai — seedha login form nahi.
 * Login yahan se ek button dabane par khulta hai.
 *
 * Ek baar sign in ho jane ke baad ye screen nahi aati: Firebase login yaad
 * rakhta hai, is liye app seedha dashboard par khul jati hai.
 */
export function renderWelcome(root) {
  // Shop ka naam Firestore me hai (login ke bagair nahi milta), is liye
  // login ke waqt local copy rakh lete hain — taake wapas aane wale ko
  // apni dukan ka naam nazar aaye, "Karyana Shop" nahi.
  const savedShopName = localStorage.getItem('karyana.shopName') || ''

  root.innerHTML = `
    <div class="welcome">
      <div class="welcome__lang">
        <button class="welcome__langbtn${getLang() === 'en' ? ' welcome__langbtn--on' : ''}"
          data-lang="en">English</button>
        <button class="welcome__langbtn${getLang() === 'ur' ? ' welcome__langbtn--on' : ''}"
          data-lang="ur">اردو</button>
      </div>

      <div class="welcome__body">
        <img class="welcome__logo" src="assets/icon-192.png" alt="">
        <h1 class="welcome__title" dir="auto">${esc(savedShopName || t('welcome.title'))}</h1>
        <p class="welcome__tagline">${esc(t('welcome.tagline'))}</p>

        <ul class="welcome__points">
          <li><span>🔍</span><span>${esc(t('welcome.pointSearch'))}</span></li>
          <li><span>📦</span><span>${esc(t('welcome.pointStock'))}</span></li>
          <li><span>📶</span><span>${esc(t('welcome.pointOffline'))}</span></li>
        </ul>
      </div>

      <div class="welcome__actions">
        <button class="btn btn--primary btn--full" data-go="/login">
          ${esc(t('welcome.login'))}
        </button>
        <button class="btn btn--secondary btn--full" data-go="/signup">
          ${esc(t('welcome.createAccount'))}
        </button>
      </div>
    </div>`

  on(root, 'click', '[data-lang]', (_e, el) => setLang(el.dataset.lang))
  on(root, 'click', '[data-go]', (_e, el) => navigate(el.dataset.go))
}
