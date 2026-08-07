/**
 * Bina tasveeron wala backup.
 *
 * Poori file ka wazan tasveerein hain — paanch sau product wali dukan me wo
 * chalees MB ki ban jati hai aur WhatsApp par nahi jati. Halki file me sab
 * kuch hota hai siwaye tasveeron ke.
 *
 * Yahan ka sab se ahem check aakhir me hai: halki file "replace" mode me
 * wapas daalne par dukan ki mojooda tasveerein NAHI mitni chahiye. Warna ek
 * chhoti file dukan ki har tasveer uda deti — aur ye wo nuqsaan hai jo bohat
 * baad me pata chalta hai.
 */
import { launch, check, finish, signUp, BASE, realErrors } from '../lib/harness.mjs'

const h = await launch()
const { page, browser, errors } = h
const { readStore } = h

await signUp(page, 'lightbackup')

// Ek product jis ke saath tasveer bhi ho. Tasveer seedha store me daalte hain
// — camera Chromium me nahi hai, aur asal cheez yahan file ki shakal hai.
await readStore(async () => {
  const m = await import('/js/store.js')
  const id = await m.saveImage(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  )
  await m.createProduct({
    nameEn: 'Photo Product',
    salePrice: 100,
    sellBy: 'pack',
    packLabel: 'piece',
    unit: 'piece',
    categoryIds: [],
    tags: [],
    status: 'active',
    stockQty: 5,
    imageId: id,
  })
})
await page.waitForTimeout(3000)

// Khata bhi, taake dekh sakein ke halki file me hisaab poora aata hai.
await readStore(async () => {
  const m = await import('/js/store.js')
  const id = await m.createKhataParty({ name: 'Light Khata' })
  await m.addKhataEntry({ partyId: id, kind: 'udhaar', amount: 750 })
})
await page.waitForTimeout(3000)

const full = await readStore(async () => {
  const m = await import('/js/store.js')
  const data = await m.buildExport()
  return {
    images: data.images.length,
    products: data.products.length,
    skipped: Boolean(data.imagesSkipped),
    bytes: JSON.stringify(data).length,
  }
})
check('The normal backup carries the photos', full.images === 1 && !full.skipped)

const light = await readStore(async () => {
  const m = await import('/js/store.js')
  const data = await m.buildExport({ withImages: false })
  return {
    images: data.images.length,
    products: data.products.length,
    khataEntries: (data.khataEntries || []).length,
    khataParties: (data.khataParties || []).length,
    skipped: Boolean(data.imagesSkipped),
    bytes: JSON.stringify(data).length,
  }
})
check('The light backup leaves them out', light.images === 0 && light.skipped)
check('It is smaller', light.bytes < full.bytes, `${light.bytes} vs ${full.bytes} bytes`)
check(
  'But everything else is still there',
  light.products === full.products && light.khataParties === 1 && light.khataEntries === 1,
  `${light.products} products, ${light.khataParties} khata, ${light.khataEntries} entries`,
)

// Takhmeena — asal size nahi, magar us se door bhi nahi.
const guess = await readStore(async () => {
  const m = await import('/js/store.js')
  return { photos: m.photoCount(), bytes: m.estimatedBackupBytes() }
})
check('The app can estimate the size before building it', guess.photos === 1 && guess.bytes > 0)

/*
 * Asal imtihan: halki file "replace" mode me wapas.
 *
 * Replace ka matlab hai "file ke mutabik sab kuch" — magar file me tasveerein
 * hain hi nahi. Agar us ka matlab tasveerein mitana samjha gaya, to dukandar
 * ek chhoti file bana kar wapas daalte hi apni saari tasveerein kho deta hai.
 */
const restored = await readStore(async () => {
  const m = await import('/js/store.js')
  const data = await m.buildExport({ withImages: false })
  await m.restoreExport(data, 'replace')
  await new Promise((r) => setTimeout(r, 2500))
  const product = m.state.products.find((p) => p.nameEn === 'Photo Product')
  const image = product?.imageId ? await m.loadImage(product.imageId) : null
  return { hasId: Boolean(product?.imageId), hasImage: Boolean(image) }
})
check(
  'Restoring a light backup does NOT wipe the photos already in the shop',
  restored.hasId && restored.hasImage,
  `imageId ${restored.hasId}, image ${restored.hasImage}`,
)

const real = realErrors(errors)
check('No unexpected console errors', real.length === 0, real.slice(0, 2).join(' | '))

await finish(browser)
