/**
 * Har test ka sanjha bandobast.
 *
 * Ek asli browser (Playwright) me asli app chalti hai, aur us ke peeche Firebase
 * ka emulator — yaani asli Firestore rules aur asli auth, magar asli dukan ka
 * data chhue baghair. Sirf teen cheezein badli jati hain:
 *
 *   1. `js/config.js`   — test project ki config
 *   2. `js/firebase.js` — emulator se jurne ki do lines (baqi file asli hai)
 *   3. Firebase SDK     — sirf agar local copy mojood ho (neeche dekhein)
 *
 * Baqi poori app wahi hai jo dukandar ke phone par chalti hai.
 */
import { chromium } from 'playwright'
import { readFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
export const TESTS = resolve(HERE, '..')
export const APP = resolve(TESTS, '..')
export const BASE = process.env.APP_URL || 'http://localhost:5500'
export const SHOTS = resolve(TESTS, 'shots')

const FIRESTORE = process.env.FIRESTORE_EMULATOR || '127.0.0.1:8080'
const AUTH = process.env.AUTH_EMULATOR || '127.0.0.1:9099'
const PROJECT = 'karyana-test'
const FIREBASE_VERSION = '12.17.0'
const CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`

// -------------------------------------------------------------- nataij

const results = []

export function check(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`)
}

// ------------------------------------------------------------ emulator

/**
 * Har run bilkul saaf emulator par.
 *
 * Warna pichhle run ka data reh jata hai — khaas kar `publicIndex/default` ka
 * claim, jo pehli dukan ke naam ho jata hai aur agle run ki nayi dukan usay le
 * hi nahi sakti. Us se test bay-wajah fail hote hain.
 */
export async function wipeEmulator() {
  await fetch(
    `http://${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`,
    { method: 'DELETE' },
  ).catch(() => {})
  await fetch(`http://${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, {
    method: 'DELETE',
  }).catch(() => {})
}

// ------------------------------------------------------------- browser

const TEST_CONFIG = `
export const firebaseConfig = {
  apiKey: 'fake-api-key',
  authDomain: '${PROJECT}.firebaseapp.com',
  projectId: '${PROJECT}',
  storageBucket: '${PROJECT}.appspot.com',
  messagingSenderId: '000000000000',
  appId: '1:000:web:test',
}
export function isConfigured() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)
}
`

/**
 * Asli `firebase.js` hi chalti hai — bas emulator se jorne ki lines add hoti
 * hain. Ye jaan boojh kar hai: agar test apni alag firebase.js likhte, to wo
 * asli file ki ghaltiyan kabhi na pakarte.
 */
async function emulatorFirebaseJs() {
  const real = await readFile(resolve(APP, 'js/firebase.js'), 'utf8')
  return real
    .replace(
      "import { firebaseConfig, isConfigured } from './config.js'",
      `import { connectAuthEmulator } from '${CDN}/firebase-auth.js'
import { connectFirestoreEmulator } from '${CDN}/firebase-firestore.js'
import { firebaseConfig, isConfigured } from './config.js'`,
    )
    .replace(
      '  return true\n}',
      `  connectAuthEmulator(auth, 'http://${AUTH}', { disableWarnings: true })
  connectFirestoreEmulator(dbf, '${FIRESTORE.split(':')[0]}', ${FIRESTORE.split(':')[1]})
  return true
}`,
    )
}

/**
 * Firebase SDK kahan se aaye.
 *
 * Aam machine par seedha gstatic se — koi rukawat nahi. Magar band network
 * wale mahol me wo nahi milti, is liye agar `tests/vendor/` me local copy
 * mojood ho to wahi parosi jati hai. Ye sirf ek soorat-e-haal ka intezaam hai;
 * app ka code dono soorton me ek hi hai.
 */
async function vendorBundles() {
  const dir = resolve(TESTS, 'vendor')
  const files = ['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js']
  if (!files.every((f) => existsSync(resolve(dir, f)))) return null

  const out = {}
  for (const f of files) out[f] = await readFile(resolve(dir, f), 'utf8')
  return out
}

/** Browser khol kar app ke saamne rakh deta hai. */
export async function launch() {
  await mkdir(SHOTS, { recursive: true })
  await wipeEmulator()

  const browser = await chromium.launch(
    // Band mahol me Playwright ka apna download nahi hota; wahan raasta
    // environment se aata hai.
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  )

  const vendor = await vendorBundles()
  const firebaseJs = await emulatorFirebaseJs()

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    serviceWorkers: 'allow',
  })

  await installRoutes(context, vendor, firebaseJs)

  const page = await context.newPage()
  const errors = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${m.text()} @ ${m.location()?.url || ''}`)
  })
  page.on('pageerror', (e) => errors.push(String(e)))

  return {
    browser,
    context,
    page,
    errors,
    /** Screen ka poora likha hua text. */
    text: () => page.locator('body').innerText(),
    /** Page ke andar chal kar store/Firestore se seedha padhna. */
    readStore: (fn) => page.evaluate(fn),
    shot: (n) => page.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true }),
    /** Naya browser context (doosra phone / bina login wala visitor). */
    newContext: async (opts = {}) => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ...opts })
      await installRoutes(ctx, vendor, firebaseJs)
      return ctx
    },
  }
}

async function installRoutes(ctx, vendor, firebaseJs) {
  if (vendor) {
    await ctx.route('**/www.gstatic.com/firebasejs/**', (route) => {
      const url = route.request().url()
      const key = url.includes('firebase-app')
        ? 'firebase-app.js'
        : url.includes('firebase-auth')
          ? 'firebase-auth.js'
          : 'firebase-firestore.js'
      route.fulfill({ status: 200, contentType: 'text/javascript', body: vendor[key] })
    })
  }
  await ctx.route('**/js/config.js', (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: TEST_CONFIG }),
  )
  await ctx.route('**/js/firebase.js', (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: firebaseJs }),
  )
}

// ----------------------------------------------------------- aam kaam

/** Naya account bana kar dukan ke andar. */
export async function signUp(page, prefix = 'shop') {
  const email = `${prefix}${Date.now()}@test.pk`
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  await page.locator('button:has-text("Create new account")').click()
  await page.waitForTimeout(600)
  await page.locator('#auth-email').fill(email)
  await page.locator('#auth-password').fill('karyana123')
  await page.locator('button[type=submit]').click()
  await page.waitForTimeout(5000)
  return email
}

/**
 * Console ki wo ghaltiyan jo waqai ghaltiyan hain.
 *
 * Favicon, offline test ka network error wagera shor hai — un par test fail
 * karna sirf jhooti ghabrahat paida karta hai.
 */
export function realErrors(errors) {
  return errors.filter(
    (e) =>
      !e.includes('favicon') &&
      !e.includes('Failed to load resource') &&
      !e.includes('ERR_INTERNET_DISCONNECTED') &&
      !e.includes('ERR_NETWORK_CHANGED') &&
      !e.toLowerCase().includes('quota'),
  )
}

/** Ginti likh kar sahi exit code ke saath khatam. */
export async function finish(browser) {
  if (browser) await browser.close().catch(() => {})

  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length) {
    console.log('FAILED:')
    for (const f of failed) console.log(`  - ${f.name} ${f.detail}`)
  }
  process.exit(failed.length ? 1 : 0)
}
