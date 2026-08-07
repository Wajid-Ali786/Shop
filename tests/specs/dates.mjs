/**
 * Lein dein ki tareekh dukandar chunta hai — sham ko bahi khol kar din bhar ka
 * likhna aam baat hai — aur tareekh badalne par poora hisaab dobara banta hai.
 */
import { launch, check, finish, signUp, BASE, realErrors } from '../lib/harness.mjs'

const h = await launch()
const { page, browser, errors } = h
const { text, readStore } = h

await signUp(page, 'dt')

await page.goto(`${BASE}/#/khata/new`)
await page.waitForTimeout(1200)
await page.locator('#kf-name').fill('Date Test')
await page.locator('[data-save]').click()
await page.waitForTimeout(3000)
await page.goto(`${BASE}/#/khata`)
await page.waitForTimeout(2000)
await page.locator('[data-party]').first().click()
await page.waitForTimeout(1500)

await page.locator('[data-entry="udhaar"]').click()
await page.waitForTimeout(700)
check('The entry sheet offers a date', (await page.locator('#ke-when').count()) === 1)
await page.locator('#ke-amount').fill('300')
await page.locator('#ke-when').fill('2026-08-01T10:30')
await page.locator('#ke-save').click()
await page.waitForTimeout(3500)

const saved = await readStore(async () => {
  const fb = await import('/js/firebase.js')
  const { getFirestore, collection, getDocs } = await import(
    'https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js'
  )
  const db = getFirestore()
  const snap = await getDocs(collection(db, 'shops', fb.currentUid(), 'khataEntries'))
  return snap.docs[0]?.data()?.createdAt?.toMillis?.() ?? null
})
const wanted = new Date('2026-08-01T10:30').getTime()
check(
  'It saves the date the shopkeeper picked, not today',
  saved === wanted,
  `${new Date(saved).toISOString()} vs ${new Date(wanted).toISOString()}`,
)
check('And the history shows that date', (await text()).includes('1 Aug'))

// Aaj ki ek aur entry — nayi upar aani chahiye.
await page.locator('[data-entry="udhaar"]').click()
await page.waitForTimeout(700)
await page.locator('#ke-amount').fill('100')
await page.locator('#ke-save').click()
await page.waitForTimeout(3500)
const order = await page.locator('.tx__amount').allInnerTexts()
check('Newest sits on top', order[0].includes('100'), order.join(' | '))

// Tareekh badalne par tarteeb badalti hai — zanjeer dobara banni chahiye.
await page.locator('.tx').last().click()
await page.waitForTimeout(700)
await page.locator('#td-edit').click()
await page.waitForTimeout(700)
await page.locator('#ke-when').fill('2026-08-05T09:00')
await page.locator('#ke-save').click()
await page.waitForTimeout(4000)

const chain = await readStore(async () => {
  const m = await import('/js/store.js')
  const fb = await import('/js/firebase.js')
  const { getFirestore, collection, getDocs } = await import(
    'https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js'
  )
  const db = getFirestore()
  const snap = await getDocs(collection(db, 'shops', fb.currentUid(), 'khataEntries'))
  const rows = snap.docs
    .map((d) => d.data())
    .sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0))
  let run = 0
  for (const r of rows) {
    run = Math.round((run + m.khataSign(r.kind) * r.amount) * 100) / 100
    if (Math.abs((r.balanceAfter ?? 0) - run) > 0.001) return `MISMATCH at ${r.amount}`
  }
  return `ok, ends ${run}, first ${rows[0].amount}`
})
check('Changing a date rebuilds the running balance in the new order', chain.startsWith('ok'), chain)

const real = realErrors(errors)
check('No unexpected console errors', real.length === 0, real.slice(0, 2).join(' | '))

await finish(browser)
