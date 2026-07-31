import { db } from './index'
import type {
  AppSettings,
  Category,
  MovementReason,
  Product,
  StockMovement,
} from './types'
import { DEFAULT_SETTINGS } from './types'
import { buildSearchBlob } from '../lib/search'
import { newImageId } from '../lib/images'
import { round3 } from '../lib/units'

/**
 * Saara data access sirf isi file se hota hai. Screens Dexie ko seedha nahi
 * chhuti — is se kal ko cloud sync add karna ho to sirf yahi layer badalni
 * paray gi, baqi app waise ki waisi rahegi.
 */

// ---------------------------------------------------------------- categories

export function listCategories() {
  return db.categories.orderBy('sortOrder').toArray()
}

export async function createCategory(data: Omit<Category, 'id' | 'sortOrder'> & { sortOrder?: number }) {
  const sortOrder = data.sortOrder ?? ((await db.categories.count()) + 1) * 10
  return db.categories.add({ ...data, sortOrder })
}

export function updateCategory(id: number, changes: Partial<Category>) {
  return db.categories.update(id, changes)
}

/**
 * Category delete hone par uske products delete NAHI hote — sirf
 * "uncategorized" ho jate hain. Ghalti se poora stock gum ho jana bura hoga.
 */
export async function deleteCategory(id: number) {
  await db.transaction('rw', db.categories, db.products, async () => {
    await db.products.where('categoryId').equals(id).modify({ categoryId: undefined })
    await db.categories.delete(id)
  })
}

export async function reorderCategories(orderedIds: number[]) {
  await db.transaction('rw', db.categories, async () => {
    await Promise.all(
      orderedIds.map((id, i) => db.categories.update(id, { sortOrder: (i + 1) * 10 })),
    )
  })
}

// ------------------------------------------------------------------ products

export function listProducts() {
  return db.products.orderBy('nameEn').toArray()
}

export function getProduct(id: number) {
  return db.products.get(id)
}

export type ProductInput = Omit<Product, 'id' | 'searchBlob' | 'createdAt' | 'updatedAt'>

async function categoryNameFor(categoryId?: number): Promise<string | undefined> {
  if (categoryId === undefined) return undefined
  const cat = await db.categories.get(categoryId)
  return [cat?.nameEn, cat?.nameUr].filter(Boolean).join(' ') || undefined
}

export async function createProduct(input: ProductInput): Promise<number> {
  const now = Date.now()
  const searchBlob = buildSearchBlob(input, await categoryNameFor(input.categoryId))
  const stockQty = round3(input.stockQty)

  return db.transaction('rw', db.products, db.stockMovements, async () => {
    const id = await db.products.add({
      ...input,
      stockQty,
      searchBlob,
      createdAt: now,
      updatedAt: now,
    })
    // Opening stock bhi history me aana chahiye, warna hisaab poora nahi hota.
    if (stockQty !== 0) {
      await db.stockMovements.add({
        productId: id as number,
        type: 'in',
        qty: Math.abs(stockQty),
        reason: 'initial',
        balanceAfter: stockQty,
        createdAt: now,
      })
    }
    return id as number
  })
}

/**
 * Note: ye stockQty ko seedha set kar deta hai aur movement record NAHI banata.
 * Stock badalne ke liye hamesha `adjustStock()` istemaal karein.
 */
export async function updateProduct(id: number, changes: Partial<ProductInput>) {
  const existing = await db.products.get(id)
  if (!existing) throw new Error(`Product ${id} nahi mila`)

  const merged = { ...existing, ...changes }
  const searchBlob = buildSearchBlob(merged, await categoryNameFor(merged.categoryId))
  await db.products.update(id, { ...changes, searchBlob, updatedAt: Date.now() })
}

export async function deleteProduct(id: number) {
  await db.transaction('rw', db.products, db.stockMovements, db.images, async () => {
    const p = await db.products.get(id)
    if (p?.imageId) await db.images.delete(p.imageId)
    await db.stockMovements.where('productId').equals(id).delete()
    await db.products.delete(id)
  })
}

/** Category ka naam badle to us ke products ka searchBlob bhi refresh karna parta hai. */
export async function rebuildSearchBlobs() {
  const [products, categories] = await Promise.all([db.products.toArray(), db.categories.toArray()])
  const catName = new Map(
    categories.map((c) => [c.id, [c.nameEn, c.nameUr].filter(Boolean).join(' ')]),
  )
  await db.transaction('rw', db.products, async () => {
    await Promise.all(
      products.map((p) =>
        db.products.update(p.id!, {
          searchBlob: buildSearchBlob(p, p.categoryId ? catName.get(p.categoryId) : undefined),
        }),
      ),
    )
  })
}

// --------------------------------------------------------------------- stock

export interface AdjustStockArgs {
  productId: number
  /** Base unit me. `type` se direction tay hota hai, isliye hamesha positive bhejein. */
  qty: number
  type: 'in' | 'out'
  reason: MovementReason
  note?: string
}

