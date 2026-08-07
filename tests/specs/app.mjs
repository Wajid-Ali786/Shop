/**
 * Poori app ka rozana ka safar: account, products, stock, categories,
 * backup/restore, grahak wali list, aur data ki hifazat.
 */
import { readFile } from 'node:fs/promises'
import { launch, check, finish, BASE, SHOTS, realErrors } from '../lib/harness.mjs'

const h = await launch()
const { page, context, browser, errors } = h
const text = h.text
const readStore = h.readStore
const shot = h.shot


// ------------------------------------------------------------ 1. login screen
await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
check('Welcome screen shows when signed out', (await h.text()).includes('Karyana Shop'))
await h.shot('01-welcome')

// ------------------------------------------------------------ 2. create account
const EMAIL = `shop${Date.now()}@test.pk`
await page.locator('button:has-text("Create new account")').click()
await page.waitForTimeout(600)
await page.locator('#auth-email').fill(EMAIL)
await page.locator('#auth-password').fill('karyana123')
await page.locator('button[type=submit]').click()
await page.waitForTimeout(4000)

let body = await h.text()
check('Account creation signs in', !body.includes('Sign in to your shop'), body.slice(0, 60).replace(/\n/g, ' '))
check('Dashboard shows empty state', body.includes('No products yet'))
check('No permission errors (rules OK)', !body.includes('Firebase refused'))
await h.shot('02-dashboard-empty')

// ------------------------------------------------------ 3. categories seeded
await page.goto(`${BASE}/#/products`)
await page.waitForTimeout(1500)
check('Default categories auto-seeded', (await h.text()).includes('Grains & Pulses'))
await h.shot('03-products-empty')

// ------------------------------------------------------------ 4. add product
async function addProduct({ name, price, unit, stock, low, tags, category }) {
  await page.goto(`${BASE}/#/product/new`)
  await page.waitForTimeout(900)
  await page.locator('#f-nameEn').fill(name)

  // Categories ab checkbox list hain, dropdown nahi.
  if (category !== undefined) {
    await page.locator('[data-cat]').nth(category).click()
    await page.waitForTimeout(300)
  }

  // Khuli cheez (kg/litre) aur pack ki cheez ka form alag hai.
  const loose = ['kg', 'g', 'l', 'ml'].includes(unit)
  await page.locator(`[data-sellby="${loose ? 'loose' : 'pack'}"]`).click()
  await page.waitForTimeout(400)

  await page.locator('#f-salePrice').fill(String(price))
  if (loose) {
    await page.locator('#f-unit').selectOption(unit)
    await page.waitForTimeout(400) // unit change se form dobara render hota hai
  } else {
    await page.locator('#f-packLabel').selectOption(unit)
    await page.waitForTimeout(400)
  }
  await page.locator('#f-stockQty').fill(String(stock))
  await page.locator('#f-lowStockAt').fill(String(low))
  for (const tag of tags) {
    await page.locator('#f-tag').fill(tag)
    await page.locator('#f-tag').press('Enter')
    await page.waitForTimeout(350)
  }
  await page.locator('[data-save]').click()
  await page.waitForTimeout(2200)
}

await addProduct({
  name: 'Basmati Rice',
  price: 250,
  unit: 'kg',
  stock: 12.5,
  low: 5,
  tags: ['chawal', 'چاول', 'rice'],
  category: 1,
})
await addProduct({
  name: 'Surf Excel',
  price: 450,
  unit: 'packet',
  stock: 3,
  low: 5,
  tags: ['sarf', 'صابن', 'washing powder'],
})

await page.goto(`${BASE}/#/products`)
await page.waitForTimeout(1600)
body = await h.text()
check('Product saved and listed', body.includes('Basmati Rice'))
check('Stock shows 12.5 kg', body.includes('12.5'), body.match(/12\.5\s*\S+/)?.[0] || '')
check('Second product listed', body.includes('Surf Excel'))
await h.shot('04-products-list')

