/**
 * Udhaar ki hadd — is grahak ka "credit score".
 *
 * Ye ROKTI nahi, batati hai. Aakhri faisla dukandar ka hai: wo grahak ko
 * jaanta hai, app nahi. Rokne se wo app chhor kar kaghaz par likhne lagta,
 * aur phir hisaab do jagah bat jata — jo is se kahin bura hai.
 */
import { launch, check, finish, signUp, BASE, realErrors } from '../lib/harness.mjs'

const h = await launch()
const { page, browser, errors } = h
const { text, readStore } = h

await signUp(page, 'limit')

// Hadd ke saath naya khata.
await page.goto(`${BASE}/#/khata/new`)
await page.waitForTimeout(1200)
check('The khata form asks for a credit limit', (await page.locator('#kf-limit').count()) === 1)
await page.locator('#kf-name').fill('Limit Test')
await page.locator('#kf-limit').fill('1000')
await page.locator('[data-save]').click()
await page.waitForTimeout(3000)

const saved = await readStore(async () => {
  const m = await import('/js/store.js')
  return m.state.khataParties.find((x) => x.name === 'Limit Test')?.creditLimit
})
check('The limit is saved', saved === 1000, `Rs ${saved}`)

await page.goto(`${BASE}/#/khata`)
await page.waitForTimeout(2000)
await page.locator('[data-party]').first().click()
await page.waitForTimeout(1500)
check('The party screen shows what is left', (await text()).includes('credit left'))

// Hadd ke andar — koi tanbeeh nahi.
await page.locator('[data-entry="udhaar"]').click()
await page.waitForTimeout(700)
await page.locator('#ke-amount').fill('400')
await page.waitForTimeout(600)
check('Inside the limit there is no warning', (await page.locator('#ke-limit .card').count()) === 0)
await page.locator('#ke-save').click()
await page.waitForTimeout(3000)

// Hadd se bahar — likhte hi tanbeeh aani chahiye.
await page.locator('[data-entry="udhaar"]').click()
await page.waitForTimeout(700)
await page.locator('#ke-amount').fill('800')
await page.waitForTimeout(700)
check(
  'Going past the limit warns while typing',
  (await page.locator('#ke-limit .card').count()) === 1,
)
check('And it says by how much', (await text()).includes('200'))

/*
 * Tanbeeh raqam ke saath honi chahiye, sheet ke aakhir me nahi.
 *
 * Pehle wo save button ke oopar thi — yaani raqam likhte waqt parde se bahar,
 * aur dukandar ko sirf tab nazar aati jab wo neeche tak scroll karta. Jo
 * tanbeeh dikhti hi na ho wo tanbeeh nahi.
 */
const order = await page.evaluate(() => {
  const box = document.querySelector('#ke-limit')
  const amount = document.querySelector('#ke-amount')
  const note = document.querySelector('#ke-note')
  if (!box || !amount || !note) return null
  return {
    afterAmount: box.compareDocumentPosition(amount) & Node.DOCUMENT_POSITION_PRECEDING,
    beforeNote: box.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING,
  }
})
check(
  'The warning sits right under the amount, not at the far bottom',
  Boolean(order?.afterAmount && order?.beforeNote),
)

// Save par ek dafa poochta hai — aur "phir bhi dein" chalta hai.
await page.locator('#ke-save').click()
await page.waitForTimeout(1200)
check('Saving asks once more', (await text()).includes('Give it anyway'))
await page.locator('.modal button').filter({ hasText: 'Give anyway' }).last().click()
await page.waitForTimeout(3500)

const after = await readStore(async () => {
  const m = await import('/js/store.js')
  return m.state.khataParties.find((x) => x.name === 'Limit Test')?.balance
})
check('It does not block — the shopkeeper decides', after === 1200, `Rs ${after}`)
check('The screen now says how far over they are', (await text()).includes('Over the'))
await h.shot('credit-limit')

// List par bhi nishan.
await page.goto(`${BASE}/#/khata`)
await page.waitForTimeout(2000)
check('The list flags a khata that is over its limit', (await text()).includes('Over limit'))

// Hadd na ho to kuch bhi nahi.
await page.goto(`${BASE}/#/khata/new`)
await page.waitForTimeout(1200)
await page.locator('#kf-name').fill('No Limit')
await page.locator('[data-save]').click()
await page.waitForTimeout(3000)
await page.goto(`${BASE}/#/khata`)
await page.waitForTimeout(2000)
await page.locator('[data-party]').filter({ hasText: 'No Limit' }).first().click()
await page.waitForTimeout(1500)
await page.locator('[data-entry="udhaar"]').click()
await page.waitForTimeout(700)
await page.locator('#ke-amount').fill('99999')
await page.waitForTimeout(700)
check(
  'With no limit set, nothing ever warns',
  (await page.locator('#ke-limit .card').count()) === 0,
)

const real = realErrors(errors)
check('No unexpected console errors', real.length === 0, real.slice(0, 2).join(' | '))

await finish(browser)
