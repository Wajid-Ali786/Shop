/**
 * Jama pare paison se udhaar chukana.
 *
 * Ye ek button hai magar hisaab do jagah badalta hai. Sab se ahem baat jo ye
 * test dekhta hai: dono zanjeeron ka `balanceAfter` sach rehta hai — kyunki
 * jhoota `balanceAfter` wo ghalti hai jo mahinon baad pakri jati hai, jab
 * theek karna na-mumkin ho chuka hota hai.
 */
import { launch, check, finish, signUp, BASE, realErrors } from '../lib/harness.mjs'

const h = await launch()
const { page, browser, errors } = h
const { text, readStore } = h

await signUp(page, 'settle')

// Jama wala khata banao.
await page.goto(`${BASE}/#/khata/new`)
await page.waitForTimeout(1200)
await page.locator('#kf-name').fill('Settle Test')
await page.locator('[data-dep="on"]').click()
await page.locator('[data-save]').click()
await page.waitForTimeout(3000)

await page.goto(`${BASE}/#/khata`)
await page.waitForTimeout(2000)
await page.locator('[data-party]').first().click()
await page.waitForTimeout(1500)

// Sirf jama — abhi chukane ko kuch nahi.
await page.locator('[data-entry="jama"]').click()
await page.waitForTimeout(700)
await page.locator('#ke-amount').fill('5000')
await page.locator('#ke-save').click()
await page.waitForTimeout(3500)
check(
  'With nothing owed, there is nothing to settle',
  (await page.locator('[data-settle]').count()) === 0,
)

// Ab udhaar bhi.
await page.locator('[data-entry="udhaar"]').click()
await page.waitForTimeout(700)
await page.locator('#ke-amount').fill('1200')
await page.locator('#ke-save').click()
await page.waitForTimeout(3500)

check('Once both are running, the button appears', (await page.locator('[data-settle]').count()) === 1)
check('It offers the smaller of the two', (await text()).includes('1,200'))
await h.shot('settle-offer')

// Chalao.
await page.locator('[data-settle]').click()
await page.waitForTimeout(1200)
check('It asks before writing two entries', (await text()).includes('Settle'))
await page.locator('.modal button').filter({ hasText: 'Settle' }).last().click()
await page.waitForTimeout(4500)

const after = await readStore(async () => {
  const m = await import('/js/store.js')
  const p = m.state.khataParties.find((x) => x.name === 'Settle Test')
  return { balance: p?.balance, deposit: p?.deposit }
})
check('The udhaar is cleared', after.balance === 0, `udhaar Rs ${after.balance}`)
check('And the same amount left the deposit', after.deposit === 3800, `jama Rs ${after.deposit}`)

// Dono zanjeerein alag alag sahi honi chahiye.
const chain = await readStore(async () => {
  const m = await import('/js/store.js')
  const p = m.state.khataParties.find((x) => x.name === 'Settle Test')
  const rows = await new Promise((done) => {
    const stop = m.watchKhataEntries(p.id, (r) => {
      stop()
      done(r)
    })
  })
  const running = { balance: 0, deposit: 0 }
  let bad = 0
  for (const row of [...rows].reverse()) {
    const kind = m.khataKindOf(row)
    const f = m.khataField(kind)
    running[f] = Math.round((running[f] + m.khataSign(kind) * Number(row.amount || 0)) * 100) / 100
    if (row.balanceAfter !== running[f]) bad++
  }
  return { bad, count: rows.length, ...running }
})
check(
  'Every row still agrees with its own running balance',
  chain.bad === 0 && chain.count === 4,
  `${chain.count} entries, ${chain.bad} wrong, udhaar ${chain.balance}, jama ${chain.deposit}`,
)

check('Nothing is left to settle now', (await page.locator('[data-settle]').count()) === 0)

// Jo note history me likha jata hai wo app ki apni zaban ka ho — store ki
// nahi. Angrezi UI me Roman Urdu ka note dukandar ke liye ajnabi hai.
const note = await readStore(async () => {
  const m = await import('/js/store.js')
  const p = m.state.khataParties.find((x) => x.name === 'Settle Test')
  const rows = await new Promise((done) => {
    const stop = m.watchKhataEntries(p.id, (r) => {
      stop()
      done(r)
    })
  })
  return rows[0]?.note
})
check('The note it writes follows the app language', note === 'Settled from deposit', `"${note}"`)

// Jama kam ho to sirf utna hi chukta hai jitna mojood hai.
await page.locator('[data-entry="udhaar"]').click()
await page.waitForTimeout(700)
await page.locator('#ke-amount').fill('9000')
await page.locator('#ke-save').click()
await page.waitForTimeout(3500)
check('When the deposit is smaller, only that much is offered', (await text()).includes('3,800'))

await page.locator('[data-settle]').click()
await page.waitForTimeout(1200)
await page.locator('.modal button').filter({ hasText: 'Settle' }).last().click()
await page.waitForTimeout(4500)

const partial = await readStore(async () => {
  const m = await import('/js/store.js')
  const p = m.state.khataParties.find((x) => x.name === 'Settle Test')
  return { balance: p?.balance, deposit: p?.deposit }
})
check(
  'The deposit never goes below zero',
  partial.deposit === 0 && partial.balance === 5200,
  `udhaar Rs ${partial.balance}, jama Rs ${partial.deposit}`,
)

// Bina jama wale khate par ye button hona hi nahi chahiye.
await page.goto(`${BASE}/#/khata/new`)
await page.waitForTimeout(1200)
await page.locator('#kf-name').fill('Plain Khata')
await page.locator('[data-save]').click()
await page.waitForTimeout(3000)
await page.goto(`${BASE}/#/khata`)
await page.waitForTimeout(2000)
await page.locator('[data-party]').filter({ hasText: 'Plain Khata' }).first().click()
await page.waitForTimeout(1500)
await page.locator('[data-entry="udhaar"]').click()
await page.waitForTimeout(700)
await page.locator('#ke-amount').fill('500')
await page.locator('#ke-save').click()
await page.waitForTimeout(3500)
check(
  'A khata with no deposit never shows it',
  (await page.locator('[data-settle]').count()) === 0,
)

const real = realErrors(errors)
check('No unexpected console errors', real.length === 0, real.slice(0, 2).join(' | '))

await finish(browser)