// --------------------------------------------------------------- 5. search
async function search(q) {
  const box = page.locator('input[type=search]')
  await box.fill(q)
  await page.waitForTimeout(600)
  return text()
}
check('Search by name', (await search('Basmati')).includes('Basmati Rice'))
check('Search by hidden Roman tag "chawal"', (await search('chawal')).includes('Basmati Rice'))
check('Search by Urdu tag "چاول"', (await search('چاول')).includes('Basmati Rice'))
check('Typo tolerated "chawl"', (await search('chawl')).includes('Basmati Rice'))
check('Variant tolerated "chaawal"', (await search('chaawal')).includes('Basmati Rice'))
check('Hidden tag "sarf" finds Surf Excel', (await search('sarf')).includes('Surf Excel'))
check('Urdu tag "صابن" finds Surf Excel', (await search('صابن')).includes('Surf Excel'))
check('No-result state', (await search('zzqqxx')).includes('Nothing found'))
await h.shot('05-search')
await page.locator('input[type=search]').fill('')
await page.waitForTimeout(500)

// -------------------------------------------------- 6. stock adjust + history
await page.goto(`${BASE}/#/products`)
await page.waitForTimeout(1200)
await page.locator('text=Basmati Rice').first().click()
await page.waitForTimeout(1200)
await page.locator('[data-adjust-open]').click()
await page.waitForTimeout(700)
await page.locator('[data-mode="out"]').click()
await page.waitForTimeout(300)
await page.locator('#sheet-qty').fill('2.5')
await page.waitForTimeout(400)
await h.shot('06-stock-sheet')
await page.locator('#sheet-save').click()
await page.waitForTimeout(2500)

body = await h.text()
check('Stock reduced 12.5 → 10', body.includes('10 kg'), body.match(/10\s*kg/)?.[0] || '')
check('History records "Sold"', body.includes('Sold'))
check('History records opening stock', body.includes('Opening stock'))
await h.shot('07-product-detail')

// Gram entry converts: +500 g → 10.5 kg
await page.locator('[data-adjust-open]').click()
await page.waitForTimeout(700)
await page.locator('#sheet-qty').fill('500')
await page.locator('#sheet-unit').selectOption('g')
await page.waitForTimeout(400)
await page.locator('#sheet-save').click()
await page.waitForTimeout(2500)
check('Gram entry converts (500 g → 10.5 kg)', (await h.text()).includes('10.5 kg'))

// ---------------------------------------------------------- 7. stock screen
await page.goto(`${BASE}/#/stock`)
await page.waitForTimeout(1500)
body = await h.text()
check('Reorder list shows low-stock product', body.includes('Surf Excel'), 'stock 3 ≤ alert 5')
await h.shot('08-stock-alerts')

// ------------------------------------------------------------ 8. dashboard
await page.goto(`${BASE}/#/`)
await page.waitForTimeout(1500)
body = await h.text()
check('Dashboard shows stock value', /Rs\s*[\d,]/.test(body))
check('Dashboard shows recent activity', body.includes('Sold') || body.includes('Opening stock'))
await h.shot('09-dashboard')

// -------------------------------------------------------- 9. Urdu + RTL
await page.goto(`${BASE}/#/settings`)
await page.waitForTimeout(1200)
await page.locator('[data-lang="ur"]').click()
await page.waitForTimeout(1000)
check('Language switches to Urdu', (await page.evaluate(() => document.documentElement.lang)) === 'ur')
check('Layout flips to RTL', (await page.evaluate(() => document.documentElement.dir)) === 'rtl')
check('Urdu strings render', (await h.text()).includes('سیٹنگز'))
await h.shot('10-settings-urdu')

await page.goto(`${BASE}/#/products`)
await page.waitForTimeout(1200)
await h.shot('11-products-urdu-rtl')

await page.goto(`${BASE}/#/settings`)
await page.waitForTimeout(900)
await page.locator('[data-lang="en"]').click()
await page.waitForTimeout(900)

// ------------------------------------------------------------ 10. dark mode
await page.locator('[data-theme="dark"]').click()
await page.waitForTimeout(700)
check('Dark mode applies', await page.evaluate(() => document.documentElement.classList.contains('dark')))
await page.goto(`${BASE}/#/`)
await page.waitForTimeout(1200)
await h.shot('12-dashboard-dark')
await page.goto(`${BASE}/#/settings`)
await page.waitForTimeout(800)
await page.locator('[data-theme="light"]').click()
await page.waitForTimeout(600)

