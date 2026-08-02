/**
 * Data layer. Saara Firestore access sirf isi file se hota hai — screens
 * Firestore ko seedha nahi chhuti. Is se kal ko database badalna ho to sirf
 * yahi file badlegi.
 *
 * Data ka dhaancha (har user ka apna alag):
 *   shops/{uid}                      → settings (shop ka naam, currency wagera)
 *   shops/{uid}/products/{id}
 *   shops/{uid}/categories/{id}
 *   shops/{uid}/movements/{id}       → stock ki har tabdeeli ka record
 */
import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  limit,
  where,
  writeBatch,
  runTransaction,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js'

import { dbf, currentUid } from './firebase.js'
import { buildSearchBlob } from './lib/search.js'
import { round3 } from './lib/units.js'

// ------------------------------------------------------------------ state

export const state = {
  products: [],
  categories: [],
  movements: [],
  settings: { ...defaultSettings() },
  ready: false,
  error: null,
}

export function defaultSettings() {
  return {
    shopName: '',
    currency: 'Rs',
    defaultLowStockAt: 5,
    theme: 'system',
    // Aakhri backup kab hua (millis). `null` = kabhi nahi.
    lastBackupAt: null,
  }
}

/**
 * Itne din baad backup ki yaad-dihani aati hai.
 *
 * Data Firebase me hai, is liye phone tootne ya kho jane se kuch nahi jata.
 * Backup us se bachata hai jo Firebase nahi rok sakta: ghalti se product ya
 * category delete kar dena, ya account tak rasai khatam ho jana.
 */
export const BACKUP_REMINDER_DAYS = 14

/** Backup ki yaad-dihani dikhani chahiye? */
export function backupDue(settings = state.settings) {
  if (!state.products.length) return false // khali dukan ka backup bay-maani hai
  const last = settings.lastBackupAt
  if (!last) return true
  return Date.now() - last > BACKUP_REMINDER_DAYS * 24 * 60 * 60 * 1000
}

/** Backup ke din ginti — banner me dikhane ke liye. */
export function daysSinceBackup(settings = state.settings) {
  if (!settings.lastBackupAt) return null
  return Math.floor((Date.now() - settings.lastBackupAt) / (24 * 60 * 60 * 1000))
}

const listeners = new Set()
let unsubscribers = []

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function emit() {
  for (const fn of listeners) fn(state)
}

// ------------------------------------------------------------------ paths

function shopRef() {
  const uid = currentUid()
  if (!uid) throw new Error('Sign in nahi kiya hua')
  return doc(dbf, 'shops', uid)
}

function col(name) {
  return collection(shopRef(), name)
}

/**
 * Firestore ek batch me zyada se zyada 500 operations leta hai — us se aage
 * poora batch fail ho jata hai. Pehle ye teen jagah bay-hisaab chal raha tha
 * (saare products, saari movements), is liye ab tor kar bhejte hain.
 */
const BATCH_LIMIT = 450

async function commitInChunks(ops) {
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = writeBatch(dbf)
    for (const apply of ops.slice(i, i + BATCH_LIMIT)) apply(batch)
    await batch.commit()
  }
}

// ------------------------------------------------------- live subscriptions

/**
 * Teenon collections par live listeners lagata hai. Firestore ka offline cache
 * pehle local data deta hai (foran), phir server se aane par update kar deta hai.
 */
export function startSync() {
  stopSync()
  state.ready = false
  state.error = null

  const onError = (err) => {
    state.error = err?.code === 'permission-denied' ? 'permission' : 'generic'
    emit()
  }

  unsubscribers = [
    onSnapshot(
      query(col('products'), orderBy('nameEn')),
      (snap) => {
        state.products = snap.docs.map((d) => normalizeProduct(withId(d)))
        state.ready = true
        emit()
      },
      onError,
    ),
    onSnapshot(
      query(col('categories'), orderBy('sortOrder')),
      (snap) => {
        state.categories = snap.docs.map(withId)
        emit()
      },
      onError,
    ),
    onSnapshot(
      query(col('movements'), orderBy('createdAt', 'desc'), limit(100)),
      (snap) => {
        state.movements = snap.docs.map(withId)
        emit()
      },
      onError,
    ),
    onSnapshot(
      shopRef(),
      (snap) => {
        state.settings = { ...defaultSettings(), ...(snap.data() || {}) }
        // Welcome screen par login se PEHLE shop ka naam dikhana hota hai, aur
        // us waqt Firestore se kuch nahi mil sakta — is liye local copy.
        try {
          localStorage.setItem('karyana.shopName', state.settings.shopName || '')
        } catch {
          // Private mode me localStorage band ho sakta hai — koi masla nahi.
        }
        emit()
      },
      onError,
    ),
  ]
}

