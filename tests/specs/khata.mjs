/**
 * Udhaar khata: chaar qismein, jama ka apna alag hisaab, tafseel ka sheet,
 * entry badalna/mitana, aur ye ke grahak wali list tak kuch nahi pahunchta.
 */
import { launch, check, finish, signUp, BASE, realErrors } from '../lib/harness.mjs'

const h = await launch()
const { page, browser, errors } = h
const { text, readStore } = h

await signUp(page, 'khata')

// Ek product — khata ki entry me "kya le kar gaya" ke liye.
await page.goto(`${BASE}/#/product/new`)
await page.waitForTimeout(1200)
await page.locator('#f-nameEn').fill('Basmati Rice')
await page.locator('#f-salePrice').fill('250')
await page.locator('#f-stockQty').fill('10')
await page.locator('[data-save]').click()
await page.waitForTimeout(3000)

// ------------------------------------------------------------- khata list
await page.goto(`${BASE}/#/khata`)
await page.waitForTimeout(2000)
check('Khata tab opens', (await text()).includes('Money out on credit'))
check(
  'Khata has its own categories, not the product ones',
  (await text()).includes('Small') && !(await text()).includes('Grains'),
)

await page.locator('[data-add-party]').first().click()
await page.waitForTimeout(900)
await page.locator('#kf-name').fill('Ali Bhai')
await page.locator('#kf-phone').fill('03001234567')
await page.locator('.catchip').first().click()
await page.waitForTimeout(300)
check(
  'The khata form keeps what was typed after picking a category',
  (await page.locator('#kf-name').inputValue()) === 'Ali Bhai',
)
await page.locator('[data-dep="on"]').click()
await page.waitForTimeout(300)
await page.locator('[data-save]').click()
await page.waitForTimeout(3000)

await page.goto(`${BASE}/#/khata`)
await page.waitForTimeout(2000)
check('New khata shows in the list', (await text()).includes('Ali Bhai'))

await page.locator('[data-party]').first().click()
await page.waitForTimeout(1500)
check('A deposit customer gets all four kinds', (await page.locator('[data-entry]').count()) === 4)

// ------------------------------------------------------- udhaar diya
await page.locator('[data-entry="udhaar"]').click()
await page.waitForTimeout(700)
await page.locator('#ke-amount').fill('450')
await page.locator('#ke-item').fill('Basmati')
await page.waitForTimeout(800)
const suggested = await page.locator('.tagchip[data-pick]').count()
check('Shop products are suggested as items', suggested > 0, `${suggested} suggested`)
await page.locator('.tagchip[data-pick]').first().click()
await page.waitForTimeout(300)
await page.locator('#ke-item').fill('cheeni aadha kilo')
await page.locator('#ke-by').fill('beta')
await page.locator('#ke-save').click()
await page.waitForTimeout(3000)

const afterUdhaar = await readStore(async () => {
  const m = await import('/js/store.js')
  return m.state.khataParties.find((x) => x.name === 'Ali Bhai')?.balance
})
check('Credit raises the balance', afterUdhaar === 450, `Rs ${afterUdhaar}`)

const firstRow = (await page.locator('.tx').first().innerText()).trim()
check(
  'The row shows what they took, not the transaction type',
  firstRow.includes('cheeni aadha kilo') && !firstRow.includes('Gave on credit'),
  JSON.stringify(firstRow),
)
check('Free-typed items are kept alongside picked products', firstRow.includes('Basmati Rice'))
check(
  'Amounts are coloured, not signed',
  (await page.locator('.tx__amount--out').count()) > 0 && !firstRow.includes('+'),
)

// Product chunne se stock NAHI badalna chahiye — ye jaan boojh kar hai.
const stock = await readStore(async () => {
  const m = await import('/js/store.js')
  return m.state.products.find((x) => x.nameEn === 'Basmati Rice')?.stockQty
})
check('Picking a product does NOT change stock', stock === 10, `stock ${stock}`)

// "Kaun aaya tha lene" row par nahi, tafseel me hota hai — is liye yahin dekh
// lete hain jab ye akeli entry hai.
await page.locator('.tx').first().click()
await page.waitForTimeout(800)
check('Who came to collect shows in the detail', (await text()).includes('beta'))
await page.locator('[data-sheet-close]').click()
await page.waitForTimeout(500)

// ------------------------------------------------------------- jama
await page.locator('[data-entry="jama"]').click()
await page.waitForTimeout(700)
await page.locator('#ke-amount').fill('1000')
await page.locator('#ke-save').click()
await page.waitForTimeout(3000)

const afterJama = await readStore(async () => {
  const m = await import('/js/store.js')
  const p = m.state.khataParties.find((x) => x.name === 'Ali Bhai')
  return { balance: p?.balance, deposit: p?.deposit }
})
check(
  'A deposit does NOT touch the udhaar balance',
  afterJama.balance === 450,
  `udhaar Rs ${afterJama.balance}`,
)
check('It lands in its own deposit balance', afterJama.deposit === 1000, `jama Rs ${afterJama.deposit}`)
check('Both balances show side by side', (await page.locator('.balcards .card').count()) === 2)
check(
  'A deposit is green — the cash came into the shop',
  (await page.locator('.tx').first().locator('.tx__amount--in').count()) === 1,
)
await h.shot('khata-party')

