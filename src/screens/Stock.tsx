import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { listProducts, listRecentMovements } from '../db/repo'
import type { Product } from '../db/types'
import { useI18n, localizedName } from '../i18n'
import { useSettings } from '../lib/hooks'
import { daysUntil, formatMoney } from '../lib/format'
import { formatQty } from '../lib/units'
import { navigate } from '../lib/router'
import { stockLevel } from '../components/ProductCard'
import { StockAdjustSheet } from '../components/StockAdjustSheet'
import { MovementRow } from './ProductDetail'
import { AppHeader, Button, EmptyState, Section, Spinner, cx } from '../components/ui'

/** Expiry itne din ke andar ho to "jald khatam" mana jata hai. */
const EXPIRY_WARNING_DAYS = 30

export interface StockGroups {
  out: Product[]
  low: Product[]
  expiring: Product[]
  expired: Product[]
}

export function groupStockAlerts(products: Product[]): StockGroups {
  const groups: StockGroups = { out: [], low: [], expiring: [], expired: [] }

  for (const p of products) {
    if (!p.isActive) continue

    const level = stockLevel(p)
    if (level === 'out') groups.out.push(p)
    else if (level === 'low') groups.low.push(p)

    if (p.expiryDate) {
      const days = daysUntil(p.expiryDate)
      if (days < 0) groups.expired.push(p)
      else if (days <= EXPIRY_WARNING_DAYS) groups.expiring.push(p)
    }
  }
  return groups
}

