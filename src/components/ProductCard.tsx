import type { Product } from '../db/types'
import { useI18n, localizedName } from '../i18n'
import { useImageUrl } from '../lib/hooks'
import { formatMoney } from '../lib/format'
import { formatQty } from '../lib/units'
import { cx } from './ui'

export function stockLevel(p: Product): 'out' | 'low' | 'ok' {
  if (p.stockQty <= 0) return 'out'
  if (p.lowStockAt !== undefined && p.stockQty <= p.lowStockAt) return 'low'
  return 'ok'
}

const LEVEL_STYLES = {
  out: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  low: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  ok: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
} as const

export function StockBadge({ product }: { product: Product }) {
  const { t, unitLabel } = useI18n()
  const level = stockLevel(product)
  const text =
    level === 'out' ? t('home.outOfStock') : formatQty(product.stockQty, product.unit, unitLabel)

  return (
    <span
      className={cx(
        'inline-block rounded-lg px-2 py-1 text-xs font-semibold whitespace-nowrap',
        LEVEL_STYLES[level],
      )}
    >
      {text}
    </span>
  )
}

/** Product ki tasveer, ya na ho to category emoji / pehla harf. */
function Thumb({ product, fallback }: { product: Product; fallback: string }) {
  const url = useImageUrl(product.imageId)

  return (
    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-2xl">{fallback}</div>
      )}
    </div>
  )
}

export function ProductCard({
  product,
  categoryIcon,
  currency,
  onClick,
  onQuickAdjust,
}: {
  product: Product
  categoryIcon?: string
  currency: string
  onClick: () => void
  onQuickAdjust?: () => void
}) {
  const { t, lang, unitLabel } = useI18n()
  const name = localizedName(product, lang)

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-slate-200/70 dark:bg-slate-900 dark:ring-slate-800">
      <button onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 text-start">
        <Thumb product={product} fallback={categoryIcon ?? '📦'} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate font-semibold text-slate-900 dark:text-slate-100">{name}</p>
            {!product.isActive && (
              <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                {t('products.inactive')}
              </span>
            )}
          </div>

          {product.brand && (
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{product.brand}</p>
          )}

          <p className="mt-1 text-sm font-medium text-brand-700 dark:text-brand-400">
            {formatMoney(product.salePrice, currency)}
            <span className="font-normal text-slate-400">
              {' '}
              / {unitLabel(product.unit)}
            </span>
          </p>
        </div>
      </button>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <StockBadge product={product} />
        {onQuickAdjust && (
          <button
            onClick={onQuickAdjust}
            aria-label={t('stock.quickAdjust')}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 active:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:active:bg-slate-700"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
