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
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  limit,
  startAfter,
  where,
  writeBatch,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from 'https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js'

import { dbf, currentUid } from './firebase.js'
import { buildSearchBlob } from './lib/search.js'
import { round3 } from './lib/units.js'

// ------------------------------------------------------------------ state

export const state = {
  products: [],
  categories: [],
  movements: [],
  // Udhaar khata — sirf dukandar tak, grahak wali list me kabhi nahi.
  khataParties: [],
  khataCategories: [],
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
    // Yaad-dihani kitne din baad. 0 = band.
    backupReminderDays: 14,
    // Stock history kitne din rakhni hai. 0 = hamesha.
    historyKeepDays: 180,
    // Aakhri dafa kab saaf ki (ya yaad dilai) — millis.
    lastHistoryCleanupAt: null,
    // Grahak wala catalog (bina login ke dikhne wali list) chalu hai ya nahi.
    publicCatalog: false,
  }
}

/**
 * Backup ki yaad-dihani kitne din baad aaye — dukandar khud chunta hai.
 *
 * Data Firebase me hai, is liye phone tootne ya kho jane se kuch nahi jata.
 * Backup us se bachata hai jo Firebase nahi rok sakta: ghalti se product ya
 * category delete kar dena, ya account tak rasai khatam ho jana.
 *
 * `0` ka matlab yaad-dihani band.
 */
export const BACKUP_REMINDER_CHOICES = [7, 14, 30, 60, 0]
export const DEFAULT_BACKUP_REMINDER_DAYS = 14

export function backupReminderDays(settings = state.settings) {
  const days = Number(settings.backupReminderDays)
  return Number.isFinite(days) && days >= 0 ? days : DEFAULT_BACKUP_REMINDER_DAYS
}

/** Backup ki yaad-dihani dikhani chahiye? */
export function backupDue(settings = state.settings) {
  const days = backupReminderDays(settings)
  if (!days) return false // dukandar ne band kar rakhi hai
  if (!state.products.length) return false // khali dukan ka backup bay-maani hai
  const last = settings.lastBackupAt
  if (!last) return true
  return Date.now() - last > days * 24 * 60 * 60 * 1000
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

/**
 * Wahi kaam, magar offline atakta nahi.
 *
 * Firestore offline hone par `commit()` ka wada internet aane tak poora nahi
 * karta — likhai local cache me FORAN ho jati hai, sirf server ki tasdeeq baqi
 * rehti hai. Jo jagah us wade ka intezar karti hai wahan button hamesha ke
 * liye ghoomta reh jata hai aur dukandar ko lagta hai kuch save hi nahi hua.
 *
 * Is liye offline me intezar nahi karte. Data phir bhi mehfooz hai: cache me
 * likha ja chuka hai aur Firestore internet aate hi khud bhej deta hai.
 */
async function commitSoon(ops) {
  if (navigator.onLine) return commitInChunks(ops)
  commitInChunks(ops).catch(() => {})
}

/**
 * Ek likhai, usi usool par.
 *
 * `updateDoc`/`deleteDoc` ka wada bhi offline poora nahi hota. Jo jagah us ka
 * intezar karti hai wahan sheet band hi nahi hoti aur "Save" ghoomta reh jata
 * hai — halankay likhai local cache me ho chuki hoti hai aur screen par nazar
 * bhi aa rahi hoti hai. Ye TAB ahem hai jab dukandar ka internet aata jata ho,
 * jo asal dukan me aam baat hai.
 */
function writeSoon(promise) {
  if (navigator.onLine) return promise
  promise.catch(() => {})
  return Promise.resolve()
}


/** Paison ka hisaab — do hindse se aage jaane ka koi matlab nahi. */
function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100
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
      query(col('khataParties'), orderBy('name')),
      (snap) => {
        state.khataParties = snap.docs.map(withId)
        emit()
      },
      onError,
    ),
    onSnapshot(
      query(col('khataCategories'), orderBy('sortOrder')),
      (snap) => {
        state.khataCategories = snap.docs.map(withId)
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
  state.khataParties = []
  state.khataCategories = []
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
  const ref = doc(col('categories'))
  await writeSoon(
    setDoc(ref, {
      nameEn: data.nameEn.trim(),
      nameUr: data.nameUr?.trim() || null,
      icon: data.icon ?? '📦',
      sortOrder,
    }),
  )
  await syncPublicCategories()
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

  // Grahak wali list bhi milne ke baad ki halat dikhaye.
  await syncPublicCategories()
  for (const p of state.products) {
    if (touched.has(p.id)) {
      await syncPublicProduct({
        ...p,
        categoryIds: [...new Set((p.categoryIds || []).map((id) => remap.get(id) ?? id))],
      })
    }
  }

  return { merged: remap.size, products: touched.size }
}

export async function updateCategory(id, changes) {
  if ((changes.nameEn || changes.nameUr) && findCategoryByName(changes, id)) throw duplicateError()

  await writeSoon(updateDoc(doc(col('categories'), id), changes))
  // Category ka naam products ke searchBlob ka hissa hai — lekin sirf usi
  // category ke products ka.
  await rebuildSearchBlobs(id)
  await syncPublicCategories()
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

  await syncPublicCategories()
  for (const p of affected) {
    await syncPublicProduct({
      ...p,
      categoryIds: (p.categoryIds || []).filter((c) => c !== id),
    })
  }
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

  const ref = doc(col('products'))
  await writeSoon(setDoc(ref, payload))

  // Opening stock bhi history me aana chahiye, warna hisaab poora nahi hota.
  if (stockQty !== 0) {
    await writeSoon(
      setDoc(doc(col('movements')), {
        productId: ref.id,
        type: 'in',
        qty: Math.abs(stockQty),
        reason: 'initial',
        balanceAfter: stockQty,
        createdAt: serverTimestamp(),
      }),
    )
  }

  // Grahak wali list bhi taza — catalog band ho to ye kuch nahi karta.
  await syncPublicProduct({ ...input, id: ref.id })
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
  await writeSoon(
    updateDoc(doc(col('products'), id), {
      ...cleanUndefined(changes),
      searchBlob: buildSearchBlob(merged, categoryNamesFor(merged.categoryIds)),
      updatedAt: serverTimestamp(),
    }),
  )

  await syncPublicProduct({ ...merged, id })
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

  await removePublicProduct(id)
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
  const balance = await writeStockChange({ productId, amount, type, reason, note })
  await syncPublicStock(productId, balance)
  return balance
}

/** Ginti kar ke stock theek karna — "abhi asal me itna para hai". */
export async function setStockCount(productId, countedQty, note) {
  const balance = await writeStockChange({
    productId,
    type: 'adjust',
    reason: 'correction',
    note,
    absolute: round3(Math.max(0, countedQty)),
  })
  await syncPublicStock(productId, balance)
  return balance
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
  const ref = doc(col('images'))
  await writeSoon(setDoc(ref, { data: dataUrl, createdAt: serverTimestamp() }))
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
    await writeSoon(deleteDoc(doc(col('images'), imageId)))
  } catch {
    // Tasveer pehle hi ja chuki ho to koi baat nahi.
  }
}

