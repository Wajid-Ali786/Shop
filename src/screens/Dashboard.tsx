import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { listProducts, listRecentMovements } from '../db/repo'
import { useI18n, localizedName } from '../i18n'
import { useSettings } from '../lib/hooks'
import { daysSinceBackup } from '../db/backup'
import { formatMoney } from '../lib/format'
import { navigate } from '../lib/router'
import { groupStockAlerts } from './Stock'
import { MovementRow } from './ProductDetail'
import { Button, Card, EmptyState, Section, Spinner, cx } from '../components/ui'
import { FloatingAddButton } from './Products'

export function DashboardScreen() {
  const { t, lang } = useI18n()
  const settings = useSettings()

  const products = useLiveQuery(() => listProducts(), [])
  const movements = useLiveQuery(() => listRecentMovements(6), [], undefined)

  const stats = useMemo(() => {
    const list = products ?? []
    const groups = groupStockAlerts(list)
    // Inventory value khareed rate par — cost na ho to sale price hi le lete hain.
    const value = list.reduce((sum, p) => sum + p.stockQty * (p.costPrice ?? p.salePrice), 0)
    return {
      total: list.length,
      value,
      low: groups.low.length,
      out: groups.out.length,
      expiring: groups.expiring.length,
      expired: groups.expired.length,
    }
  }, [products])

  const productById = useMemo(
    () => new Map((products ?? []).map((p) => [p.id!, p])),
    [products],
  )

  if (!products) {
    return (
      <div className="flex justify-center py-20 text-slate-400">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  const backupDays = daysSinceBackup(settings.lastBackupAt)
  // Offline-only app me backup hi wahid safety net hai, isliye warning saaf dikhti hai.
  const showBackupWarning =
    products.length > 0 && (backupDays === null || backupDays >= 7)

  return (
    <div className="pb-4">
      <header className="pt-safe px-5 pt-4 pb-2">
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('home.title')}</p>
        <h1 className="text-2xl font-bold" dir="auto">
          {settings.shopName || t('home.title')}
        </h1>
      </header>

      <div className="px-4">
        {showBackupWarning && (
          <button
            onClick={() => navigate('/settings')}
            className="mb-4 flex w-full items-start gap-3 rounded-2xl bg-amber-50 p-4 text-start ring-1 ring-amber-200 active:bg-amber-100 dark:bg-amber-950/40 dark:ring-amber-900"
          >
            <span className="text-xl">⚠️</span>
            <span className="flex-1">
              <span className="block text-sm font-medium text-amber-900 dark:text-amber-200">
                {backupDays === null
                  ? t('home.backupNever')
                  : t('home.backupWarning', { days: backupDays })}
              </span>
              <span className="mt-1 block text-sm font-bold text-amber-900 underline dark:text-amber-200">
                {t('home.backupNow')}
              </span>
            </span>
          </button>
        )}

        {products.length === 0 ? (
          <EmptyState
            icon="🏪"
            title={t('home.emptyTitle')}
            body={t('home.emptyBody')}
            action={<Button onClick={() => navigate('/product/new')}>{t('home.quickAdd')}</Button>}
          />
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3">
              <StatCard
                label={t('home.totalProducts')}
                value={String(stats.total)}
                onClick={() => navigate('/products')}
              />
              <StatCard
                label={t('home.inventoryValue')}
                value={formatMoney(stats.value, settings.currency)}
                small
              />
            </div>

            <div className="mb-6 grid grid-cols-2 gap-3">
              <StatCard
                label={t('home.lowStock')}
                value={String(stats.low)}
                tone={stats.low > 0 ? 'warn' : undefined}
                onClick={() => navigate('/stock')}
              />
              <StatCard
                label={t('home.outOfStock')}
                value={String(stats.out)}
                tone={stats.out > 0 ? 'danger' : undefined}
                onClick={() => navigate('/stock')}
              />
              {stats.expiring > 0 && (
                <StatCard
                  label={t('home.expiringSoon')}
                  value={String(stats.expiring)}
                  tone="warn"
                  onClick={() => navigate('/stock')}
                />
              )}
              {stats.expired > 0 && (
                <StatCard
                  label={t('home.expired')}
                  value={String(stats.expired)}
                  tone="danger"
                  onClick={() => navigate('/stock')}
                />
              )}
            </div>

            {(stats.low > 0 || stats.out > 0) && (
              <Button
                variant="secondary"
                full
                className="mb-6"
                onClick={() => navigate('/stock')}
              >
                📋 {t('home.viewLowStock')}
              </Button>
            )}

            <Section title={t('home.recentActivity')}>
              {!movements || movements.length === 0 ? (
                <Card>
                  <p className="py-2 text-center text-sm text-slate-500 dark:text-slate-400">
                    {t('home.noActivity')}
                  </p>
                </Card>
              ) : (
                <ul className="space-y-2">
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
            </Section>
          </>
        )}
      </div>

      {products.length > 0 && (
        <FloatingAddButton onClick={() => navigate('/product/new')} label={t('home.quickAdd')} />
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  tone,
  small,
  onClick,
}: {
  label: string
  value: string
  tone?: 'warn' | 'danger'
  small?: boolean
  onClick?: () => void
}) {
  const content = (
    <>
      <p
        className={cx(
          'text-xs font-medium',
          tone === 'danger'
            ? 'text-red-700 dark:text-red-300'
            : tone === 'warn'
              ? 'text-amber-800 dark:text-amber-300'
              : 'text-slate-500 dark:text-slate-400',
        )}
      >
        {label}
      </p>
      <p
        className={cx(
          'mt-1 font-bold',
          small ? 'text-lg' : 'text-2xl',
          tone === 'danger'
            ? 'text-red-700 dark:text-red-300'
            : tone === 'warn'
              ? 'text-amber-800 dark:text-amber-200'
              : 'text-slate-900 dark:text-slate-100',
        )}
      >
        {value}
      </p>
    </>
  )

  const className = cx(
    'rounded-2xl p-4 text-start ring-1',
    tone === 'danger'
      ? 'bg-red-50 ring-red-200 dark:bg-red-950/40 dark:ring-red-900'
      : tone === 'warn'
        ? 'bg-amber-50 ring-amber-200 dark:bg-amber-950/40 dark:ring-amber-900'
        : 'bg-white ring-slate-200/70 dark:bg-slate-900 dark:ring-slate-800',
  )

  if (onClick) {
    return (
      <button onClick={onClick} className={className}>
        {content}
      </button>
    )
  }
  return <div className={className}>{content}</div>
}