export function StockScreen({ onToast }: { onToast: (msg: string) => void }) {
  const { t, lang, unitLabel } = useI18n()
  const settings = useSettings()
  const [tab, setTab] = useState<'alerts' | 'history'>('alerts')
  const [adjusting, setAdjusting] = useState<Product>()

  const products = useLiveQuery(() => listProducts(), [])
  const movements = useLiveQuery(() => listRecentMovements(100), [], undefined)

  const groups = useMemo(() => groupStockAlerts(products ?? []), [products])
  const productById = useMemo(
    () => new Map((products ?? []).map((p) => [p.id!, p])),
    [products],
  )

  /** Supplier ko bhejne ke liye plain text list. */
  const buildReorderText = () => {
    const lines = [...groups.out, ...groups.low].map((p) => {
      const qty = formatQty(p.stockQty, p.unit, unitLabel)
      return `• ${localizedName(p, lang)} — ${qty}`
    })
    const header = settings.shopName ? `${settings.shopName}\n${t('stock.lowStockTitle')}` : t('stock.lowStockTitle')
    return `${header}\n\n${lines.join('\n')}`
  }

  const shareList = async () => {
    const text = buildReorderText()
    if (navigator.share) {
      try {
        await navigator.share({ title: t('stock.shareTitle'), text })
        return
      } catch {
        // User ne cancel kiya — neeche clipboard fallback chalega.
      }
    }
    try {
      await navigator.clipboard.writeText(text)
      onToast(t('common.copied'))
    } catch {
      onToast(t('error.generic'))
    }
  }

  if (!products) {
    return (
      <div className="flex justify-center py-20 text-slate-400">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  const reorderCount = groups.out.length + groups.low.length
  const nothingToShow =
    reorderCount === 0 && groups.expiring.length === 0 && groups.expired.length === 0

  return (
    <div className="pb-4">
      <AppHeader title={t('stock.title')} />

      <div className="flex gap-2 px-4 py-3">
        {(['alerts', 'history'] as const).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cx(
              'min-h-11 flex-1 rounded-xl text-sm font-semibold transition-colors',
              tab === key
                ? 'bg-brand-600 text-white'
                : 'bg-white text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800',
            )}
          >
            {key === 'alerts' ? t('stock.tabAlerts') : t('stock.tabHistory')}
            {key === 'alerts' && reorderCount > 0 && (
              <span className="ms-1.5 rounded-full bg-white/25 px-1.5 py-0.5 text-xs">
                {reorderCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'alerts' ? (
        nothingToShow ? (
          <EmptyState icon="✅" title={t('stock.lowStockEmpty')} />
        ) : (
          <div className="px-4">
            {reorderCount > 0 && (
              <Section
                title={t('stock.lowStockTitle')}
                action={
                  <Button
                    variant="ghost"
                    className="!min-h-9 !px-3 !text-sm"
                    onClick={shareList}
                  >
                    📤 {t('stock.shareList')}
                  </Button>
                }
              >
                <ul className="space-y-2">
                  {[...groups.out, ...groups.low].map((p) => (
                    <AlertRow
                      key={p.id}
                      product={p}
                      currency={settings.currency}
                      onOpen={() => navigate(`/product/${p.id}`)}
                      onAdjust={() => setAdjusting(p)}
                    />
                  ))}
                </ul>
              </Section>
            )}

            {groups.expired.length > 0 && (
              <Section title={t('stock.expiredTitle')}>
                <ul className="space-y-2">
                  {groups.expired.map((p) => (
                    <AlertRow
                      key={p.id}
                      product={p}
                      currency={settings.currency}
                      tone="danger"
                      onOpen={() => navigate(`/product/${p.id}`)}
                      onAdjust={() => setAdjusting(p)}
                    />
                  ))}
                </ul>
              </Section>
            )}

            {groups.expiring.length > 0 && (
              <Section title={t('stock.expiringTitle')}>
                <ul className="space-y-2">
                  {groups.expiring.map((p) => (
                    <AlertRow
                      key={p.id}
                      product={p}
                      currency={settings.currency}
                      tone="warn"
                      onOpen={() => navigate(`/product/${p.id}`)}
                      onAdjust={() => setAdjusting(p)}
                    />
                  ))}
                </ul>
              </Section>
            )}
          </div>
        )
      ) : !movements ? (
        <div className="flex justify-center py-20 text-slate-400">
          <Spinner className="h-8 w-8" />
        </div>
      ) : movements.length === 0 ? (
        <EmptyState icon="📋" title={t('stock.historyEmpty')} />
      ) : (
        <ul className="space-y-2 px-4">
          {movements.map((m) => {
            const product = productById.get(m.productId)
            if (!product) return null
            return (
              <MovementRow
                key={m.id}
                movement={m}
                unit={product.unit}
                productName={localizedName(product, lang)}
              />
            )
          })}
        </ul>
      )}

      <StockAdjustSheet
        product={adjusting}
        open={Boolean(adjusting)}
        onClose={() => setAdjusting(undefined)}
        onDone={onToast}
      />
    </div>
  )
}

function AlertRow({
  product,
  currency,
  tone = 'default',
  onOpen,
  onAdjust,
}: {
  product: Product
  currency: string
  tone?: 'default' | 'warn' | 'danger'
  onOpen: () => void
  onAdjust: () => void
}) {
  const { t, lang, unitLabel } = useI18n()
  const level = stockLevel(product)
  const expiryDays = product.expiryDate ? daysUntil(product.expiryDate) : null

  return (
    <li
      className={cx(
        'flex items-center gap-3 rounded-xl bg-white p-3 ring-1 dark:bg-slate-900',
        tone === 'danger'
          ? 'ring-red-200 dark:ring-red-900'
          : tone === 'warn'
            ? 'ring-amber-200 dark:ring-amber-900'
            : 'ring-slate-200/70 dark:ring-slate-800',
      )}
    >
      <button onClick={onOpen} className="min-w-0 flex-1 text-start">
        <p className="truncate font-semibold" dir="auto">
          {localizedName(product, lang)}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {level === 'out' ? (
            <span className="font-medium text-red-600 dark:text-red-400">
              {t('home.outOfStock')}
            </span>
          ) : (
            formatQty(product.stockQty, product.unit, unitLabel)
          )}
          {expiryDays !== null && (
            <>
              {' · '}
              {expiryDays < 0
                ? t('detail.expiredOn')
                : t('detail.daysLeft', { days: expiryDays })}
            </>
          )}
          {' · '}
          {formatMoney(product.salePrice, currency)}
        </p>
      </button>

      <button
        onClick={onAdjust}
        aria-label={t('detail.adjustStock')}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 active:bg-brand-100 dark:bg-brand-900/40 dark:text-brand-300"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
      </button>
    </li>
  )
}
