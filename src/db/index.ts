import Dexie, { type EntityTable } from 'dexie'
import type { Category, Product, StockMovement, StoredImage } from './types'

/** Settings ek key/value table hai taake naye keys migration ke bagair add ho sakein. */
export interface SettingRow {
  key: string
  value: unknown
}

export const db = new Dexie('karyana-shop') as Dexie & {
  products: EntityTable<Product, 'id'>
  categories: EntityTable<Category, 'id'>
  stockMovements: EntityTable<StockMovement, 'id'>
  images: EntityTable<StoredImage, 'id'>
  settings: EntityTable<SettingRow, 'key'>
}

db.version(1).stores({
  // searchBlob index nahi hai: substring match ke liye index kaam nahi aata,
  // aur products chhoti shop me hazaar se kam hi rehte hain.
  products: '++id, categoryId, barcode, isActive, stockQty, updatedAt, nameEn',
  categories: '++id, sortOrder',
  stockMovements: '++id, productId, createdAt',
  images: 'id',
  settings: 'key',
})

/**
 * Browser ko batata hai ke ye data disposable cache nahi hai.
 * Iske bagair storage kam hone par browser poora IndexedDB evict kar sakta hai —
 * offline-only app me iska matlab saara data chala jana hai.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  try {
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export async function getStorageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null
  try {
    const est = await navigator.storage.estimate()
    return { usage: est.usage ?? 0, quota: est.quota ?? 0 }
  } catch {
    return null
  }
}