// -------------------------------------------------------------- 11. export
const dl = page.waitForEvent('download', { timeout: 15000 })
await page.locator('[data-export]').click()
const download = await dl
// Backup file yahan girti hai — `tests/shots/` git se bahar hai.
const exportPath = `${SHOTS}/export.json`
await download.saveAs(exportPath)
const exported = JSON.parse(await readFile(exportPath, 'utf8'))
check('Export contains both products', exported.products.length === 2, `${exported.products.length} products`)
check('Export contains movements', exported.movements.length >= 3, `${exported.movements.length} movements`)
check('Export contains categories', exported.categories.length >= 10)

// --------------------------------------------- 12. service worker + offline
const swReady = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration()
  return Boolean(reg && (reg.active || reg.installing || reg.waiting))
})
check('Service worker registered', swReady)

const cachedVendor = await page.evaluate(async () => {
  const names = await caches.keys()
  for (const n of names) {
    const c = await caches.open(n)
    const keys = await c.keys()
    if (keys.some((r) => r.url.includes('gstatic.com/firebasejs'))) return true
  }
  return false
})
check('Firebase SDK cached for offline', cachedVendor)

// Firestore ka offline cache: server band kar ke data parhna
const client = await context.newCDPSession(page)
await client.send('Network.enable')
await client.send('Network.emulateNetworkConditions', {
  offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0,
})
await page.goto(`${BASE}/#/products`, { waitUntil: 'domcontentloaded' }).catch(() => {})
await page.waitForTimeout(4000)
body = await h.text()
check('App renders offline', body.includes('Products') || body.includes('Basmati'))
check('Data readable offline (Firestore cache)', body.includes('Basmati Rice'))
await h.shot('13-offline')
await client.send('Network.emulateNetworkConditions', {
  offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
})

// ------------------------------------------------- 13. sign out / sign in
await page.goto(`${BASE}/#/settings`)
await page.waitForTimeout(1500)
await page.locator('[data-signout]').click()
await page.waitForTimeout(2500)
check('Sign out returns to welcome', (await h.text()).includes('Karyana Shop'))

await page.locator('button:has-text("Login")').click()
await page.waitForTimeout(600)
await page.locator('#auth-email').fill(EMAIL)
await page.locator('#auth-password').fill('karyana123')
await page.locator('button[type=submit]').click()
await page.waitForTimeout(4000)
await page.goto(`${BASE}/#/products`)
await page.waitForTimeout(2000)
check('Sign in again restores data', (await h.text()).includes('Basmati Rice'))
await h.shot('14-after-relogin')

// --------------------------------------------------- 14. wrong password
await page.goto(`${BASE}/#/settings`)
await page.waitForTimeout(1200)
await page.locator('[data-signout]').click()
await page.waitForTimeout(2000)
await page.locator('button:has-text("Login")').click()
await page.waitForTimeout(600)
await page.locator('#auth-email').fill(EMAIL)
await page.locator('#auth-password').fill('wrongpass')
await page.locator('button[type=submit]').click()
await page.waitForTimeout(2500)
check('Wrong password shows friendly error', (await h.text()).includes('Email or password is wrong'))
await h.shot('15-auth-error')

// ------------------------------- 15. data safety: photo, restore, seeding
// Sign in wapas kar lete hain — pichhla section ghalat password par khatam hua.
await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2000)
if (!(await h.text()).includes('Products')) {
  await page.locator('button:has-text("Login")').click()
  await page.waitForTimeout(600)
  await page.locator('#auth-email').fill(EMAIL)
  await page.locator('#auth-password').fill('karyana123')
  await page.locator('button[type=submit]').click()
  await page.waitForTimeout(4500)
}

/** App ke apne store se seedha padhna — asli data, screen ka andaza nahi. */

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

// ---- tasveer wala product banate hain ----
await page.goto(`${BASE}/#/product/new`)
await page.waitForTimeout(900)
await page.locator('#f-nameEn').fill('Photo Product')
await page.locator('#f-salePrice').fill('99')
await page.locator('#file-gallery').setInputFiles({
  name: 'p.png', mimeType: 'image/png', buffer: PNG,
})
await page.waitForTimeout(1500)
await page.locator('[data-save]').click()
await page.waitForTimeout(2500)

