import { db } from './index'
import type { Category, Product, StockMovement } from './types'
import { blobToDataUrl, dataUrlToBlob } from '../lib/images'
import { saveSetting } from './repo'

/**
 * Offline-only app me backup optional feature nahi hai — yehi wahid tareeqa hai
 * jis se phone gum hone par data bacha ja sakta hai. Isliye images bhi backup
 * me shamil hain (base64 data URL ke tor par), taake ek hi file me sab kuch aa jaye.
 */

const BACKUP_MAGIC = 'karyana-shop-backup'
const BACKUP_VERSION = 1

export interface BackupFile {
  magic: typeof BACKUP_MAGIC
  version: number
  exportedAt: number
  data: {
    products: Product[]
    categories: Category[]
    stockMovements: StockMovement[]
    images: Array<{ id: string; dataUrl: string }>
    settings: Array<{ key: string; value: unknown }>
  }
}

export async function createBackup(): Promise<BackupFile> {
  const [products, categories, stockMovements, images, settings] = await Promise.all([
    db.products.toArray(),
    db.categories.toArray(),
    db.stockMovements.toArray(),
    db.images.toArray(),
    db.settings.toArray(),
  ])

  const encodedImages = await Promise.all(
    images.map(async (img) => ({ id: img.id, dataUrl: await blobToDataUrl(img.blob) })),
  )

  return {
    magic: BACKUP_MAGIC,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    data: { products, categories, stockMovements, images: encodedImages, settings },
  }
}

export function backupFileName(shopName?: string): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const slug = shopName?.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `karyana-backup-${slug ? `${slug}-` : ''}${stamp}.json`
}

export async function backupToBlob(): Promise<Blob> {
  const backup = await createBackup()
  return new Blob([JSON.stringify(backup)], { type: 'application/json' })
}

/** Browser download trigger — file phone ki Downloads me chali jati hai. */
export async function downloadBackup(shopName?: string): Promise<void> {
  const blob = await backupToBlob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = backupFileName(shopName)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  await saveSetting('lastBackupAt', Date.now())
}

/** WhatsApp/Drive par bhejne ke liye — mobile par download se zyada kaam ka hai. */
export function canShareFiles(): boolean {
  return typeof navigator.canShare === 'function' && typeof navigator.share === 'function'
}

export async function shareBackup(shopName?: string): Promise<boolean> {
  if (!canShareFiles()) return false
  const blob = await backupToBlob()
  const file = new File([blob], backupFileName(shopName), { type: 'application/json' })
  if (!navigator.canShare({ files: [file] })) return false
  try {
    await navigator.share({ files: [file], title: backupFileName(shopName) })
    await saveSetting('lastBackupAt', Date.now())
    return true
  } catch {
    // User ne share sheet cancel kar di.
    return false
  }
}

export function isValidBackup(value: unknown): value is BackupFile {
  if (typeof value !== 'object' || value === null) return false
  const b = value as Partial<BackupFile>
  if (b.magic !== BACKUP_MAGIC) return false
  if (typeof b.version !== 'number') return false
  const d = b.data
  return (
    typeof d === 'object' &&
    d !== null &&
    Array.isArray(d.products) &&
    Array.isArray(d.categories)
  )
}

export interface RestoreResult {
  products: number
  categories: number
  movements: number
  images: number
}

/**
 * `replace` = pehle sab kuch mita kar backup load karo (IDs bhi wahi rehti hain).
 * `merge`   = maujooda data rakho aur backup ki entries nayi IDs ke saath daal do,
 *             taake ID clash se kisi ka data overwrite na ho.
 */
export async function restoreBackup(
  backup: BackupFile,
  mode: 'merge' | 'replace',
): Promise<RestoreResult> {
  const { products, categories, stockMovements, images, settings } = backup.data

  const decodedImages = await Promise.all(
    (images ?? []).map(async (img) => ({ id: img.id, blob: await dataUrlToBlob(img.dataUrl) })),
  )

  return db.transaction(
    'rw',
    [db.products, db.categories, db.stockMovements, db.images, db.settings],
    async () => {
      if (mode === 'replace') {
        await Promise.all([
          db.products.clear(),
          db.categories.clear(),
          db.stockMovements.clear(),
          db.images.clear(),
        ])
        await db.categories.bulkAdd(categories)
        await db.products.bulkAdd(products)
        await db.stockMovements.bulkAdd(stockMovements ?? [])
        await db.images.bulkAdd(decodedImages)
        for (const row of settings ?? []) {
          // lastBackupAt restore karne ka koi matlab nahi — wo is device ka apna record hai.
          if (row.key !== 'lastBackupAt') await db.settings.put(row)
        }
      } else {
        // IDs dobara assign hoti hain, isliye purani → nayi ID ka naqsha rakhna parta hai.
        const catIdMap = new Map<number, number>()
        for (const cat of categories) {
          const { id: oldId, ...rest } = cat
          const newId = (await db.categories.add(rest as Category)) as number
          if (oldId !== undefined) catIdMap.set(oldId, newId)
        }

        const imgIdMap = new Map<string, string>()
        for (const img of decodedImages) {
          const exists = await db.images.get(img.id)
          const newId = exists ? `${img.id}_${Date.now().toString(36)}` : img.id
          await db.images.add({ id: newId, blob: img.blob })
          imgIdMap.set(img.id, newId)
        }

        const prodIdMap = new Map<number, number>()
        for (const p of products) {
          const { id: oldId, ...rest } = p
          const newId = (await db.products.add({
            ...(rest as Product),
            categoryId: p.categoryId !== undefined ? catIdMap.get(p.categoryId) : undefined,
            imageId: p.imageId ? imgIdMap.get(p.imageId) : undefined,
          })) as number
          if (oldId !== undefined) prodIdMap.set(oldId, newId)
        }

        for (const m of stockMovements ?? []) {
          const newProductId = prodIdMap.get(m.productId)
          if (newProductId === undefined) continue
          const { id: _drop, ...rest } = m
          void _drop
          await db.stockMovements.add({ ...(rest as StockMovement), productId: newProductId })
        }
      }

      return {
        products: products.length,
        categories: categories.length,
        movements: (stockMovements ?? []).length,
        images: decodedImages.length,
      }
    },
  )
}

export async function parseBackupFile(file: File): Promise<BackupFile> {
  const text = await file.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('invalid')
  }
  if (!isValidBackup(parsed)) throw new Error('invalid')
  return parsed
}

export async function clearAllData(): Promise<void> {
  await db.transaction(
    'rw',
    [db.products, db.categories, db.stockMovements, db.images, db.settings],
    async () => {
      await Promise.all([
        db.products.clear(),
        db.categories.clear(),
        db.stockMovements.clear(),
        db.images.clear(),
        db.settings.clear(),
      ])
    },
  )
}

/** Aakhri backup ko kitne din ho gaye. Kabhi backup na hua ho to null. */
export function daysSinceBackup(lastBackupAt?: number): number | null {
  if (!lastBackupAt) return null
  return Math.floor((Date.now() - lastBackupAt) / 86_400_000)
}
