import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getProduct, listCategories, listMovements } from '../db/repo'
import type { MovementReason, StockMovement } from '../db/types'
import { useI18n, localizedName } from '../i18n'
import { useImageUrl, useSettings } from '../lib/hooks'
import { formatDate, formatDateTime, formatMoney, daysUntil } from '../lib/format'
import { formatQty } from '../lib/units'
import { goBack, navigate } from '../lib/router'
import { StockAdjustSheet } from '../components/StockAdjustSheet'
import { StockBadge } from '../components/ProductCard'
import { AppHeader, Button, Card, EmptyState, Section, Spinner, cx } from '../components/ui'

export function ProductDetailScreen({
  productId,
  onToast,
}: {
  productId: number
  onToast: (msg: string) => void
}) {
  const { t, lang, unitLabel } = useI18n()
  const settings = useSettings()
  const [adjustOpen, setAdjustOpen] = useState(false)

  const product = useLiveQuery(() => getProduct(productId), [productId])
  const movements = useLiveQuery(() => listMovements(productId), [productId])
  const categories = useLiveQuery(() => listCategories(), [])
  const imageUrl = useImageUrl(product?.imageId)

  if (product === undefined) {
    return (
      <div className="flex justify-center py-20 text-slate-400">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (product === null) {
    navigate('/products')
    return null
  }

  const category = categories?.find((c) => c.id === product.categoryId)
  const stockValue = product.stockQty * (product.costPrice ?? product.salePrice)
  const expiryDays = product.expiryDate ? daysUntil(product.expiryDate) : null

  return (
    <div className="pb-32">
      <AppHeader
        title={localizedName(product, lang)}
        onBack={goBack}
        action={
          <button
            onClick={() => navigate(`/product/${productId}/edit`)}
            aria-label={t('common.edit')}
            className="flex h-11 w-11 items-center justify-center rounded-full text-slate-600 active:bg-slate-200 dark:text-slate-300 dark:active:bg-slate-800"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        }
      />

      <div className="p-4">
        <Card className="mb-4 flex gap-4">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-800">
            {imageUrl ? (
              <img src={imageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-4xl">
                {category?.icon ?? '📦'}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="text-lg leading-tight font-bold" dir="auto">
              {localizedName(product, lang)}
            </h2>
            {product.brand && (
              <p className="text-sm text-slate-500 dark:text-slate-400">{product.brand}</p>
            )}
            {category && (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {category.icon} {localizedName(category, lang)}
              </p>
            )}
            <div className="mt-2">
              <StockBadge product={product} />
            </div>
          </div>
        </Card>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <Card>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('form.salePrice')}</p>
            <p className="text-xl font-bold text-brand-700 dark:text-brand-400">
              {formatMoney(product.salePrice, settings.currency)}
            </p>
            <p className="text-xs text-slate-400">
              {t('form.perUnit', { unit: unitLabel(product.unit) })}
            </p>
          </Card>
          <Card>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('detail.stockValue')}</p>
            <p className="text-xl font-bold">{formatMoney(stockValue, settings.currency)}</p>
            <p className="text-xs text-slate-400">
              {formatQty(product.stockQty, product.unit, unitLabel)}
            </p>
          </Card>
        </div>

        {(product.costPrice !== undefined || product.wholesalePrice !== undefined) && (
          <Card className="mb-4 flex gap-6">
            {product.costPrice !== undefined && (
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('form.costPrice')}</p>
                <p className="font-semibold">
                  {formatMoney(product.costPrice, settings.currency)}
                </p>
              </div>
            )}
            {product.wholesalePrice !== undefined && (
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('form.wholesalePrice')}
                </p>
                <p className="font-semibold">
                  {formatMoney(product.wholesalePrice, settings.currency)}
                </p>
              </div>
            )}
            {product.costPrice !== undefined && (
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('form.profit')}</p>
                <p className="font-semibold text-brand-700 dark:text-brand-400">
                  {formatMoney(product.salePrice - product.costPrice, settings.currency)}
                </p>
              </div>
            )}
          </Card>
        )}

        {product.expiryDate && (
          <Card
            className={cx(
              'mb-4',
              expiryDays !== null && expiryDays < 0 && '!ring-red-300 dark:!ring-red-900',
              expiryDays !== null && expiryDays >= 0 && expiryDays <= 30 && '!ring-amber-300 dark:!ring-amber-900',
            )}
          >
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {expiryDays !== null && expiryDays < 0 ? t('detail.expiredOn') : t('detail.expires')}
            </p>
            <p className="font-semibold">
              {formatDate(product.expiryDate, lang)}
              {expiryDays !== null && expiryDays >= 0 && (
                <span className="ms-2 text-sm font-normal text-slate-500">
                  ({t('detail.daysLeft', { days: expiryDays })})
                </span>
              )}
            </p>
          </Card>
        )}

        {product.tags.length > 0 && (
          <Card className="mb-4">
            <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
              {t('detail.tagsLabel')}
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {product.tags.map((tag, i) => (
                <li
                  key={`${tag}-${i}`}
                  className="rounded-lg bg-slate-100 px-2.5 py-1 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  dir="auto"
                >
                  {tag}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {product.barcode && (
          <Card className="mb-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('form.barcode')}</p>
            <p className="font-mono font-semibold">{product.barcode}</p>
          </Card>
        )}

        <Section title={t('detail.history')}>
          {!movements ? (
            <div className="flex justify-center py-6 text-slate-400">
              <Spinner />
            </div>
          ) : movements.length === 0 ? (
            <EmptyState icon="📋" title={t('detail.noHistory')} />
          ) : (
            <ul className="space-y-2">
              {movements.map((m) => (
                <MovementRow key={m.id} movement={m} unit={product.unit} />
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 p-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto max-w-lg">
          <Button full onClick={() => setAdjustOpen(true)}>
            {t('detail.adjustStock')}
          </Button>
        </div>
      </div>

      <StockAdjustSheet
        product={product}
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        onDone={onToast}
      />
    </div>
  )
}

export function MovementRow({
  movement,
  unit,
  productName,
}: {
  movement: StockMovement
  unit: Parameters<typeof formatQty>[1]
  productName?: string
}) {
  const { t, lang, unitLabel } = useI18n()
  const positive = movement.type === 'in'
  const sign = movement.type === 'adjust' ? '=' : positive ? '+' : '−'

  return (
    <li className="flex items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-slate-200/70 dark:bg-slate-900 dark:ring-slate-800">
      <span
        className={cx(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold',
          movement.type === 'adjust'
            ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
            : positive
              ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/50 dark:text-brand-300'
              : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
        )}
      >
        {sign}
      </span>

      <div className="min-w-0 flex-1">
        {productName && <p className="truncate text-sm font-semibold">{productName}</p>}
        <p className="text-sm font-medium">
          {t(`reason.${movement.reason}` as MovementReasonKey)}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {formatDateTime(movement.createdAt, lang)}
          {movement.note && ` · ${movement.note}`}
        </p>
      </div>

      <div className="shrink-0 text-end">
        <p className="text-sm font-bold">
          {sign === '=' ? '' : sign}
          {formatQty(movement.qty, unit, unitLabel)}
        </p>
        <p className="text-xs text-slate-400">
          → {formatQty(movement.balanceAfter, unit, unitLabel)}
        </p>
      </div>
    </li>
  )
}

type MovementReasonKey = `reason.${MovementReason}`