export function stopSync() {
  for (const un of unsubscribers) un()
  unsubscribers = []
  state.products = []
  state.categories = []
  state.movements = []
  state.settings = defaultSettings()
  state.ready = false
  state.error = null
}

function withId(d) {
  const data = d.data()
  return {
    ...data,
    id: d.id,
    // serverTimestamp abhi pending ho to null aata hai — us waqt local time chala lete hain.
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
  }
}

/**
 * Purane products me `sellBy` nahi tha aur category ek hi hoti thi.
 * Yahan parhte waqt hi nayi shakal me dhaal dete hain — is se purana record
 * bina dobara likhe chalta rehta hai, aur baqi app ko do shaklein nahi
 * sambhalni parti.
 */
function normalizeProduct(p) {
  const isPacked = p.sellBy
    ? p.sellBy === 'pack'
    : !['kg', 'g', 'l', 'ml'].includes(p.unit)

  return {
    ...p,
    sellBy: p.sellBy || (isPacked ? 'pack' : 'loose'),
    packLabel: p.packLabel || (isPacked ? p.unit || 'piece' : null),
    packSize: p.packSize ?? null,
    packUnit: p.packUnit ?? null,
    tags: p.tags || [],
    // Teen haalatein: normal, waqti tor par chhupi hui, ya market se khatam.
    // Purane records me sirf `isActive` tha — false ka matlab "chhupi hui".
    status: p.status || (p.isActive === false ? 'hidden' : 'active'),
    // categoryId (ek) → categoryIds (kai). Dono me se jo mile.
    categoryIds: Array.isArray(p.categoryIds)
      ? p.categoryIds
      : p.categoryId
        ? [p.categoryId]
        : [],
  }
}

function toMillis(value) {
  if (!value) return Date.now()
  if (typeof value === 'number') return value
  if (typeof value.toMillis === 'function') return value.toMillis()
  return Date.now()
}

// -------------------------------------------------------------- categories

export function categoryById(id) {
  return state.categories.find((c) => c.id === id)
}

/** Product ki saari categories — jo mil jayen (delete hui ho to chhoot jati hai). */
export function categoriesOf(product) {
  return (product?.categoryIds || []).map(categoryById).filter(Boolean)
}

/** Saari categories ke naam ek string me — searchBlob ke liye. */
function categoryNamesFor(categoryIds) {
  const names = (categoryIds || [])
    .map(categoryById)
    .filter(Boolean)
    .map((c) => [c.nameEn, c.nameUr].filter(Boolean).join(' '))
  return names.join(' ') || undefined
}

/**
 * Do categories kab "ek jaisi" hain: chhote-baray harf aur aage peeche ki
 * jagah ka farq nahi ginte. "Cold Drinks", "cold drinks" aur "COLD  DRINKS"
 * teenon ek hi cheez hain — warna list me ek jaisi categories jamā ho kar
 * products bikhar jate hain.
 */
function categoryKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/**
 * Ek category ke DONO naam — English aur Urdu.
 *
 * Pehle sirf English naam dekha jata tha. Us se "Milk" aur "Doodh" alag mante
 * the, halanke dono ka Urdu naam "دودھ" hai — Urdu me app khol kar dekhein to
 * do bilkul ek jaisi rows nazar aati thin aur unhein hataya bhi nahi ja sakta
 * tha, kyunki app unhein duplicate ginti hi nahi thi.
 */
function categoryKeys(cat) {
  return [categoryKey(cat?.nameEn), categoryKey(cat?.nameUr)].filter(Boolean)
}