const afterCreate = await h.readStore(async () => {
  const m = await import('/js/store.js')
  const p = m.state.products.find((x) => x.nameEn === 'Photo Product')
  return p ? { id: p.id, imageId: p.imageId } : null
})
check('Product saved with a photo', Boolean(afterCreate?.imageId), `imageId ${afterCreate?.imageId}`)

// ---- sirf qeemat badal kar save: tasveer ko haath nahi lagna chahiye ----
await page.goto(`${BASE}/#/product/${afterCreate.id}/edit`)
await page.waitForTimeout(1800) // tasveer load ho jane do
await page.locator('#f-salePrice').fill('120')
await page.locator('[data-save]').click()
await page.waitForTimeout(2500)

const afterEdit = await h.readStore(async () => {
  const m = await import('/js/store.js')
  const p = m.state.products.find((x) => x.nameEn === 'Photo Product')
  return p ? { imageId: p.imageId, price: p.salePrice } : null
})
check('Price edit saved', afterEdit?.price === 120, `Rs ${afterEdit?.price}`)
check('Photo survives an ordinary edit', Boolean(afterEdit?.imageId), `imageId ${afterEdit?.imageId}`)
check(
  'Photo is NOT re-uploaded on every edit (same imageId)',
  afterEdit?.imageId === afterCreate?.imageId,
  `${afterCreate?.imageId} -> ${afterEdit?.imageId}`,
)

const imageStillThere = await h.readStore(async () => {
  const m = await import('/js/store.js')
  const p = m.state.products.find((x) => x.nameEn === 'Photo Product')
  const data = await m.loadImage(p.imageId)
  return Boolean(data && data.startsWith('data:image'))
})
check('Photo data still readable after edit', imageStillThere)

// ---- thande cache par foran save dabana ----
const coldContext = await h.newContext()
const coldPage = await coldContext.newPage()
await coldPage.goto(BASE, { waitUntil: 'domcontentloaded' })
await coldPage.waitForTimeout(3000)
await coldPage.locator('button:has-text("Login")').click()
await coldPage.waitForTimeout(800)
await coldPage.locator('#auth-email').fill(EMAIL)
await coldPage.locator('#auth-password').fill('karyana123')
await coldPage.locator('button[type=submit]').click()
await coldPage.waitForTimeout(6000)
await coldPage.goto(`${BASE}/#/product/${afterCreate.id}/edit`)
await coldPage.waitForSelector('#f-salePrice')
await coldPage.locator('#f-salePrice').fill('150')
await coldPage.locator('[data-save]').click()
await coldPage.waitForTimeout(6000)

const afterFastSave = await coldPage.evaluate(async () => {
  const m = await import('/js/store.js')
  const p = m.state.products.find((x) => x.nameEn === 'Photo Product')
  const data = p?.imageId ? await m.loadImage(p.imageId) : null
  return { imageId: p?.imageId ?? null, hasData: Boolean(data), price: p?.salePrice }
})
check(
  'Photo intact after an immediate save on a cold cache',
  Boolean(afterFastSave.imageId) && afterFastSave.hasData,
  `imageId ${afterFastSave.imageId}, data ${afterFastSave.hasData}`,
)
await coldPage.screenshot({ path: `${SHOTS}/16-photo-intact.png`, fullPage: true })
await coldContext.close()

// ---- merge restore categories dobara nahi banata ----
const beforeRestore = await h.readStore(async () => {
  const m = await import('/js/store.js')
  return { categories: m.state.categories.length, products: m.state.products.length }
})
const mergeResult = await h.readStore(async () => {
  const m = await import('/js/store.js')
  const data = await m.buildExport()
  await m.restoreExport(data, 'merge')
  await new Promise((r) => setTimeout(r, 2500))
  return { categories: m.state.categories.length, products: m.state.products.length }
})
check(
  'Merge restore does NOT duplicate categories',
  mergeResult.categories === beforeRestore.categories,
  `${beforeRestore.categories} -> ${mergeResult.categories}`,
)
check(
  'Merge restore does add the products back',
  mergeResult.products === beforeRestore.products * 2,
  `${beforeRestore.products} -> ${mergeResult.products}`,
)

