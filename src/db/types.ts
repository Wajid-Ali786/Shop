/** Base units me hi stock store hota hai. Entry/display par convert hota hai (lib/units.ts). */
export type Unit = 'kg' | 'g' | 'l' | 'ml' | 'piece' | 'dozen' | 'packet' | 'bag'

export type MovementType = 'in' | 'out' | 'adjust'

/** Stock kis wajah se badla. UI me translate hota hai (i18n keys: `reason.<value>`). */
export type MovementReason =
  | 'purchase' // naya maal aaya
  | 'sale' // becha
  | 'damage' // kharab / toot gaya
  | 'expired' // expiry nikal gayi
  | 'correction' // ginti theek ki
  | 'initial' // product banate waqt opening stock
  | 'other'

export interface Product {
  id?: number
  nameEn: string
  nameUr?: string
  brand?: string
  categoryId?: number
  unit: Unit
  /** Khareed rate — profit margin aur inventory value ke liye. */
  costPrice?: number
  /** Retail rate — grahak ko is par bechte hain. */
  salePrice: number
  /** Thok rate (optional). */
  wholesalePrice?: number
  /** Base unit me, decimal allowed (12.5 kg). */
  stockQty: number
  /** Is se neeche jaye to low-stock alert. */
  lowStockAt?: number
  /** Hidden search tags — list me nazar nahi aate, sirf search me kaam aate hain. */
  tags: string[]
  barcode?: string
  /** images table ka key. */
  imageId?: string
  /** ISO date string (YYYY-MM-DD). */
  expiryDate?: string
  isActive: boolean
  /** Save par compute hota hai (lib/search.ts) — normalize(naam + tags + brand + barcode). */
  searchBlob: string
  createdAt: number
  updatedAt: number
}

export interface Category {
  id?: number
  nameEn: string
  nameUr?: string
  /** Emoji icon — list me visual pehchaan ke liye. */
  icon?: string
  sortOrder: number
}

export interface StockMovement {
  id?: number
  productId: number
  type: MovementType
  /** Base unit me, hamesha positive. Direction `type` se aata hai. */
  qty: number
  reason: MovementReason
  note?: string
  /** Movement ke baad stock kitna tha — history audit ke liye. */
  balanceAfter: number
  createdAt: number
}

export interface StoredImage {
  id: string
  blob: Blob
}

export interface AppSettings {
  lang: 'en' | 'ur'
  theme: 'light' | 'dark' | 'system'
  shopName: string
  currency: string
  /** Naye products par default low-stock threshold. */
  defaultLowStockAt: number
  /** Aakhri backup ka timestamp — home screen par warning banner isi se chalta hai. */
  lastBackupAt?: number
}

export const DEFAULT_SETTINGS: AppSettings = {
  lang: 'en',
  theme: 'system',
  shopName: '',
  currency: 'Rs',
  defaultLowStockAt: 5,
}
