/**
 * Firestore rules khud.
 *
 * Ye test app ke raaste se nahi chalte — SEEDHA Firestore par likhne ki
 * koshish karte hain. Warna wo app ki validation ko test karte, rules ko nahi;
 * aur asal khatra to wahi hai jo app ko bypass kar ke aaye.
 */
import { launch, check, finish, signUp, realErrors } from '../lib/harness.mjs'

const h = await launch()
const { page, browser, errors } = h
const { readStore } = h

await signUp(page, 'rules')

const probe = await readStore(async () => {
  const fb = await import('/js/firebase.js')
  const { getFirestore, collection, doc, setDoc } = await import(
    'https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js'
  )
  const db = getFirestore()
  const uid = fb.currentUid()
  const out = {}

  const attempt = async (name, path, data) => {
    try {
      await setDoc(doc(collection(db, 'shops', uid, path)), data)
      out[name] = 'ALLOWED'
    } catch (e) {
      out[name] = e.code || 'refused'
    }
  }

  await attempt('negativeStock', 'products', { nameEn: 'Bad', stockQty: -5, salePrice: 10 })
  await attempt('textPrice', 'products', { nameEn: 'Bad', stockQty: 1, salePrice: 'bohat' })
  await attempt('namelessProduct', 'products', { stockQty: 1, salePrice: 10 })
  await attempt('negativeAmount', 'khataEntries', { partyId: 'x', kind: 'udhaar', amount: -100 })
  await attempt('textBalance', 'khataParties', { name: 'Bad', balance: 'kuch' })
  await attempt('goodProduct', 'products', {
    nameEn: 'Fine', stockQty: 3, salePrice: 25, costPrice: null,
  })
  return out
})

check('Negative stock is refused', probe.negativeStock === 'permission-denied', probe.negativeStock)
check('A price that is not a number is refused', probe.textPrice === 'permission-denied', probe.textPrice)
check('A product with no name is refused', probe.namelessProduct === 'permission-denied', probe.namelessProduct)
check('A negative khata amount is refused', probe.negativeAmount === 'permission-denied', probe.negativeAmount)
check('A balance that is not a number is refused', probe.textBalance === 'permission-denied', probe.textBalance)
check('A correct product still goes through', probe.goodProduct === 'ALLOWED', probe.goodProduct)

const real = realErrors(errors)
check('No unexpected console errors', real.length === 0, real.slice(0, 2).join(' | '))

await finish(browser)