// ---------------------------------------------------------------- settings

export async function saveSetting(key, value) {
  // merge:true isliye ke shop document pehli baar bhi ban jaye.
  await writeSoon(setDoc(shopRef(), { [key]: value }, { merge: true }))
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

  await commitSoon(
    DEFAULT_CATEGORIES.map((cat, i) => (batch) =>
      batch.set(doc(col('categories')), { ...cat, sortOrder: (i + 1) * 10 }),
    ),
  )
  return DEFAULT_CATEGORIES.length
}

// -------------------------------------------------------------- udhaar khata

/**
 * Udhaar khata — kis ne dukan ka kitna dena hai.
 *
 * Teen cheezein hain aur teenon `shops/{uid}` ke andar, yaani sirf dukandar
 * tak mehdood. Grahak wali public list me ye kabhi nahi jatin: wahan har field
 * `publicShapeOf()` me haath se ginti hai, is liye nayi collection khud-ba-khud
 * kabhi public nahi hoti. Ye chup chaap nahi chhoRa — udhaar ka data aam hona
 * sab se bara nuqsaan hota.
 *
 * `balance` kabhi haath se nahi likha jata. Har entry ek hi transaction me
 * party ka balance aur entry ka record likhti hai — wahi tareeqa jo stock me
 * pehle se chal raha hai — taake history aur balance kabhi alag na hon.
 */

/** Shuruati categories — teenon ka naam, icon, sab dukandar badal sakta hai. */
const DEFAULT_KHATA_CATEGORIES = [
  { nameEn: 'Small', nameUr: 'چھوٹا', icon: '🟢' },
  { nameEn: 'Big', nameUr: 'بڑا', icon: '🔴' },
  { nameEn: 'Temporary', nameUr: 'عارضی', icon: '⏳' },
]

export function khataPartyById(id) {
  return state.khataParties.find((p) => p.id === id) || null
}

export function khataCategoryById(id) {
  return state.khataCategories.find((c) => c.id === id) || null
}

/**
 * Kul kitna lena hai, aur kitne logon se.
 *
 * Sirf wo khate ginte hain jin par kuch baqi hai. Jin ka hisaab barabar ho
 * chuka wo ginti me aa kar sirf tasveer dhundli karte hain.
 */
export function khataTotals() {
  let total = 0
  let people = 0
  // Jin logon ne apna paisa dukan me jama karaya hua hai un ka balance manfi
  // hota hai. Unhe "lena hai" me ginna sab se bara jhoot hoga, is liye alag.
  let deposit = 0
  let depositPeople = 0

  for (const party of state.khataParties) {
    const balance = Number(party.balance || 0)
    if (balance > 0) {
      total += balance
      people += 1
    }
    const jama = Number(party.deposit || 0)
    if (jama > 0) {
      deposit += jama
      depositPeople += 1
    }
  }
  return {
    total: roundMoney(total),
    people,
    deposit: roundMoney(deposit),
    depositPeople,
  }
}

