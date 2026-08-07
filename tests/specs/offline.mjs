/**
 * Internet band ho to bhi kaam ruke nahi — aur signal aate hi sab server par
 * pahunch jaye.
 *
 * Ye dukan ki rozana ki soorat-e-haal hai, koi anokhi baat nahi.
 */
import { launch, check, finish, signUp, BASE, realErrors } from '../lib/harness.mjs'

const h = await launch()
const { page, context, browser, errors } = h
const { readStore } = h

await signUp(page, 'off')

await context.setOffline(true)

// ---- naya product ----
await page.goto(`${BASE}/#/product/new`)
await page.waitForTimeout(1200)
await page.locator('#f-nameEn').fill('Offline Product')
await page.locator('#f-salePrice').fill('99')
await page.locator('#f-stockQty').fill('4')
await page.locator('[data-save]').click()
await page.waitForTimeout(4000)

check(
  'Saving a new product offline does not hang',
  (await page.locator('[data-save]').count()) === 0,
)
const p = await readStore(async () => {
  const m = await import('/js/store.js')
  const x = m.state.products.find((y) => y.nameEn === 'Offline Product')
  return x ? { stock: x.stockQty, price: x.salePrice } : null
})
check('And the product is there with its stock', p?.stock === 4 && p?.price === 99, JSON.stringify(p))

// ---- naya khata ----
await page.goto(`${BASE}/#/khata/new`)
await page.waitForTimeout(1200)
await page.locator('#kf-name').fill('Offline Khata')
await page.locator('[data-save]').click()
await page.waitForTimeout(4000)
check('Saving a new khata offline does not hang', (await page.locator('[data-save]').count()) === 0)
const k = await readStore(async () => {
  const m = await import('/js/store.js')
  return m.state.khataParties.some((x) => x.name === 'Offline Khata')
})
check('And the khata is there', k === true)

// ---- signal wapas ----
await context.setOffline(false)
await page.waitForTimeout(6000)
const synced = await readStore(async () => {
  const fb = await import('/js/firebase.js')
  const { getFirestore, collection, getDocs, query, where } = await import(
    'https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js'
  )
  const db = getFirestore()
  const uid = fb.currentUid()
  const prod = await getDocs(
    query(collection(db, 'shops', uid, 'products'), where('nameEn', '==', 'Offline Product')),
  )
  const kh = await getDocs(
    query(collection(db, 'shops', uid, 'khataParties'), where('name', '==', 'Offline Khata')),
  )
  return `${prod.size} product, ${kh.size} khata`
})
check(
  'Everything reaches the server once the signal returns',
  synced === '1 product, 1 khata',
  synced,
)

const real = realErrors(errors)
check('No unexpected console errors', real.length === 0, real.slice(0, 2).join(' | '))

await finish(browser)