/**
 * Isi naam ki category pehle se hai? Kisi bhi naam ka mel duplicate hai.
 * (`exceptId` khud ko chhorne ke liye.)
 */
export function findCategoryByName(data, exceptId) {
  // Purani call-sites sirf English naam bhejti thin.
  const cat = typeof data === 'string' ? { nameEn: data } : data
  const keys = new Set(categoryKeys(cat))
  if (!keys.size) return undefined
  return state.categories.find(
    (c) => c.id !== exceptId && categoryKeys(c).some((k) => keys.has(k)),
  )
}

function duplicateError() {
  const err = new Error('Ye category pehle se maujood hai')
  err.code = 'duplicate-category'
  return err
}

export async function createCategory(data) {
  if (findCategoryByName(data)) throw duplicateError()

  const sortOrder = (state.categories.length + 1) * 10
  const ref = await addDoc(col('categories'), {
    nameEn: data.nameEn.trim(),
    nameUr: data.nameUr?.trim() || null,
    icon: data.icon ?? '📦',
    sortOrder,
  })
  // Product form ko id chahiye hoti hai taake nayi category foran lag jaye.
  return ref.id
}

/**
 * Wo categories jo pehle se ek jaise naam par ban chuki hain.
 *
 * Duplicate check pehle nahi tha, is liye purane data me "Cold Drinks" aur
 * "cold drinks" jaisi joriyan mojood ho sakti hain. Har jori ka pehla (sab se
 * upar wala) `keep` hai, baqi `extras`.
 */
export function findDuplicateCategories() {
  // Ek category ka English naam ek se mil sakta hai aur Urdu naam doosri se
  // — is liye seedhi grouping kaafi nahi. Har naam ko ek "bucket" ka pata
  // dete hain, aur jahan do bucket takra jayein wahan unhein jor dete hain.
  const bucketOf = new Map() // key -> bucket index
  const buckets = [] // bucket index -> categories

  for (const cat of state.categories) {
    const keys = categoryKeys(cat)
    if (!keys.length) continue

    const hit = keys.map((k) => bucketOf.get(k)).find((b) => b !== undefined)
    if (hit === undefined) {
      buckets.push([cat])
      for (const k of keys) bucketOf.set(k, buckets.length - 1)
      continue
    }

    buckets[hit].push(cat)
    // Is category ke baqi naam bhi usi bucket ki taraf ishara karein, warna
    // teesri category jo sirf Urdu naam se milti hai wo chhoot jayegi.
    for (const k of keys) if (!bucketOf.has(k)) bucketOf.set(k, hit)
  }

  return buckets
    .filter((list) => list.length > 1)
    .map((list) => ({ keep: list[0], extras: list.slice(1) }))
}

/** App ne jo joriyan khud pakri hain, un sab ko ek saath mila deta hai. */
export async function mergeDuplicateCategories() {
  // Har zayad id ke saamne wo id jo rehni hai.
  const remap = new Map()
  for (const { keep, extras } of findDuplicateCategories()) {
    for (const extra of extras) remap.set(extra.id, keep.id)
  }
  return applyCategoryMerge(remap)
}

/**
 * Chuni hui categories ko ek me mila deta hai.
 *
 * App sirf wo joriyan khud pakarti hai jin ke naam mil jate hain. Asal dukan
 * me duplicate aksar mukhtalif naam se banti hai — "Cold Drink" aur "Cold
 * Drinks", ya "Soap" aur "Sabun". Un ke liye dukandar khud chunta hai ke
 * kaun si rehni hai.
 */
export async function mergeCategories(keepId, extraIds) {
  const remap = new Map()
  for (const id of extraIds) if (id !== keepId) remap.set(id, keepId)
  return applyCategoryMerge(remap)
}

/**
 * Products delete NAHI hote — jo product zayad category me tha wo `keep` wali
 * category me chala jata hai, phir zayad category hat jati hai.
 */
