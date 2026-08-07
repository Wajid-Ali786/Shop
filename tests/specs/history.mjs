/**
 * Purani stock history saaf karna — aur us se stock ki maujooda ginti ka
 * BILKUL na badalna, jo is feature ka sab se ahem waada hai.
 */
import { launch, check, finish, signUp, BASE, realErrors } from '../lib/harness.mjs'

const h = await launch()
const { page, browser, errors } = h
const { text, readStore } = h

await signUp(page, 'hist')

await page.goto(`${BASE}/#/product/new`)
await page.waitForTimeout(1200)
await page.locator('#f-nameEn').fill('Hist Product')
await page.locator('#f-salePrice').fill('50')
await page.locator('#f-stockQty').fill('20')
await page.locator('[data-save]').click()
await page.waitForTimeout(3000)

// Purani aur nayi movements seedha Firestore me — saal bhar intezar nahi kar sakte.
const seeded = await readStore(async () => {
  const m = await import('/js/store.js')
  const fb = await import('/js/firebase.js')
  const { getFirestore, collection, doc, writeBatch, Timestamp } = await import(
    'https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js'
  )
  const db = getFirestore()
  const col = collection(db, 'shops', fb.currentUid(), 'movements')
  const pid = m.state.products[0].id
  const old = Date.now() - 400 * 24 * 60 * 60 * 1000

  let batch = writeBatch(db)
  for (let i = 0; i < 60; i++) {
    batch.set(doc(col), {
      productId: pid, type: 'out', qty: 1, reason: 'sold', balanceAfter: 20,
      createdAt: Timestamp.fromMillis(old + i * 1000),
    })
  }
  await batch.commit()

  batch = writeBatch(db)
  for (let i = 0; i < 45; i++) {
    batch.set(doc(col), {
      productId: pid, type: 'out', qty: 1, reason: 'sold', balanceAfter: 20,
      createdAt: Timestamp.fromMillis(Date.now() - i * 1000),
    })
  }
  await batch.commit()
  return 'ok'
})
check('Seeded 60 old and 45 recent entries', seeded === 'ok')
await page.waitForTimeout(3000)

await page.goto(`${BASE}/#/`)
await page.waitForTimeout(3000)
check('The home screen asks about old history', (await text()).includes('Stock history is piling up'))
await h.shot('history-card')

const stockBefore = await readStore(async () => {
  const m = await import('/js/store.js')
  return m.state.products[0].stockQty
})

await page.locator('[data-history-clean]').click()
await page.waitForTimeout(2500)
await page.locator('.modal button').filter({ hasText: 'Delete' }).last().click()
await page.waitForTimeout(4000)

const after = await readStore(async () => {
  const m = await import('/js/store.js')
  const fb = await import('/js/firebase.js')
  const { getFirestore, collection, getDocs } = await import(
    'https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js'
  )
  const db = getFirestore()
  const snap = await getDocs(collection(db, 'shops', fb.currentUid(), 'movements'))
  return { left: snap.size, stock: m.state.products[0].stockQty }
})
check('Old entries are gone, recent ones stay', after.left === 46, `${after.left} left`)
check('Stock count is untouched', after.stock === stockBefore, `${stockBefore} → ${after.stock}`)

await page.goto(`${BASE}/#/`)
await page.waitForTimeout(2500)
check('And the reminder goes quiet', !(await text()).includes('Stock history is piling up'))

const real = realErrors(errors)
check('No unexpected console errors', real.length === 0, real.slice(0, 2).join(' | '))

await finish(browser)
