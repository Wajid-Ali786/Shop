import { toast } from './dom.js'
import { t, unitLabel } from '../i18n/index.js'
import { adjustStock, productById } from '../store.js'
import { formatQty, isPack } from './units.js'

/**
 * Ek tap me stock kam/zyada karna.
 *
 * Wajah khud tay ho jati hai: kam hone ka matlab bik gayi, zyada hone ka
 * matlab naya maal aaya. Ye dukan ka sab se aam kaam hai — is ke liye har
 * baar sheet kholna, miqdaar likhna aur wajah chunna bohat lamba tha.
 * Zyada tafseel chahiye ho to badge par tap kar ke poora sheet khulta hai.
 */
export async function quickAdjust(productId, direction) {
  const product = productById(productId)
  if (!product) return

  // Pack cheezein ek ek kar ke bikti hain. Khuli cheez me bhi ek base unit
  // (1 kg / 1 litre) qudrati qadam hai.
  const step = 1
  if (direction === 'out' && (product.stockQty || 0) <= 0) return

  try {
    const balance = await adjustStock({
      productId,
      qty: step,
      type: direction,
      reason: direction === 'in' ? 'purchase' : 'sale',
    })
    toast(
      `${direction === 'in' ? '+' : '−'}${step} · ${formatQty(balance, product, unitLabel)}`,
    )
  } catch (err) {
    toast(err?.code === 'permission-denied' ? t('error.permission') : t('error.generic'))
  }
}

/** Screens isi se dono buttons ek saath jorti hain. */
export function wireQuickStock(root, on) {
  on(root, 'click', '[data-plus]', (_e, el) => quickAdjust(el.dataset.plus, 'in'))
  on(root, 'click', '[data-minus]', (_e, el) => quickAdjust(el.dataset.minus, 'out'))
}