async function applyCategoryMerge(remap) {
  if (!remap.size) return { merged: 0, products: 0 }

  const ops = []
  const touched = new Set()

  for (const p of state.products) {
    const ids = p.categoryIds || []
    if (!ids.some((id) => remap.has(id))) continue

    // Naye ids me duplicate na rahe.
    const next = [...new Set(ids.map((id) => remap.get(id) ?? id))]
    touched.add(p.id)
    ops.push((batch) =>
      batch.update(doc(col('products'), p.id), {
        categoryIds: next,
        searchBlob: buildSearchBlob(p, categoryNamesFor(next)),
      }),
    )
  }

  for (const extraId of remap.keys()) {
    ops.push((batch) => batch.delete(doc(col('categories'), extraId)))
  }

  await commitInChunks(ops)
  return { merged: remap.size, products: touched.size }
}

export async function updateCategory(id, changes) {
  if ((changes.nameEn || changes.nameUr) && findCategoryByName(changes, id)) throw duplicateError()

  await updateDoc(doc(col('categories'), id), changes)
  // Category ka naam products ke searchBlob ka hissa hai — lekin sirf usi
  // category ke products ka.
  await rebuildSearchBlobs(id)
}

/**
 * Category delete hone par uske products DELETE NAHI hote — sirf us category
 * se nikal jate hain. Ghalti se poora stock gum ho jana bura hoga.
 */
export async function deleteCategory(id) {
  const affected = state.products.filter((p) => (p.categoryIds || []).includes(id))

  const ops = [(batch) => batch.delete(doc(col('categories'), id))]
  for (const p of affected) {
    const remaining = (p.categoryIds || []).filter((c) => c !== id)
    ops.push((batch) =>
      batch.update(doc(col('products'), p.id), {
        categoryIds: remaining,
        // Purana single field bhi saaf kar dete hain warna migration wapas
        // usay zinda kar degi.
        categoryId: null,
        searchBlob: buildSearchBlob(p, categoryNamesFor(remaining)),
      }),
    )
  }
  await commitInChunks(ops)
}

// ---------------------------------------------------------------- products

export function productById(id) {
  return state.products.find((p) => p.id === id)
}

