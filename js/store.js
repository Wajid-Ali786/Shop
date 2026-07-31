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
  }
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

/** Isi naam ki category pehle se hai? (`exceptId` khud ko chhorne ke liye.) */
export function findCategoryByName(name, exceptId) {
  const key = categoryKey(name)
  if (!key) return undefined
  return state.categories.find((c) => c.id !== exceptId && categoryKey(c.nameEn) === key)
}

function duplicateError() {
  const err = new Error('Ye category pehle se maujood hai')
  err.code = 'duplicate-category'
  return err
}

export async function createCategory(data) {
  if (findCategoryByName(data.nameEn)) throw duplicateError()

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

export async function updateCategory(id, changes) {
  if (changes.nameEn && findCategoryByName(changes.nameEn, id)) throw duplicateError()

  await updateDoc(doc(col('categories'), id), changes)
  // Category ka naam products ke searchBlob ka hissa hai.
  await rebuildSearchBlobs()
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

/** Category ka naam badle to us ke products ka searchBlob refresh karna parta hai. */
export async function rebuildSearchBlobs() {
  if (!state.products.length) return
  const ops = state.products.map((p) => (batch) =>
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
export async function adjustStock({ productId, qty, type, reason, note }) {
  const amount = Math.abs(round3(qty))
  if (!amount) throw new Error('Quantity zero nahi ho sakti')

  const productRef = doc(col('products'), productId)
  const movementRef = doc(col('movements'))

  return runTransaction(dbf, async (tx) => {
    const snap = await tx.get(productRef)
    if (!snap.exists()) throw new Error('Product nahi mila')

    const current = Number(snap.data().stockQty || 0)
    const delta = type === 'in' ? amount : -amount
    // Stock manfi nahi ho sakta — warna inventory value ka hisaab ulta ho jata hai.
    const balanceAfter = round3(Math.max(0, current + delta))

    tx.update(productRef, { stockQty: balanceAfter, updatedAt: serverTimestamp() })
    tx.set(movementRef, {
      productId,
      type,
      qty: amount,
      reason,
      note: note || null,
      balanceAfter,
      createdAt: serverTimestamp(),
    })
    return balanceAfter
  })
}

/** Ginti kar ke stock theek karna — "abhi asal me itna para hai". */
export async function setStockCount(productId, countedQty, note) {
  const target = round3(Math.max(0, countedQty))
  const productRef = doc(col('products'), productId)
  const movementRef = doc(col('movements'))

  return runTransaction(dbf, async (tx) => {
    const snap = await tx.get(productRef)
    if (!snap.exists()) throw new Error('Product nahi mila')

    const current = Number(snap.data().stockQty || 0)
    tx.update(productRef, { stockQty: target, updatedAt: serverTimestamp() })
    tx.set(movementRef, {
      productId,
      type: 'adjust',
      qty: Math.abs(round3(target - current)),
      reason: 'correction',
      note: note || null,
      balanceAfter: target,
      createdAt: serverTimestamp(),
    })
    return target
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
export function watchProductMovements(productId, callback, onError) {
  return onSnapshot(
    query(col('movements'), where('productId', '==', productId)),
    (snap) => {
      const rows = snap.docs.map(withId)
      rows.sort((a, b) => b.createdAt - a.createdAt)
      callback(rows)
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
  if (state.categories.length > 0) return 0
  const batch = writeBatch(dbf)
  DEFAULT_CATEGORIES.forEach((cat, i) => {
    batch.set(doc(col('categories')), { ...cat, sortOrder: (i + 1) * 10 })
  })
  await batch.commit()
  return DEFAULT_CATEGORIES.length
}

// ------------------------------------------------------------------ export

/** Data ki ek local copy — Firebase pehle se mehfooz hai, ye bas tasalli ke liye. */
export function buildExport() {
  return {
    app: 'karyana-shop',
    version: 2,
    exportedAt: new Date().toISOString(),
    settings: state.settings,
    categories: state.categories,
    products: state.products,
    movements: state.movements,
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