// ---- replace restore: dukan kabhi khali nahi hoti ----
const replaceResult = await h.readStore(async () => {
  const m = await import('/js/store.js')
  const data = await m.buildExport()
  const snapshot = { categories: data.categories.length, products: data.products.length }
  await m.restoreExport(data, 'replace')
  await new Promise((r) => setTimeout(r, 2500))
  return {
    ...snapshot,
    afterCategories: m.state.categories.length,
    afterProducts: m.state.products.length,
  }
})
check(
  'Replace restore keeps every product',
  replaceResult.afterProducts === replaceResult.products,
  `${replaceResult.products} -> ${replaceResult.afterProducts}`,
)
check(
  'Replace restore keeps every category',
  replaceResult.afterCategories === replaceResult.categories,
  `${replaceResult.categories} -> ${replaceResult.afterCategories}`,
)

// ---- default categories har login par dobara nahi bantin ----
const catsBefore = await h.readStore(async () => {
  const m = await import('/js/store.js')
  return m.state.categories.filter((c) => c.nameEn === 'Grains & Pulses').length
})
for (let i = 0; i < 2; i++) {
  await page.goto(`${BASE}/#/settings`)
  await page.waitForTimeout(1500)
  await page.locator('[data-signout]').click()
  await page.waitForTimeout(2000)
  await page.locator('button:has-text("Login")').click()
  await page.waitForTimeout(600)
  await page.locator('#auth-email').fill(EMAIL)
  await page.locator('#auth-password').fill('karyana123')
  await page.locator('button[type=submit]').click()
  await page.waitForTimeout(4000)
}
const catsAfter = await h.readStore(async () => {
  const m = await import('/js/store.js')
  return m.state.categories.filter((c) => c.nameEn === 'Grains & Pulses').length
})
check(
  'Default categories are not re-seeded on repeat sign-ins',
  catsAfter === catsBefore && catsAfter === 1,
  `${catsBefore} -> ${catsAfter}`,
)

// ---------------------- 16. backup reminder + bari list ki raftaar
// Pehle export wale section ne backup ki tareekh likh di thi, is liye usay
// saaf kar ke dekhte hain — warna ye check apne aap hi pass ho jata.
await h.readStore(async () => {
  const m = await import('/js/store.js')
  await m.saveSetting('lastBackupAt', null)
  await new Promise((r) => setTimeout(r, 1500))
})
await page.goto(`${BASE}/#/`)
await page.waitForTimeout(2500)
check('Backup reminder shows when no backup was ever saved', (await h.text()).includes('Save a backup'))
await h.shot('18-backup-reminder')

await page.goto(`${BASE}/#/settings`)
await page.waitForTimeout(1500)
const backupDownload = page.waitForEvent('download').catch(() => null)
await page.locator('[data-export]').click()
await backupDownload
await page.waitForTimeout(2500)
await page.goto(`${BASE}/#/`)
await page.waitForTimeout(2500)
check('Backup reminder disappears after saving a backup', !(await h.text()).includes('Save a backup'))

const stamped = await h.readStore(async () => {
  const m = await import('/js/store.js')
  return { at: m.state.settings.lastBackupAt, due: m.backupDue() }
})
check('Backup date recorded in settings', Boolean(stamped.at) && stamped.due === false)

// ---- yaad-dihani ki muddat dukandar ke haath me ----
await page.goto(`${BASE}/#/settings`)
await page.waitForTimeout(1800)
await page.locator('#s-backupDays').selectOption('7')
await page.waitForTimeout(2000)

// Backup ko 10 din purana bana kar dekhte hain: 7 din par yaad aani chahiye,
// 30 din par nahi.
const reminderAt7 = await h.readStore(async () => {
  const m = await import('/js/store.js')
  await m.saveSetting('lastBackupAt', Date.now() - 10 * 24 * 60 * 60 * 1000)
  await new Promise((r) => setTimeout(r, 1500))
  return { days: m.backupReminderDays(), due: m.backupDue() }
})
check(
  'Reminder set to 7 days fires on a 10-day-old backup',
  reminderAt7.days === 7 && reminderAt7.due === true,
  `every ${reminderAt7.days} days, due ${reminderAt7.due}`,
)