// ------------------------------------------------------ tafseel + tabdeeli
await page.locator('.tx').first().click()
await page.waitForTimeout(800)
const detail = await text()
check(
  'Tapping a row opens the full detail',
  (detail.includes('Deposit after') || detail.includes('Balance after')) &&
    (await page.locator('#td-edit').count()) === 1 &&
    (await page.locator('#td-del').count()) === 1,
)

await page.locator('#td-edit').click()
await page.waitForTimeout(800)
await page.locator('#ke-amount').fill('700')
await page.locator('#ke-save').click()
await page.waitForTimeout(3500)

const afterEdit = await readStore(async () => {
  const m = await import('/js/store.js')
  const p = m.state.khataParties.find((x) => x.name === 'Ali Bhai')
  return { balance: p?.balance, deposit: p?.deposit }
})
check(
  'Editing a transaction rebuilds the right balance',
  afterEdit.deposit === 700 && afterEdit.balance === 450,
  `udhaar ${afterEdit.balance}, jama ${afterEdit.deposit}`,
)

// Har row ka `balanceAfter` bhi dobara banna chahiye, warna history jhoot bolti hai.
const chain = await readStore(async () => {
  const m = await import('/js/store.js')
  const fb = await import('/js/firebase.js')
  const { getFirestore, collection, getDocs, query, where } = await import(
    'https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js'
  )
  const db = getFirestore()
  const party = m.state.khataParties.find((x) => x.name === 'Ali Bhai')
  const snap = await getDocs(
    query(
      collection(db, 'shops', fb.currentUid(), 'khataEntries'),
      where('partyId', '==', party.id),
    ),
  )
  const rows = snap.docs
    .map((d) => d.data())
    .sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0))
  const run = { balance: 0, deposit: 0 }
  for (const r of rows) {
    const f = m.khataField(r.kind)
    run[f] = Math.round((run[f] + m.khataSign(r.kind) * r.amount) * 100) / 100
    if (Math.abs((r.balanceAfter ?? 0) - run[f]) > 0.001) return `MISMATCH at ${r.amount}`
  }
  return `ok, ${rows.length} entries, udhaar ${run.balance}, jama ${run.deposit}`
})
check('Every row agrees with the running balance', chain.startsWith('ok'), chain)

// Row jagah se nahi, raqam se chunte hain — tarteeb badal sakti hai.
await page.locator('.tx').filter({ hasText: '700' }).first().click()
await page.waitForTimeout(800)
await page.locator('#td-del').click()
await page.waitForTimeout(700)
await page.locator('.modal button').filter({ hasText: 'Delete' }).last().click()
await page.waitForTimeout(3500)
const afterDel = await readStore(async () => {
  const m = await import('/js/store.js')
  const p = m.state.khataParties.find((x) => x.name === 'Ali Bhai')
  return { balance: p?.balance, deposit: p?.deposit }
})
check(
  'Deleting a transaction rebuilds the balances too',
  afterDel.deposit === 0 && afterDel.balance === 450,
  `udhaar ${afterDel.balance}, jama ${afterDel.deposit}`,
)

// ------------------------------------------------- sirf jama karane wala
await page.goto(`${BASE}/#/khata/new`)
await page.waitForTimeout(1200)
await page.locator('#kf-name').fill('Jama Only')
await page.locator('[data-dep="on"]').click()
await page.waitForTimeout(300)
await page.locator('[data-save]').click()
await page.waitForTimeout(3000)
await page.goto(`${BASE}/#/khata`)
await page.waitForTimeout(1800)
await page.locator('[data-party]').filter({ hasText: 'Jama Only' }).first().click()
await page.waitForTimeout(1500)
await page.locator('[data-entry="jama"]').click()
await page.waitForTimeout(700)
await page.locator('#ke-amount').fill('5000')
await page.locator('#ke-save').click()
await page.waitForTimeout(3000)

await page.goto(`${BASE}/#/khata`)
await page.waitForTimeout(2000)
check(
  'A deposit-only khata still shows in the daily list',
  (await text()).includes('Jama Only'),
)
check('The shop total counts it as money held, not money owed', (await text()).includes('deposited'))

// ------------------------------------------------------- multi-select
check('The list offers a select mode', (await page.locator('[data-select-mode]').count()) === 1)
await page.locator('[data-select-mode]').click()
await page.waitForTimeout(600)
await page.locator('[data-party]').first().click()
await page.waitForTimeout(600)
check('Tapping in select mode picks instead of opening', (await text()).includes('1 selected'))
await page.locator('[data-select-delete]').click()
await page.waitForTimeout(800)
await page.locator('.modal button').filter({ hasText: 'Delete' }).last().click()
await page.waitForTimeout(3500)
const left = await readStore(async () => {
  const m = await import('/js/store.js')
  return m.state.khataParties.length
})
check('Selected khatay are deleted together', left === 1, `${left} left`)

// ------------------------------------------------------------ hifazat
const leak = await readStore(async () => {
  const { getFirestore, collection, getDocs } = await import(
    'https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js'
  )
  const fb = await import('/js/firebase.js')
  const db = getFirestore()
  const out = []
  for (const c of ['khataParties', 'khataEntries', 'khataCategories']) {
    try {
      const snap = await getDocs(collection(db, 'publicShops', fb.currentUid(), c))
      out.push(`${c}:${snap.size}`)
    } catch {
      out.push(`${c}:blocked`)
    }
  }
  return out.join(' ')
})
check('Udhaar never reaches the public catalog', !/:[1-9]/.test(leak), leak)

const real = realErrors(errors)
check('No unexpected console errors', real.length === 0, real.slice(0, 2).join(' | '))

await finish(browser)