export async function createKhataParty(data) {
  const ref = doc(col('khataParties'))
  await writeSoon(
    setDoc(ref, {
      name: (data.name || '').trim(),
      phone: data.phone?.trim() || null,
      note: data.note?.trim() || null,
      categoryIds: data.categoryIds || [],
      // Naya khata hamesha sifar se shuru — raqam sirf entry se aati hai.
      balance: 0,
      deposit: 0,
      /*
       * Jama karane ka option har khate par nahi.
       *
       * Sirf kuch log paisa dukan me rakhte hain. Har khate par do fazool
       * button lagana rozana ka kaam bhaari kar deta hai, is liye ye dukandar
       * khud chalu karta hai — us khaas grahak ke liye.
       */
      hasDeposit: Boolean(data.hasDeposit),
      status: 'active',
      lastEntryAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  )
  return ref.id
}

export async function updateKhataParty(id, changes) {
  // `balance` aur `deposit` yahan se kabhi nahi badalte — wo sirf entry likhne
  // par badalte hain. Warna ek edit poori history ko jhoota kar deta.
  const { balance, deposit, ...safe } = changes
  await writeSoon(
    updateDoc(doc(col('khataParties'), id), { ...safe, updatedAt: serverTimestamp() }),
  )
}

/** Khata mitane par us ki poori history bhi jati hai — warna kachra reh jata. */
export async function deleteKhataParty(id) {
  const snap = await getDocs(query(col('khataEntries'), where('partyId', '==', id)))
  const ops = [(batch) => batch.delete(doc(col('khataParties'), id))]
  for (const d of snap.docs) ops.push((batch) => batch.delete(doc(col('khataEntries'), d.id)))
  await commitSoon(ops)
}

// ---- khata categories (products wali se bilkul alag) ----

export async function createKhataCategory(data) {
  const ref = doc(col('khataCategories'))
  await writeSoon(
    setDoc(ref, {
      nameEn: (data.nameEn || '').trim(),
      nameUr: data.nameUr?.trim() || null,
      icon: data.icon || '📓',
      sortOrder: data.sortOrder ?? (state.khataCategories.length + 1) * 10,
      createdAt: serverTimestamp(),
    }),
  )
  return ref.id
}

export async function updateKhataCategory(id, changes) {
  await writeSoon(updateDoc(doc(col('khataCategories'), id), changes))
}

/** Category mitne par khate nahi mitte — sirf un par se ye nishan hat jata hai. */
export async function deleteKhataCategory(id) {
  const ops = [(batch) => batch.delete(doc(col('khataCategories'), id))]
  for (const party of state.khataParties) {
    if ((party.categoryIds || []).includes(id)) {
      ops.push((batch) =>
        batch.update(doc(col('khataParties'), party.id), {
          categoryIds: party.categoryIds.filter((c) => c !== id),
          updatedAt: serverTimestamp(),
        }),
      )
    }
  }
  await commitInChunks(ops)
}

export async function seedKhataCategories() {
  // Wahi ehtiyat jo products wali categories me hai: server se poochte hain,
  // local list se nahi — warna har login par teen nayi ban jatin.
  const existing = await getDocs(col('khataCategories'))
  if (!existing.empty) return 0

  await commitSoon(
    DEFAULT_KHATA_CATEGORIES.map((cat, i) => (batch) =>
      batch.set(doc(col('khataCategories')), { ...cat, sortOrder: (i + 1) * 10 }),
    ),
  )
  return DEFAULT_KHATA_CATEGORIES.length
}

// ---- entries ----

/**
 * Ek lein dein likhna.
 *
 * `type`:
 *   'diya' — udhaar diya (balance barhta hai)
 *   'mila' — paisay milay (balance ghatta hai)
 *
 * `items` — kya le kar gaya. Har cheez ya to app ki product hai (`productId`)
 * ya sirf likhi hui (`text`). Product chunne se **stock nahi badalta** — ye
 * jaan boojh kar hai: khata sirf hisaab ka record hai, maal ka nahi. Stock
 * pehle ki tarah Stock wale hisse se hi badalta hai.
 *
 * `collectedBy` — kaun aaya tha lene. Aksar khata kisi aur ka hota hai aur
 * lene koi aur aata hai (bachcha, mulazim, parosi). Wo naam yahan likha jata
 * hai, warna baad me jhagra hota hai ke "maine to liya hi nahi tha".
 */
/**
 * Lein dein ki qismein.
 *
 * Hisaab ke lehaz se sirf DO simtein hain — balance barhta hai ya ghatta hai.
 * Magar dukandar ke liye chaar alag baatein hain, aur history me un ka farq
 * nazar aana chahiye:
 *
 *   udhaar  (+) maal udhaar diya
 *   wapas   (+) grahak apna jama karaya hua paisa wapas le gaya
 *   milay   (−) grahak ne khata chukaya
 *   jama    (−) grahak apna paisa dukandar ke paas rakh gaya
 *
 * `jama` wali soorat asli hai aur aam bhi: mohalle ke log paisa dukandar ke
 * paas rakh jate hain, phir thora thora le kar jate hain ya usi se apna khata
 * saaf karwa lete hain. Aisi soorat me balance MANFI ho jata hai — jis ka
 * matlab hai dukandar ne dena hai, lena nahi.
 */
/**
 * Har qism kis hisaab ko chhuti hai, aur kis simt me.
 *
 * DO ALAG hisaab hain, ek nahi:
 *
 *   `balance` — udhaar. Grahak ne dukan ka kitna dena hai.
 *   `deposit` — jama. Grahak ka apna paisa jo dukan me para hai.
 *
 * Inhein milana ghalat tha. Ek shakhs ne Rs 500 ka udhaar liya ho aur Rs 2000
 * jama karaye hon, to "Rs 1500 dukandar ne dena hai" likhna dono baaton ko
 * chhupa deta hai — na udhaar nazar aata hai na jama. Dukandar ko dono alag
 * chahiyen, kyunki wo dono cheezein alag hain.
 */
export const KHATA_KINDS = {
  udhaar: { field: 'balance', sign: 1, cash: 'out' },
  milay: { field: 'balance', sign: -1, cash: 'in' },
  jama: { field: 'deposit', sign: 1, cash: 'in' },
  wapas: { field: 'deposit', sign: -1, cash: 'out' },
}

/**
 * Rang kis baat ka hai — paisa dukan me aaya ya gaya.
 *
 * Ye `sign` se ALAG hai, aur farq ahem hai. Jama karana `deposit` ko BARHATA
 * hai (sign +1) magar paisa dukan me AATA hai — laal dikhana ghalat hoga. Rang
 * hamesha wohi batata hai jo dukandar ki jeb ke saath hua: sabz andar, laal
 * bahar.
 */
export function khataCash(kind) {
  return KHATA_KINDS[kind]?.cash ?? 'out'
}

/** Barhne wali simt (+1) ya ghatne wali (−1). */
export function khataSign(kind) {
  return KHATA_KINDS[kind]?.sign ?? 1
}

/** Ye qism kaun sa hisaab chhuti hai — 'balance' (udhaar) ya 'deposit' (jama). */
export function khataField(kind) {
  return KHATA_KINDS[kind]?.field ?? 'balance'
}

/** Purane records me sirf `type` tha ('diya'/'mila') — unhe bhi parhna hai. */
export function khataKindOf(entry) {
  if (entry?.kind) return entry.kind
  return entry?.type === 'mila' ? 'milay' : 'udhaar'
}

export async function addKhataEntry({ partyId, kind, amount, items, collectedBy, note, at }) {
  const value = roundMoney(Math.abs(Number(amount) || 0))
  if (!value) throw new Error('Raqam zaroori hai')

  const partyRef = doc(col('khataParties'), partyId)
  const entryRef = doc(col('khataEntries'))

  const cleanItems = (items || [])
    .map((it) => ({
      productId: it.productId || null,
      text: (it.text || '').trim(),
      qty: it.qty ? String(it.qty).trim() : null,
    }))
    .filter((it) => it.text || it.productId)

  const buildEntry = (balanceAfter, offline) => ({
    partyId,
    kind,
    // Purana `type` bhi likhte hain — purane parhne wale us par chal sakte hain.
    type: khataSign(kind) > 0 ? 'diya' : 'mila',
    amount: value,
    items: cleanItems,
    collectedBy: collectedBy?.trim() || null,
    note: note?.trim() || null,
    balanceAfter,
    /*
     * Tareekh dukandar bhi chun sakta hai.
     *
     * Sham ko bahi khol kar din bhar ka likhna aam baat hai. Har entry par
     * server ka waqt daal dena us soorat me jhoot ban jata hai — aur history
     * ki tarteeb bhi ulat deta hai, kyunki wahi tarteeb ki bunyaad hai.
     */
    createdAt: at ? Timestamp.fromMillis(at) : serverTimestamp(),
    ...(offline ? { offline: true } : {}),
  })

  const target = khataField(kind)
  const nextBalance = (current) => roundMoney(current + khataSign(kind) * value)

  if (navigator.onLine) {
    try {
      return await runTransaction(dbf, async (tx) => {
        const snap = await tx.get(partyRef)
        if (!snap.exists()) throw new Error('Khata nahi mila')

        const balanceAfter = nextBalance(Number(snap.data()[target] || 0))
        tx.update(partyRef, {
          [target]: balanceAfter,
          lastEntryAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        tx.set(entryRef, buildEntry(balanceAfter, false))
        return balanceAfter
      })
    } catch (err) {
      // Wahi hi hidayat jo stock me hai: sirf internet ki nakami maaf hai.
      // Do device takra jayen to purane balance par naya hisaab likhna udhaar
      // ke record ko jhoota kar deta hai — aur wo paison ka maamla hai.
      const network = err?.code === 'unavailable' || err?.code === 'deadline-exceeded'
      if (!network) throw err
    }
  }

  // ---- offline raasta ----
  const local = khataPartyById(partyId)
  if (!local) throw new Error('Khata nahi mila')

  const balanceAfter = nextBalance(Number(local[target] || 0))
  const batch = writeBatch(dbf)
  batch.update(partyRef, {
    [target]: balanceAfter,
    lastEntryAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  batch.set(entryRef, buildEntry(balanceAfter, true))
  batch.commit().catch(() => {})

  return balanceAfter
}

/**
 * Poori history dobara jorr kar hisaab naye sire se likhna.
 *
 * Ye sab se nazuk kaam hai. Ek purani entry ki raqam badal dein to us ke BAAD
 * wali har entry ka `balanceAfter` jhoot ho jata hai, aur party ka balance bhi.
 * Is liye yahan sirf ek document nahi likha jata — poori zanjeer naye sire se
 * banti hai.
 *
 * Mehnga lagta hai magar hai nahi: ek grahak ki entries sau do sau se aage
 * shazi hi jati hain, aur ye sirf tabdeeli/mitane par chalta hai — nayi entry
 * par nahi.
 *
 * Ginti hamesha SERVER se parhi jati hai, `state` se nahi: `state` khate ki
 * entries rakhta hi nahi, aur adhoori list par hisaab dobara banana us se bhi
 * bura hai jo theek karne chale the.
 */
async function recalcParty(partyId) {
  const snap = await getDocs(query(col('khataEntries'), where('partyId', '==', partyId)))
  const rows = snap.docs
    .map(withId)
    .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt))

  // Do alag zanjeerein: udhaar ki apni, jama ki apni. Har entry ka
  // `balanceAfter` usi hisaab ka hai jise wo chhuti hai.
  const running = { balance: 0, deposit: 0 }
  const ops = []
  for (const row of rows) {
    const kind = khataKindOf(row)
    const field = khataField(kind)
    running[field] = roundMoney(running[field] + khataSign(kind) * Number(row.amount || 0))
    if (row.balanceAfter !== running[field]) {
      const balanceAfter = running[field]
      ops.push((batch) => batch.update(doc(col('khataEntries'), row.id), { balanceAfter }))
    }
  }

  const last = rows[rows.length - 1]
  ops.push((batch) =>
    batch.update(doc(col('khataParties'), partyId), {
      balance: running.balance,
      deposit: running.deposit,
      lastEntryAt: last ? last.createdAt : null,
      updatedAt: serverTimestamp(),
    }),
  )

  await commitSoon(ops)
  return running
}

/**
 * Entry me tabdeeli.
 *
 * Sirf wo cheezein badalti hain jo dukandar ne khud likhi thin — raqam, qism,
 * saman, kaun aaya tha, note. Waqt aur balance app khud sambhalti hai.
 */
export async function updateKhataEntry(entryId, changes) {
  const ref = doc(col('khataEntries'), entryId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Entry nahi mili')

  const partyId = snap.data().partyId
  const patch = { editedAt: serverTimestamp() }

  if (changes.amount !== undefined) {
    const value = roundMoney(Math.abs(Number(changes.amount) || 0))
    if (!value) throw new Error('Raqam zaroori hai')
    patch.amount = value
  }
  if (changes.kind !== undefined) {
    patch.kind = changes.kind
    patch.type = khataSign(changes.kind) > 0 ? 'diya' : 'mila'
  }
  if (changes.items !== undefined) {
    patch.items = (changes.items || [])
      .map((it) => ({
        productId: it.productId || null,
        text: (it.text || '').trim(),
        qty: it.qty ? String(it.qty).trim() : null,
      }))
      .filter((it) => it.text || it.productId)
  }
  if (changes.collectedBy !== undefined) patch.collectedBy = changes.collectedBy?.trim() || null
  if (changes.note !== undefined) patch.note = changes.note?.trim() || null
  // Tareekh badalne par tarteeb bhi badalti hai — is liye `recalcParty` neeche
  // poori zanjeer dobara banata hai, sirf ye ek document nahi.
  if (changes.at) patch.createdAt = Timestamp.fromMillis(changes.at)

  await writeSoon(updateDoc(ref, patch))
  return recalcParty(partyId)
}

/** Entry mitana — us ke baad ka poora hisaab dobara ban jata hai. */
export async function deleteKhataEntry(entryId) {
  const ref = doc(col('khataEntries'), entryId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return 0

  const partyId = snap.data().partyId
  await writeSoon(deleteDoc(ref))
  return recalcParty(partyId)
}

/**
 * Kai khate ek saath mitana.
 *
 * Aise khate jama ho jate hain jo kabhi chale hi nahi, ya jin ka kaam khatam
 * ho chuka. Ek ek kar ke mitana itna bora kaam hai ke koi karta hi nahi, aur
 * list bhari rehti hai — asal baqaya us me gum ho jata hai.
 */
export async function deleteKhataParties(ids) {
  const ops = []
  for (const id of ids) {
    const snap = await getDocs(query(col('khataEntries'), where('partyId', '==', id)))
    for (const d of snap.docs) ops.push((batch) => batch.delete(doc(col('khataEntries'), d.id)))
    ops.push((batch) => batch.delete(doc(col('khataParties'), id)))
  }
  await commitSoon(ops)
  return ids.length
}

/**
 * Ek khate ki poori history.
 *
 * Products wale detail screen ki tarah: sirf khulne par mangwate hain, poori
 * app ke saath nahi — warna har dukan ke har khate ki har entry hamesha
 * download hoti rehti.
 */
export function watchKhataEntries(partyId, callback) {
  if (!currentUid()) return () => {}

  return onSnapshot(
    query(col('khataEntries'), where('partyId', '==', partyId)),
    (snap) => {
      const rows = snap.docs.map(withId)
      rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      callback(rows)
    },
    () => callback([]),
  )
}

/**
 * Stock history ki safai.
 *
 * Har chhoti tabdeeli hamesha ke liye jama hoti rehti hai: rozana 50 entries
 * ka matlab saal me 18,000 aur do saal me 36,000. Aaj masla nahi, aage hai —
 * aur wo sab har login par mangwai bhi jati hain.
 *
 * Purani entries mitane se stock ka maujooda hisaab BILKUL nahi badalta:
 * `stockQty` product par likha hota hai, history se ginti nahi hoti. Sirf
 * "kab kya hua" ka purana record jata hai.
 */
export const HISTORY_KEEP_CHOICES = [90, 180, 365, 0]

/** Kitne din baad yaad dilana hai. */
const HISTORY_REMIND_DAYS = 10

export function historyKeepDays(settings = state.settings) {
  const days = Number(settings?.historyKeepDays)
  return Number.isFinite(days) && days >= 0 ? days : 180
}

function historyCutoff(settings = state.settings) {
  const days = historyKeepDays(settings)
  if (!days) return null
  return Date.now() - days * 24 * 60 * 60 * 1000
}

/**
 * Safai ki yaad dilani chahiye?
 *
 * Server se ginti mangwana yahan fazool hoga — har dashboard par ek query.
 * `state.movements` waise bhi aakhri 100 rakhti hai; agar un me se sab se
 * purani bhi hadd se bahar hai to us se aage yaqeenan aur bhi hai. Ye jawab
 * muft me mil jata hai.
 */
export function historyCleanupDue() {
  const cutoff = historyCutoff()
  if (!cutoff) return false

  const rows = state.movements
  // Sau se kam hain to itni purani cheez ho hi nahi sakti jo pareshan kare.
  if (rows.length < 100) return false

  const oldest = rows[rows.length - 1]
  if (!oldest?.createdAt || oldest.createdAt >= cutoff) return false

  const last = state.settings.lastHistoryCleanupAt
  if (!last) return true
  return Date.now() - last > HISTORY_REMIND_DAYS * 24 * 60 * 60 * 1000
}

/** Kitni entries hadd se bahar hain — mitane se pehle dikhane ke liye. */
export async function countOldMovements() {
  const cutoff = historyCutoff()
  if (!cutoff) return 0
  const snap = await getDocs(
    query(col('movements'), where('createdAt', '<', Timestamp.fromMillis(cutoff))),
  )
  return snap.size
}

/** Purani entries mitao. Stock ki maujooda ginti par koi asar nahi hota. */
export async function pruneOldMovements() {
  const cutoff = historyCutoff()
  if (!cutoff) return 0

  const snap = await getDocs(
    query(col('movements'), where('createdAt', '<', Timestamp.fromMillis(cutoff))),
  )
  const ops = snap.docs.map((d) => (batch) => batch.delete(doc(col('movements'), d.id)))
  await commitSoon(ops)
  await saveSetting('lastHistoryCleanupAt', Date.now())
  return snap.size
}

/** "Abhi nahi" — agle das din tak dobara na poochein. */
export async function snoozeHistoryCleanup() {
  await saveSetting('lastHistoryCleanupAt', Date.now())
}

// ---------------------------------------------------------- public catalog

/**
 * Grahak wala catalog — bina login ke dikhne wali list.
 *
 * YE DUKAN KA ASAL DATA NAHI HAI. Har product ki ek chhoti copy alag jagah
 * (`publicShops/{uid}`) rakhi jati hai jis me sirf wo baatein hoti hain jo
 * grahak ko dikhani hain: naam, tasveer aur bikri ka rate.
 *
 * Jo cheezein YAHAN KABHI NAHI jatin: khareed rate (costPrice), thok rate
 * (wholesalePrice), stock ki ginti, movements, tags, barcode, supplier.
 * Firestore me "document ka sirf ek hissa dikhao" mumkin nahi — is liye alag
 * copy hi waahid mehfooz tareeqa hai. Munafa dukandar ka apna maamla hai.
 */
const PUBLIC_INDEX = 'publicIndex'

function publicShopRef(uid = currentUid()) {
  if (!uid) throw new Error('Sign in nahi kiya hua')
  return doc(dbf, 'publicShops', uid)
}

function publicCol(name, uid) {
  return collection(publicShopRef(uid), name)
}

/**
 * Ek product ka wo hissa jo grahak dekh sakta hai:
 * tasveer, naam, qeemat aur stock. Bas.
 *
 * Yahan ek ek field haath se likhi gayi hai — `...product` kar ke "buri
 * cheezein hata do" wala tareeqa jaan boojh kar nahi. Us soorat me kal koi
 * nayi field product me add karta aur wo khud-ba-khud public ho jati. Is
 * tarah nayi field tab tak bahar nahi jati jab tak yahan likhi na jaye.
 */
function publicShapeOf(product) {
  return {
    nameEn: product.nameEn ?? '',
    nameUr: product.nameUr ?? null,
    salePrice: product.salePrice ?? 0,
    // Grahak ko batana hai ke maal kitna para hai.
    stockQty: product.stockQty ?? 0,
    // Naap ka lafz (kg / packet) — rate aur ginti samajhne ke liye zaroori.
    sellBy: product.sellBy ?? 'pack',
    unit: product.unit ?? null,
    packLabel: product.packLabel ?? null,
    packSize: product.packSize ?? null,
    packUnit: product.packUnit ?? null,
    imageId: product.imageId ?? null,
    // Category ki chhanti ke liye — sirf ids, naam alag collection me.
    categoryIds: product.categoryIds ?? [],
    // Khatam-shuda ya chhupi hui cheez grahak ko nahi dikhni chahiye.
    hidden: (product.status || 'active') !== 'active',
  }
}

/** Category ka public hissa — sirf naam aur icon. */
function publicCategoryShapeOf(cat) {
  return {
    nameEn: cat.nameEn ?? '',
    nameUr: cat.nameUr ?? null,
    icon: cat.icon ?? '📦',
    sortOrder: cat.sortOrder ?? 0,
  }
}

/**
 * Tasveerein bhi alag public copy me jati hain.
 *
 * Asal tasveerein `shops/{uid}/images` me hain jo band hai. Public product me
 * sirf imageId hota hai, aur wo id yahin ki hai — yaani niji collection kabhi
 * bahar nahi khulti.
 */
async function copyPublicImage(imageId, uid) {
  if (!imageId) return
  const data = await loadImage(imageId)
  if (!data) return
  await setDoc(doc(publicCol('images', uid), imageId), { data })
}

/** Catalog chalu hai? (Settings ka switch.) */
export function catalogOn(settings = state.settings) {
  return settings.publicCatalog === true
}

/**
 * Ek product ki public copy taza karna. Catalog band ho to kuch nahi hota.
 * Nakami jaan boojh kar nigal li jati hai — grahak wali list ka masla
 * dukandar ka apna kaam nahi rok sakta.
 */
export async function syncPublicProduct(product) {
  if (!catalogOn() || !product?.id) return
  try {
    await setDoc(doc(publicCol('products'), product.id), publicShapeOf(product))
    await copyPublicImage(product.imageId)
  } catch {
    // Catalog baad me "dobara shaya karein" se theek ho jata hai.
  }
}

export async function removePublicProduct(productId) {
  if (!catalogOn()) return
  try {
    await deleteDoc(doc(publicCol('products'), productId))
  } catch {
    // Upar wali wajah.
  }
}

/** Poora catalog dobara likhna — switch on karte waqt aur "refresh" par. */
export async function publishCatalog() {
  const uid = currentUid()
  await setDoc(publicShopRef(uid), {
    shopName: state.settings.shopName || '',
    currency: state.settings.currency || 'Rs',
    updatedAt: serverTimestamp(),
  })

  // Home page ka ishara — pehli dukan jo ise apne naam kare.
  try {
    await setDoc(doc(dbf, PUBLIC_INDEX, 'default'), { uid })
  } catch {
    // Koi aur dukan pehle claim kar chuki hai — apna catalog phir bhi
    // `#/shop/{uid}` link se khulta hai.
  }

  const [existing, existingCats] = await Promise.all([
    getDocs(publicCol('products', uid)),
    getDocs(publicCol('categories', uid)),
  ])
  const keep = new Set(state.products.map((p) => p.id))
  const keepCats = new Set(state.categories.map((c) => c.id))

  const ops = []
  for (const p of state.products) {
    ops.push((b) => b.set(doc(publicCol('products', uid), p.id), publicShapeOf(p)))
  }
  for (const c of state.categories) {
    ops.push((b) => b.set(doc(publicCol('categories', uid), c.id), publicCategoryShapeOf(c)))
  }
  for (const d of existing.docs) {
    if (!keep.has(d.id)) ops.push((b) => b.delete(d.ref))
  }
  for (const d of existingCats.docs) {
    if (!keepCats.has(d.id)) ops.push((b) => b.delete(d.ref))
  }
  await commitInChunks(ops)

  // Tasveerein batch me nahi ja saktin (pehle parhni parti hain).
  for (const p of state.products) await copyPublicImage(p.imageId, uid)

  return state.products.length
}

/** Catalog band karna — public copy poori tarah mit jati hai. */
export async function unpublishCatalog() {
  const uid = currentUid()
  const [products, images, categories] = await Promise.all([
    getDocs(publicCol('products', uid)),
    getDocs(publicCol('images', uid)),
    getDocs(publicCol('categories', uid)),
  ])
  await commitInChunks(
    [...products.docs, ...images.docs, ...categories.docs].map((d) => (b) => b.delete(d.ref)),
  )
  await deleteDoc(publicShopRef(uid)).catch(() => {})

  // Home page ka ishara bhi chhor dete hain, warna ye dukan catalog band karne
  // ke baad bhi ishara pakre baithi rehti aur home page hamesha ke liye khali
  // ho jata — koi doosri dukan usay le hi nahi sakti thi.
  try {
    const snap = await getDoc(doc(dbf, PUBLIC_INDEX, 'default'))
    if (snap.exists() && snap.data().uid === uid) {
      await deleteDoc(doc(dbf, PUBLIC_INDEX, 'default'))
    }
  } catch {
    // Ishara na chhoot sake to bhi catalog to hat hi chuka hai.
  }
}

/**
 * Sirf stock ki ginti taza karna.
 *
 * Stock din me kai baar badalta hai, aur har dafa poora product dobara likhna
 * bay-kaar hai — ek hi field kaafi hai.
 */
async function syncPublicStock(productId, stockQty) {
  if (!catalogOn()) return
  try {
    await updateDoc(doc(publicCol('products'), productId), { stockQty })
  } catch {
    // Ho sakta hai ye product abhi public list me na ho — "dobara shaya
    // karein" se theek ho jata hai.
  }
}

/** Categories ki public copy — ginti kam hoti hai, is liye poori dobara. */
async function syncPublicCategories() {
  if (!catalogOn()) return
  const uid = currentUid()
  try {
    const existing = await getDocs(publicCol('categories', uid))
    const keep = new Set(state.categories.map((c) => c.id))
    const ops = state.categories.map(
      (c) => (b) => b.set(doc(publicCol('categories', uid), c.id), publicCategoryShapeOf(c)),
    )
    for (const d of existing.docs) {
      if (!keep.has(d.id)) ops.push((b) => b.delete(d.ref))
    }
    await commitInChunks(ops)
  } catch {
    // Upar wali wajah.
  }
}

/**
 * Grahak wali list parhna — bina login ke.
 *
 * Ye waahid jagah hai jahan store bina sign-in ke Firestore se baat karta hai,
 * is liye `shopRef()` ke bajaye seedha path banta hai.
 */
/**
 * Grahak wali list ek baar me itni aati hai.
 *
 * Ye sirf raftaar ka maamla nahi — PAISE ka hai. Ye list bina login ke khulti
 * hai, yaani link jis ke paas bhi ho wo jitni dafa chahe khol sakta hai. Pehle
 * har visit par dukan ka HAR product mangwaya jata tha: 500 products wali dukan
 * par ek visit = 500 reads. Firebase free tier me rozana 50,000 reads hain, to
 * ek WhatsApp group me link ghoomne se dukandar ka quota ek din me khatam ho
 * sakta tha — aur us ke baad us ki apni app bhi ruk jati.
 *
 * Ab utna hi aata hai jitna nazar aata hai, aur agla tukra maang par.
 */
export const PUBLIC_PAGE_SIZE = 40

function publicProductsQuery(shopDoc, after) {
  const parts = [orderBy('nameEn')]
  if (after) parts.push(startAfter(after))
  parts.push(limit(PUBLIC_PAGE_SIZE))
  return query(collection(shopDoc, 'products'), ...parts)
}

const shapePublic = (d) => ({ ...d.data(), id: d.id })

export async function loadPublicShop(uid) {
  if (!uid) return null
  const shopDoc = doc(dbf, 'publicShops', uid)
  const [shopSnap, productSnap, categorySnap] = await Promise.all([
    getDoc(shopDoc),
    getDocs(publicProductsQuery(shopDoc)),
    getDocs(collection(shopDoc, 'categories')),
  ])
  if (!shopSnap.exists()) return null

  const all = productSnap.docs.map(shapePublic)
  const categories = categorySnap.docs
    .map(shapePublic)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))

  return {
    uid,
    ...shopSnap.data(),
    categories,
    // Chhupi hui cheezein grahak ko nahi dikhtin. Chhanti yahan hoti hai,
    // is liye ek safhe me is se kam bhi aa sakti hain — ye theek hai.
    products: all.filter((p) => !p.hidden),
    // Agla safha kahan se shuru ho. `null` = aur kuch nahi bacha.
    cursor: all.length === PUBLIC_PAGE_SIZE ? all[all.length - 1].nameEn : null,
  }
}

/** Agla safha — sirf tab jab grahak neeche pahunche ya search kare. */
export async function loadMorePublicProducts(uid, cursor) {
  if (!uid || !cursor) return { products: [], cursor: null }
  const shopDoc = doc(dbf, 'publicShops', uid)
  const snap = await getDocs(publicProductsQuery(shopDoc, cursor))
  const all = snap.docs.map(shapePublic)

  return {
    products: all.filter((p) => !p.hidden),
    cursor: all.length === PUBLIC_PAGE_SIZE ? all[all.length - 1].nameEn : null,
  }
}

/** Public tasveer — grahak wali list ke liye. */
export async function loadPublicImage(uid, imageId) {
  if (!uid || !imageId) return null
  const key = `pub:${uid}:${imageId}`
  if (imageCache.has(key)) return imageCache.get(key)
  try {
    const snap = await getDoc(doc(collection(doc(dbf, 'publicShops', uid), 'images'), imageId))
    const data = snap.exists() ? snap.data().data : null
    imageCache.set(key, data)
    return data
  } catch {
    return null
  }
}

/** Home page kis dukan ka catalog dikhaye. */
export async function defaultPublicShopUid() {
  try {
    const snap = await getDoc(doc(dbf, PUBLIC_INDEX, 'default'))
    return snap.exists() ? snap.data().uid : null
  } catch {
    return null
  }
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
  const [movementSnap, imageSnap, khataEntrySnap] = await Promise.all([
    getDocs(col('movements')),
    getDocs(col('images')),
    // Khate ki entries bhi seedha server se — `state` un ko rakhta hi nahi.
    getDocs(col('khataEntries')),
  ])

  return {
    app: 'karyana-shop',
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    settings: state.settings,
    categories: state.categories,
    products: state.products,
    movements: movementSnap.docs.map(withId),
    images: imageSnap.docs.map((d) => ({ id: d.id, data: d.data().data })),
    // Udhaar khata. Ye backup me hona LAZMI hai: ye wo hisaab hai jo dukandar
    // ke zehen me nahi, sirf yahan hota hai — gum ho jaye to wapas nahi aata.
    khataParties: state.khataParties,
    khataCategories: state.khataCategories,
    khataEntries: khataEntrySnap.docs.map(withId),
  }
}

/**
 * Backup file ki shakal ka version.
 *
 * `buildExport()` isay likhta hai. Barhta rehta hai jab file ka dhaancha
 * badle — jaise jab tasveerein product ke andar se nikal kar apni collection
 * me gayin.
 */
export const EXPORT_VERSION = 6

/**
 * File qabil-e-qubool hai?
 *
 * Version ka check ahem hai. Pehle sirf itna dekha jata tha ke file
 * "karyana-shop" ki hai — yaani KISI bhi version ki file chup chaap restore ho
 * jati thi. Agar kal file ka dhaancha phir badla, to naye app me purani file
 * daalte hi kuch cheezein khamoshi se gum ho jatin aur dukandar ko pata bhi na
 * chalta. Purani file abhi bhi chalti hai (app purane record khud sambhal leti
 * hai); rok sirf us file par hai jo is app se NAYI ho — kyunki us me kya hai,
 * ye app jaanti hi nahi.
 */
export function isValidExport(value) {
  if (!value || typeof value !== 'object') return false
  if (value.app !== 'karyana-shop') return false
  if (!Array.isArray(value.products) || !Array.isArray(value.categories)) return false

  const version = Number(value.version)
  if (Number.isFinite(version) && version > EXPORT_VERSION) return false

  return true
}

/** File is app se nayi hai? (Alag paighaam dikhane ke liye.) */
export function isNewerExport(value) {
  const version = Number(value?.version)
  return Number.isFinite(version) && version > EXPORT_VERSION
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
      ['khataCategories', data.khataCategories || [], (c) => strip(c)],
      ['khataParties', data.khataParties || [], (p) => strip(p)],
      ['khataEntries', data.khataEntries || [], (e) => strip(e)],
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