/**
 * Stock badalne ka waahid tareeqa. Product ka stockQty aur movement record
 * dono ek hi transaction me likhte hain, taake history kabhi stock se
 * mismatch na ho.
 */
export async function adjustStock(args: AdjustStockArgs): Promise<number> {
  const qty = Math.abs(round3(args.qty))
  if (qty === 0) throw new Error('Quantity zero nahi ho sakti')

  return db.transaction('rw', db.products, db.stockMovements, async () => {
    const product = await db.products.get(args.productId)
    if (!product) throw new Error(`Product ${args.productId} nahi mila`)

    const delta = args.type === 'in' ? qty : -qty
    // Stock manfi nahi ho sakta — warna inventory value ka hisaab ulta ho jata hai.
    const balanceAfter = round3(Math.max(0, product.stockQty + delta))

    await db.products.update(args.productId, { stockQty: balanceAfter, updatedAt: Date.now() })
    await db.stockMovements.add({
      productId: args.productId,
      type: args.type,
      qty,
      reason: args.reason,
      note: args.note,
      balanceAfter,
      createdAt: Date.now(),
    })
    return balanceAfter
  })
}

/** Ginti kar ke stock theek karna — "abhi asal me itna para hai". */
export async function setStockCount(productId: number, countedQty: number, note?: string) {
  const target = round3(Math.max(0, countedQty))
  return db.transaction('rw', db.products, db.stockMovements, async () => {
    const product = await db.products.get(productId)
    if (!product) throw new Error(`Product ${productId} nahi mila`)

    const diff = round3(target - product.stockQty)
    await db.products.update(productId, { stockQty: target, updatedAt: Date.now() })
    await db.stockMovements.add({
      productId,
      type: 'adjust',
      qty: Math.abs(diff),
      reason: 'correction',
      note,
      balanceAfter: target,
      createdAt: Date.now(),
    })
    return target
  })
}

export function listMovements(productId: number, limit = 50): Promise<StockMovement[]> {
  return db.stockMovements
    .where('productId')
    .equals(productId)
    .reverse()
    .sortBy('createdAt')
    .then((rows) => rows.slice(0, limit))
}

export async function listRecentMovements(limit = 100): Promise<StockMovement[]> {
  const rows = await db.stockMovements.orderBy('createdAt').reverse().limit(limit).toArray()
  return rows
}

// -------------------------------------------------------------------- images

export async function saveImage(blob: Blob): Promise<string> {
  const id = newImageId()
  await db.images.add({ id, blob })
  return id
}

export async function getImage(id: string): Promise<Blob | undefined> {
  return (await db.images.get(id))?.blob
}

export async function deleteImage(id: string) {
  await db.images.delete(id)
}

// ------------------------------------------------------------------ settings

export async function loadSettings(): Promise<AppSettings> {
  const rows = await db.settings.toArray()
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  return { ...DEFAULT_SETTINGS, ...stored } as AppSettings
}

export async function saveSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
  await db.settings.put({ key: key as string, value })
}

// ---------------------------------------------------------------- seed / init

const DEFAULT_CATEGORIES: Array<Omit<Category, 'id'>> = [
  { nameEn: 'Grains & Pulses', nameUr: 'اناج و دالیں', icon: '🌾', sortOrder: 10 },
  { nameEn: 'Cooking Oil & Ghee', nameUr: 'تیل و گھی', icon: '🛢️', sortOrder: 20 },
  { nameEn: 'Spices & Masala', nameUr: 'مصالحہ جات', icon: '🌶️', sortOrder: 30 },
  { nameEn: 'Dairy & Eggs', nameUr: 'دودھ و انڈے', icon: '🥛', sortOrder: 40 },
  { nameEn: 'Tea, Sugar & Beverages', nameUr: 'چائے، چینی و مشروبات', icon: '☕', sortOrder: 50 },
  { nameEn: 'Biscuits & Snacks', nameUr: 'بسکٹ و اسنیکس', icon: '🍪', sortOrder: 60 },
  { nameEn: 'Bakery', nameUr: 'بیکری', icon: '🍞', sortOrder: 70 },
  { nameEn: 'Soap & Detergent', nameUr: 'صابن و سرف', icon: '🧼', sortOrder: 80 },
  { nameEn: 'Personal Care', nameUr: 'ذاتی نگہداشت', icon: '🪥', sortOrder: 90 },
  { nameEn: 'Household', nameUr: 'گھریلو سامان', icon: '🧹', sortOrder: 100 },
  { nameEn: 'Frozen & Cold', nameUr: 'فروزن', icon: '🧊', sortOrder: 110 },
  { nameEn: 'Other', nameUr: 'متفرق', icon: '📦', sortOrder: 120 },
]

export async function seedDefaultCategories(): Promise<number> {
  const existing = await db.categories.count()
  if (existing > 0) return 0
  await db.categories.bulkAdd(DEFAULT_CATEGORIES as Category[])
  return DEFAULT_CATEGORIES.length
}

/** Pehli baar app khulne par categories daal deta hai taake screen khali na lage. */
export async function initializeApp() {
  await seedDefaultCategories()
}