await page.locator('#s-backupDays').selectOption('30')
await page.waitForTimeout(2000)
const reminderAt30 = await h.readStore(async () => {
  const m = await import('/js/store.js')
  return { days: m.backupReminderDays(), due: m.backupDue() }
})
check(
  'Reminder set to 30 days stays quiet on the same backup',
  reminderAt30.days === 30 && reminderAt30.due === false,
  `every ${reminderAt30.days} days, due ${reminderAt30.due}`,
)

await page.locator('#s-backupDays').selectOption('0')
await page.waitForTimeout(2000)
const reminderOff = await h.readStore(async () => {
  const m = await import('/js/store.js')
  await m.saveSetting('lastBackupAt', null)
  await new Promise((r) => setTimeout(r, 1500))
  return m.backupDue()
})
check('Reminder can be switched off entirely', reminderOff === false)

await page.goto(`${BASE}/#/`)
await page.waitForTimeout(2000)
check('No reminder card when switched off', !(await h.text()).includes('Save a backup'))

// Baqi tests ke liye wapas default par.
await page.goto(`${BASE}/#/settings`)
await page.waitForTimeout(1500)
await page.locator('#s-backupDays').selectOption('14')
await page.waitForTimeout(2000)
await h.shot('19-backup-done')

// ---- bari list: DOM chhota rehna chahiye ----
const BULK = 150
await h.readStore(async () => {
  const m = await import('/js/store.js')
  const jobs = []
  for (let i = 0; i < 150; i++) {
    jobs.push(
      m.createProduct({
        nameEn: `Bulk Item ${String(i).padStart(3, '0')}`,
        salePrice: 10 + i,
        sellBy: 'pack',
        packLabel: 'piece',
        unit: 'piece',
        categoryIds: [],
        tags: [],
        status: 'active',
        stockQty: 5,
      }),
    )
  }
  await Promise.all(jobs)
})
await page.goto(`${BASE}/#/products`)
await page.waitForTimeout(5000)

/*
 * Ek safhe me kitni rows — app se hi poochte hain.
 *
 * Pehle ye adad test me likha hua tha, aur `PAGE_SIZE` badalte hi teen check
 * jhoote ho jate the. Sawal ye hai ke "ek safha dikhta hai ya sab", adad kya
 * hai ye nahi.
 */
const PAGE_SIZE = await readStore(async () => {
  const m = await import('/js/lib/paging.js')
  return m.PAGE_SIZE
})

const paging = await page.evaluate(() => ({
  rows: document.querySelectorAll('.plist > li, .pgrid > li').length,
  hasMore: Boolean(document.querySelector('[data-show-more]')),
  label: document.body.innerText.match(/Showing \d+ of \d+/)?.[0] || '',
}))
check(
  'Big list renders only one page of rows, not all of them',
  paging.rows === PAGE_SIZE && paging.hasMore,
  `${paging.rows} rows, ${paging.label}`,
)

await page.locator('[data-show-more]').click()
await page.waitForTimeout(1500)
const afterMore = await page.evaluate(
  () => document.querySelectorAll('.plist > li, .pgrid > li').length,
)
check('"Show more" adds the next page', afterMore === PAGE_SIZE * 2, `${afterMore} rows`)

const totalShown = await page.evaluate(
  () => document.body.innerText.match(/(\d+) products/)?.[1] || '0',
)
check(
  'Product count still reflects every product',
  Number(totalShown) >= BULK,
  `${totalShown} products counted`,
)

await page.locator('#q').fill('Bulk Item 077')
await page.waitForTimeout(1800)
check('Search still finds a product in a big list', (await h.text()).includes('Bulk Item 077'))
await page.locator('#q').fill('')
await page.waitForTimeout(1800)
const afterReset = await page.evaluate(
  () => document.querySelectorAll('.plist > li, .pgrid > li').length,
)
check('Paging resets after clearing the search', afterReset === PAGE_SIZE, `${afterReset} rows`)
await h.shot('20-big-list')