export async function createProduct(input) {
  const stockQty = round3(input.stockQty || 0)
  const payload = {
    ...cleanUndefined(input),
    stockQty,
    searchBlob: buildSearchBlob(input, categoryNamesFor(input.categoryIds)),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  const ref = await addDoc(col('products'), payload)

  // Opening stock bhi history me aana chahiye, warna hisaab poora nahi hota.
  if (stockQty !== 0) {
    await addDoc(col('movements'), {
      productId: ref.id,
      type: 'in',
      qty: Math.abs(stockQty),
      reason: 'initial',
      balanceAfter: stockQty,
      createdAt: serverTimestamp(),
    })
  }
  return ref.id
}

/**
 * NOTE: ye stockQty ko haath nahi lagata. Stock badalne ke liye hamesha
 * adjustStock() ya setStockCount() istemaal karein.
 */
export async function updateProduct(id, changes) {
  const existing = productById(id)
  if (!existing) throw new Error('Product nahi mila')

  const merged = { ...existing, ...changes }
  await updateDoc(doc(col('products'), id), {
    ...cleanUndefined(changes),
    searchBlob: buildSearchBlob(merged, categoryNamesFor(merged.categoryIds)),
    updatedAt: serverTimestamp(),
  })
}

export async function deleteProduct(id) {
  const product = productById(id)

  // Us product ki saari movements bhi saath jaani chahiye. Purane product ki
  // sainkron movements ho sakti hain, is liye chunks me.
  const snap = await getDocs(query(col('movements'), where('productId', '==', id)))

  const ops = [(batch) => batch.delete(doc(col('products'), id))]
  for (const d of snap.docs) ops.push((batch) => batch.delete(d.ref))
  if (product?.imageId) {
    ops.push((batch) => batch.delete(doc(col('images'), product.imageId)))
  }
  await commitInChunks(ops)
}

/**
 * Category ka naam badle to us ke products ka searchBlob refresh karna parta hai.
 *
 * `categoryId` diya ho to sirf USI category ke products dobara likhte hain.
 * Pehle har rename par dukan ka HAR product dobara likha jata tha — 500
 * products wali dukan me ek naam badalne par 500 writes, jabke asal me shayad
 * 10 hi mutasir hote hain.
 */
export async function rebuildSearchBlobs(categoryId) {
  const affected = categoryId
    ? state.products.filter((p) => (p.categoryIds || []).includes(categoryId))
    : state.products
  if (!affected.length) return

  const ops = affected.map((p) => (batch) =>
    batch.update(doc(col('products'), p.id), {
      searchBlob: buildSearchBlob(p, categoryNamesFor(p.categoryIds)),
    }),
  )
  await commitInChunks(ops)
}

// ------------------------------------------------------------------- stock

/**
 * Stock badalne ka waahid tareeqa.
 *
 * Product ka stockQty transaction ke andar parha aur likha jata hai, aur
 * movement ka record usi transaction me banta hai — is liye history kabhi
 * asal stock se mismatch nahi hoti, chahe do device ek saath chal rahe hon.
 */
/**
 * Firestore ka transaction server se baat kiye bagair nahi chalta — internet
 * na ho to wo latak jata hai. Dukan par internet jana aam baat hai, aur stock
 * badalna app ka sab se zaroori kaam hai, is liye offline hone par batched
 * write par gir jate hain: wo cache me likh kar internet aane par khud sync
 * ho jati hai.
 *
 * Farq itna hai ke offline me naya stock LOCAL cache se ginaa jata hai, server
 * se parh kar nahi. Ek hi dukan ke ek device par ye bilkul theek hai; do device
 * ek saath offline chalein to ginti me farq aa sakta hai — is liye movement par
 * `offline: true` likh dete hain taake baad me pata chal sake.
 */
async function writeStockChange({ productId, amount, type, reason, note, absolute }) {
  const productRef = doc(col('products'), productId)
  const movementRef = doc(col('movements'))

  const buildMovement = (balanceAfter, qty, offline) => ({
    productId,
    type,
    qty,
    reason,
    note: note || null,
    balanceAfter,
    createdAt: serverTimestamp(),
    ...(offline ? { offline: true } : {}),
  })

  if (navigator.onLine) {
    try {
      return await runTransaction(dbf, async (tx) => {
        const snap = await tx.get(productRef)
        if (!snap.exists()) throw new Error('Product nahi mila')

        const current = Number(snap.data().stockQty || 0)
        const balanceAfter =
          absolute !== undefined
            ? round3(Math.max(0, absolute))
            : // Stock manfi nahi ho sakta — warna inventory value ulti ho jati hai.
              round3(Math.max(0, current + (type === 'in' ? amount : -amount)))
        const qty = absolute !== undefined ? Math.abs(round3(balanceAfter - current)) : amount

        tx.update(productRef, { stockQty: balanceAfter, updatedAt: serverTimestamp() })
        tx.set(movementRef, buildMovement(balanceAfter, qty, false))
        return balanceAfter
      })
    } catch (err) {
      // Sirf internet ki wajah se nakami par neeche wale raaste par jate hain.
      //
      // Pehle yahan ulta likha tha: do soorton ke ilawa HAR ghalti par fallback
      // ho jata tha. Yaani do device ek saath likhein aur transaction takra kar
      // `aborted` de, to app local cache ki (mumkin hai purani) ginti par naya
      // stock likh deti thi. Stock ka ghalat hona is app ki sab se buri kharabi
      // hai, is liye ab sirf wo ghaltiyan maaf hain jo waqai internet ki hain.
      const network = err?.code === 'unavailable' || err?.code === 'deadline-exceeded'
      if (!network) throw err
    }
  }

  // ---- offline raasta ----
  const local = productById(productId)
  if (!local) throw new Error('Product nahi mila')

  const current = Number(local.stockQty || 0)
  const balanceAfter =
    absolute !== undefined
      ? round3(Math.max(0, absolute))
      : round3(Math.max(0, current + (type === 'in' ? amount : -amount)))
  const qty = absolute !== undefined ? Math.abs(round3(balanceAfter - current)) : amount

  const batch = writeBatch(dbf)
  batch.update(productRef, { stockQty: balanceAfter, updatedAt: serverTimestamp() })
  batch.set(movementRef, buildMovement(balanceAfter, qty, true))
  // Offline me commit ka promise internet aane tak pura nahi hota — is liye
  // us ka intezar nahi karte, cache me likhai foran ho chuki hoti hai.
  batch.commit().catch(() => {})

  return balanceAfter
}

export async function adjustStock({ productId, qty, type, reason, note }) {
  const amount = Math.abs(round3(qty))
  if (!amount) throw new Error('Quantity zero nahi ho sakti')
  return writeStockChange({ productId, amount, type, reason, note })
}

/** Ginti kar ke stock theek karna — "abhi asal me itna para hai". */
export async function setStockCount(productId, countedQty, note) {
  return writeStockChange({
    productId,
    type: 'adjust',
    reason: 'correction',
    note,
    absolute: round3(Math.max(0, countedQty)),
  })
}

/**
 * Ek product ki apni poori history.
 *
 * Pehle ye `state.movements` se filter karta tha — lekin wo poori shop ki
 * sirf aakhri 100 movements rakhta hai, is liye shop me 100 nayi entries hote
 * hi purane product ki history KHALI dikhne lagti thi (halanke data mehfooz tha).
 * Ab har product ki apni query chalti hai.
 *
 * `orderBy` jaan boojh kar nahi lagaya: equality filter + doosre field par
 * orderBy Firestore me composite index maangta hai, aur wo user ko console me
 * khud banana parta. Tarteeb yahan JS me laga lete hain.
 */
export const PRODUCT_HISTORY_LIMIT = 200

export function watchProductMovements(productId, callback, onError) {
  return onSnapshot(
    query(col('movements'), where('productId', '==', productId)),
    (snap) => {
      const rows = snap.docs.map(withId)
      rows.sort((a, b) => b.createdAt - a.createdAt)
      // Saalon baad ek product ki hazaaron movements ho sakti hain; screen par
      // itni dikhana na mumkin hai na kaam ka. Data poora mehfooz rehta hai.
      callback(rows.slice(0, PRODUCT_HISTORY_LIMIT), rows.length)
    },
    onError,
  )
}

// ------------------------------------------------------------------ images

/**
 * Tasveerein products se ALAG collection me hain.
 *
 * Pehle base64 tasveer product ke apne document me thi — is ka matlab tha ke
 * products ki list load karne par har tasveer bhi download hoti thi (200
 * products ≈ 19 MB). Ab product me sirf `imageId` hai, aur tasveer tab load
 * hoti hai jab dikhani ho. Firestore ka cache use aage ke liye rakh leta hai.
 */
const imageCache = new Map()

export async function saveImage(dataUrl) {
  const ref = await addDoc(col('images'), { data: dataUrl, createdAt: serverTimestamp() })
  imageCache.set(ref.id, dataUrl)
  return ref.id
}

export async function loadImage(imageId) {
  if (!imageId) return null
  if (imageCache.has(imageId)) return imageCache.get(imageId)

  try {
    const snap = await getDoc(doc(col('images'), imageId))
    const data = snap.exists() ? snap.data().data : null
    imageCache.set(imageId, data)
    return data
  } catch {
    return null
  }
}

export async function deleteImage(imageId) {
  if (!imageId) return
  imageCache.delete(imageId)
  try {
    await deleteDoc(doc(col('images'), imageId))
  } catch {
    // Tasveer pehle hi ja chuki ho to koi baat nahi.
  }
}

// ---------------------------------------------------------------- settings

export async function saveSetting(key, value) {
  // merge:true isliye ke shop document pehli baar bhi ban jaye.
  await setDoc(shopRef(), { [key]: value }, { merge: true })
}

// ------------------------------------------------------------------- seed

const DEFAULT_CATEGORIES = [
  { nameEn: 'Grains & Pulses', nameUr: 'اناج و دالیں', icon: '🌾' },
  { nameEn: 'Cooking Oil & Ghee', nameUr: 'تیل و گھی', icon: '🛢️' },
  { nameEn: 'Spices & Masala', nameUr: 'مصالحہ جات', icon: '🌶️' },
  { nameEn: 'Dairy & Eggs', nameUr: 'دودھ و انڈے', icon: '🥛' },
  { nameEn: 'Tea, Sugar & Drinks', nameUr: 'چائے، چینی و مشروبات', icon: '☕' },
  { nameEn: 'Biscuits & Snacks', nameUr: 'بسکٹ و اسنیکس', icon: '🍪' },
  { nameEn: 'Bakery', nameUr: 'بیکری', icon: '🍞' },
  { nameEn: 'Soap & Detergent', nameUr: 'صابن و سرف', icon: '🧼' },
  { nameEn: 'Personal Care', nameUr: 'ذاتی نگہداشت', icon: '🪥' },
  { nameEn: 'Household', nameUr: 'گھریلو سامان', icon: '🧹' },
  { nameEn: 'Frozen & Cold', nameUr: 'فروزن', icon: '🧊' },
  { nameEn: 'Other', nameUr: 'متفرق', icon: '📦' },
]

export async function seedDefaultCategories() {
  // `state.categories` khali hone ka matlab hamesha ye nahi ke dukan me
  // categories nahi hain — ho sakta hai un ka pehla snapshot abhi aaya hi na
  // ho. App `ready` products ki list par karti hai, jo khali dukan me foran
  // aa jati hai, aur us lamhe categories abhi raste me hoti hain. Isi wajah
  // se har sign-in par default categories dobara ban jati thin: teen martaba
  // login karne wale ko har category teen baar nazar aati thi.
  //
  // Server se poochna hi bharosay ke laiq hai. Ye ek hi baar hota hai.
  const existing = await getDocs(col('categories'))
  if (!existing.empty) return 0

  const batch = writeBatch(dbf)
  DEFAULT_CATEGORIES.forEach((cat, i) => {
    batch.set(doc(col('categories')), { ...cat, sortOrder: (i + 1) * 10 })
  })
  await batch.commit()
  return DEFAULT_CATEGORIES.length
}

// ------------------------------------------------------------------ export

/**
 * Data ki mukammal local copy.
 *
 * Tasveerein ab alag collection me hain, is liye unhe alag se mangwana parta
 * hai — warna backup file me products to hote lekin tasveerein gum ho jatin.
 * Movements bhi seedha server se, kyunki `state.movements` sirf aakhri 100
 * rakhta hai.
 */
export async function buildExport() {
  const [movementSnap, imageSnap] = await Promise.all([
    getDocs(col('movements')),
    getDocs(col('images')),
  ])

  return {
    app: 'karyana-shop',
    version: 5,
    exportedAt: new Date().toISOString(),
    settings: state.settings,
    categories: state.categories,
    products: state.products,
    movements: movementSnap.docs.map(withId),
    images: imageSnap.docs.map((d) => ({ id: d.id, data: d.data().data })),
  }
}

export function isValidExport(value) {
  return (
    value &&
    typeof value === 'object' &&
    value.app === 'karyana-shop' &&
    Array.isArray(value.products) &&
    Array.isArray(value.categories)
  )
}

/**
 * Backup file wapas load karna.
 *
 * `replace` — pehle sab kuch mita kar file ka data daalo (IDs wahi rehti hain).
 * `merge`   — maujooda data rakho aur file ka data NAYI ids ke saath daalo,
 *             taake ek jaisi id wala record kisi ka data na mita de.
 *
 * Export honay ke bagair restore ka koi matlab nahi tha — file to ban jati thi
 * lekin usay wapas daalne ka koi raasta hi nahi tha.
 */
export async function restoreExport(data, mode = 'merge') {
  if (!isValidExport(data)) throw new Error('invalid-backup')

  const strip = (o) => {
    const { id: _id, ...rest } = o
    void _id
    return cleanUndefined(rest)
  }

  if (mode === 'replace') {
    // TARTEEB AHEM HAI: pehle likho, phir jo bacha wo hatao.
    //
    // Pehle ulta tha — poori dukan delete ho jati thi aur phir file ka data
    // likha jata tha. Beech me internet chala jaye, browser band ho jaye, ya
    // ek batch fail ho jaye, to dukandar ke paas kuch bhi nahi bachta tha: na
    // purana data, na naya. Ab har lamhe dukan me poora data mojood rehta hai.
    // Restore adhoora reh jaye to sab se bura yehi hoga ke kuch purane record
    // bache reh jayen — jo mit jane se bohat behtar hai.
    const incoming = [
      ['categories', data.categories, (c) => strip(c)],
      ['products', data.products, (p) => strip(p)],
      ['movements', data.movements || [], (m) => strip(m)],
      ['images', data.images || [], (img) => ({ data: img.data })],
      // Bikri wala hissa nikal diya gaya hai; purane data me `sales` bache ho
      // sakte hain, aur "replace" ka matlab hai poori safai.
      ['sales', [], null],
    ]

    const existing = await Promise.all(incoming.map(([name]) => getDocs(col(name))))

    const ops = []
    for (const [name, rows, shape] of incoming) {
      for (const row of rows) ops.push((b) => b.set(doc(col(name), row.id), shape(row)))
    }
    await commitInChunks(ops)

    // Ids wahi rehti hain, is liye upar wali likhai ne file wale record pehle
    // hi nayi shakal me daal diye — sirf jo bacha hua hai wo hatate hain.
    const deletions = []
    existing.forEach((snap, i) => {
      const keep = new Set(incoming[i][1].map((row) => row.id))
      for (const d of snap.docs) {
        if (!keep.has(d.id)) deletions.push((batch) => batch.delete(d.ref))
      }
    })
    await commitInChunks(deletions)
  } else {
    // Nayi ids banti hain, is liye purani → nayi ka naqsha rakhna parta hai.
    const catMap = new Map()
    const imgMap = new Map()
    const prodMap = new Map()

    const ops = []

    // Isi naam ki category pehle se maujood ho to NAYI nahi banti — us ke
    // products seedha purani category me chale jate hain.
    //
    // Warna backup wapas daalte hi har category do baar ho jati thi: dukan me
    // pehle se "اناج و دالیں" hai, file me bhi hai, aur merge dono rakh leta
    // tha. Yehi baat file ke andar ki apni duplicate categories par bhi lagti
    // hai, is liye jo abhi is chakkar me banai hain unhein bhi yaad rakhte hain.
    const madeHere = new Map() // naam ki key → nayi id
    for (const c of data.categories) {
      const keys = categoryKeys(c)
      const existingId = findCategoryByName(c)?.id ?? keys.map((k) => madeHere.get(k)).find(Boolean)
      if (existingId) {
        catMap.set(c.id, existingId)
        continue
      }
      const ref = doc(col('categories'))
      catMap.set(c.id, ref.id)
      for (const k of keys) madeHere.set(k, ref.id)
      ops.push((b) => b.set(ref, strip(c)))
    }
    for (const img of data.images || []) {
      const ref = doc(col('images'))
      imgMap.set(img.id, ref.id)
      ops.push((b) => b.set(ref, { data: img.data }))
    }
    for (const p of data.products) {
      const ref = doc(col('products'))
      prodMap.set(p.id, ref.id)
      ops.push((b) =>
        b.set(ref, {
          ...strip(p),
          categoryIds: (p.categoryIds || []).map((id) => catMap.get(id)).filter(Boolean),
          imageId: p.imageId ? (imgMap.get(p.imageId) ?? null) : null,
        }),
      )
    }
    for (const m of data.movements || []) {
      const newProductId = prodMap.get(m.productId)
      if (!newProductId) continue
      ops.push((b) => b.set(doc(col('movements')), { ...strip(m), productId: newProductId }))
    }
    await commitInChunks(ops)
  }

  return {
    products: data.products.length,
    categories: data.categories.length,
    movements: (data.movements || []).length,
    images: (data.images || []).length,
  }
}

// ----------------------------------------------------------------- helpers

/** Firestore `undefined` reject karta hai — use `null` bana dete hain. */
function cleanUndefined(obj) {
  const out = {}
  for (const [key, value] of Object.entries(obj)) {
    out[key] = value === undefined ? null : value
  }
  return out
}