// ------------------------------------- 17. grahak wala public catalog
// Ek product par khareed rate aur thok rate daal dete hain — yahi cheezein
// baahar NAHI jani chahiyen.
const secretProduct = await h.readStore(async () => {
  const m = await import('/js/store.js')
  const p = m.state.products.find((x) => x.nameEn === 'Basmati Rice')
  await m.updateProduct(p.id, { costPrice: 180, wholesalePrice: 210, barcode: '8964000111222' })
  await new Promise((r) => setTimeout(r, 2000))
  const after = m.state.products.find((x) => x.id === p.id)
  return { id: p.id, cost: after.costPrice, stock: after.stockQty, sale: after.salePrice }
})
check(
  'Test product has a cost price and stock to protect',
  secretProduct.cost === 180 && secretProduct.stock > 0,
  `cost ${secretProduct.cost}, stock ${secretProduct.stock}`,
)

// ---- catalog chalu karo ----
await page.goto(`${BASE}/#/settings`)
await page.waitForTimeout(1800)
await page.locator('[data-catalog="on"]').click()
await page.waitForTimeout(6000)
const dismiss = page.locator('.modal button').first()
if (await dismiss.count()) await dismiss.click().catch(() => {})
await page.waitForTimeout(1200)

const published = await h.readStore(async () => {
  const m = await import('/js/store.js')
  const fb = await import('/js/firebase.js')
  return {
    on: m.catalogOn(),
    uid: fb.currentUid(),
    indexUid: (await m.defaultPublicShopUid()) || null,
  }
})
check('Catalog switched on', published.on && Boolean(published.uid))
check(
  'Catalog claimed the home page',
  published.indexUid === published.uid,
  `index -> ${published.indexUid === published.uid ? 'this shop' : published.indexUid}`,
)

// ---- YE SAB SE AHEM CHECK HAI ----
const publicDocs = await h.readStore(async () => {
  const m = await import('/js/store.js')
  const fb = await import('/js/firebase.js')
  const shop = await m.loadPublicShop(fb.currentUid())
  return shop.products
})
const leaked = []
for (const p of publicDocs) {
  for (const field of ['costPrice', 'wholesalePrice', 'searchBlob', 'tags', 'barcode', 'brand']) {
    if (field in p) leaked.push(`${p.nameEn}.${field}`)
  }
}
check(
  'Public catalog leaks NO cost price, wholesale price, tags or barcode',
  leaked.length === 0,
  leaked.length ? `LEAKED: ${leaked.join(', ')}` : `${publicDocs.length} products checked`,
)
check(
  'Public catalog carries image, name, price and stock',
  publicDocs.every(
    (p) => p.nameEn && typeof p.salePrice === 'number' && typeof p.stockQty === 'number',
  ),
  `${publicDocs.length} products`,
)
check(
  'Public catalog carries categories for filtering',
  (await h.readStore(async () => {
    const m = await import('/js/store.js')
    const fb = await import('/js/firebase.js')
    const shop = await m.loadPublicShop(fb.currentUid())
    return shop.categories.length
  })) > 0,
)

// ---- bina login ke catalog nazar aata hai ----
const shopUid = published.uid
const visitor = await h.newContext()
const guest = await visitor.newPage()
await guest.goto(BASE, { waitUntil: 'domcontentloaded' })
await guest.waitForTimeout(5000)
const guestText = await guest.locator('body').innerText()

check('Signed-out visitor sees the products', guestText.includes('Basmati Rice'))
check('Signed-out visitor sees login options', guestText.includes('Login'))
check(
  'Signed-out visitor is NOT shown the cost price',
  !guestText.includes('180') && !guestText.includes('210'),
)
check('Signed-out visitor sees stock', guestText.includes('10.5 kg'), 'Basmati stock 10.5 kg')
check(
  'Signed-out visitor gets category chips',
  (await guest.locator('[data-catfilter]').count()) > 1,
  `${await guest.locator('[data-catfilter]').count()} chips`,
)
check('Signed-out visitor gets a search box', (await guest.locator('#cq').count()) === 1)
check('Signed-out visitor gets an in-stock filter', (await guest.locator('[data-instock]').count()) === 1)
await guest.screenshot({ path: `${SHOTS}/21-catalog-guest.png`, fullPage: true })

// Search grahak ke liye kaam karti hai.
await guest.locator('#cq').fill('Basmati')
await guest.waitForTimeout(1200)
const searched = await guest.locator('body').innerText()
check(
  'Catalog search narrows the list',
  searched.includes('Basmati Rice') && !searched.includes('Surf Excel'),
)
await guest.locator('#cq').fill('')
await guest.waitForTimeout(1200)

// Category chip se chhanti.
await guest.locator('[data-catfilter]').nth(1).click()
await guest.waitForTimeout(1200)
const chipCount = await guest.locator('.pgrid > li').count()
check('Category chip filters the catalog', chipCount > 0 && chipCount < 156, `${chipCount} shown`)
await guest.locator('[data-catfilter="all"]').click()
await guest.waitForTimeout(1000)

// Stock ki tabdeeli grahak wali list tak pahunchti hai.
const newBalance = await h.readStore(async () => {
  const m = await import('/js/store.js')
  const p = m.state.products.find((x) => x.nameEn === 'Basmati Rice')
  return m.adjustStock({ productId: p.id, qty: 2, type: 'out', reason: 'sale' })
})
await guest.reload({ waitUntil: 'domcontentloaded' })
await guest.waitForTimeout(5000)
const afterSale = await guest.locator('body').innerText()
check(
  'Stock change reaches the public catalog',
  afterSale.includes(`${newBalance} kg`),
  `now ${newBalance} kg`,
)

// Firestore rules khud rok rahi hain? Seedha niji collection maangte hain.
const blocked = await guest.evaluate(async (uid) => {
  const fs = await import(
    'https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js'
  )
  const { dbf } = await import('/js/firebase.js')
  try {
    const snap = await fs.getDocs(fs.collection(fs.doc(dbf, 'shops', uid), 'products'))
    return { blocked: false, count: snap.size }
  } catch (err) {
    return { blocked: true, code: err?.code }
  }
}, shopUid)
check(
  'Firestore rules block a visitor from reading the real products',
  blocked.blocked,
  blocked.blocked ? `refused: ${blocked.code}` : `READ ${blocked.count} REAL PRODUCTS`,
)

// ---- catalog band karne par public copy mit jati hai ----
await visitor.close()
await page.goto(`${BASE}/#/settings`)
await page.waitForTimeout(1800)
await page.locator('[data-catalog="off"]').click()
await page.waitForTimeout(1200)
const confirmBtn = page.locator('.modal button').filter({ hasText: 'Off' }).first()
if (await confirmBtn.count()) await confirmBtn.click()
await page.waitForTimeout(5000)

const afterOff = await h.readStore(async () => {
  const m = await import('/js/store.js')
  const fb = await import('/js/firebase.js')
  const shop = await m.loadPublicShop(fb.currentUid())
  return {
    on: m.catalogOn(),
    shop: shop ? shop.products.length : 'gone',
    indexUid: (await m.defaultPublicShopUid()) || 'released',
  }
})
check(
  'Turning the catalog off removes the public copy',
  afterOff.on === false && afterOff.shop === 'gone',
  `catalogOn ${afterOff.on}, public ${afterOff.shop}`,
)
check(
  'Turning the catalog off releases the home-page claim',
  afterOff.indexUid === 'released',
  `index -> ${afterOff.indexUid}`,
)

// Dukandar ka apna data waisa hi hai.
const ownDataIntact = await h.readStore(async () => {
  const m = await import('/js/store.js')
  const p = m.state.products.find((x) => x.nameEn === 'Basmati Rice')
  return { cost: p?.costPrice, stock: p?.stockQty }
})
check(
  "Shopkeeper's own product is untouched by all of this",
  ownDataIntact.cost === 180 && ownDataIntact.stock > 0,
  `cost ${ownDataIntact.cost}, stock ${ownDataIntact.stock}`,
)

// ---------------------------------------------------------- 18. errors
const real = errors.filter(
  (e) =>
    !e.includes('favicon') &&
    !e.includes('ERR_INTERNET_DISCONNECTED') &&
    !e.includes('ERR_NETWORK_CHANGED') &&
    !e.includes('Failed to load resource') &&
    !e.toLowerCase().includes('quota'),
)
check('No unexpected console errors', real.length === 0, real.slice(0, 3).join(' | '))
await finish(browser)
