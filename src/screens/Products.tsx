import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { listCategories, listProducts } from '../db/repo'
import type { Product } from '../db/types'
import { useI18n, localizedName } from '../i18n'
import { useDebounced, useSettings } from '../lib/hooks'
import { searchProducts } from '../lib/search'
import { navigate } from '../lib/router'
import { ProductCard, stockLevel } from '../components/ProductCard'
import { StockAdjustSheet } from '../components/StockAdjustSheet'
import { Button, EmptyState, Spinner, cx } from '../components/ui'

type SortKey = 'name' | 'stock' | 'price' | 'newest'

export function ProductsScreen({ onToast }: { onToast: (msg: string) => void }) {
  const { t, lang } = useI18n()
  const settings = useSettings()

  const products = useLiveQuery(() => listProducts(), [])
  const categories = useLiveQuery(() => listCategories(), [])

  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounced(query, 180)
  const [categoryId, setCategoryId] = useState<number | 'all'>('all')
  const [sort, setSort] = useState<SortKey>('name')
  const [adjusting, setAdjusting] = useState<Product>()

  const categoryIcons = useMemo(
    () => new Map((categories ?? []).map((c) => [c.id!, c.icon ?? '📦'])),
    [categories],
  )

  const visible = useMemo(() => {
    if (!products) return []

    let list = products
    if (categoryId !== 'all') list = list.filter((p) => p.categoryId === categoryId)
    // Search hidden tags tak dekhta hai — isliye filter ke baad chalta hai.
    if (debouncedQuery.trim()) list = searchProducts(list, debouncedQuery)

    // Search apni relevance ke hisaab se sort karta hai, usay dobara sort na karein.
    if (debouncedQuery.trim()) return list

    const sorted = [...list]
    switch (sort) {
      case 'stock':
        sorted.sort((a, b) => a.stockQty - b.stockQty)
        break
      case 'price':
        sorted.sort((a, b) => b.salePrice - a.salePrice)
        break
      case 'newest':
        sorted.sort((a, b) => b.createdAt - a.createdAt)
        break
      default:
        sorted.sort((a, b) =>
          localizedName(a, lang).localeCompare(localizedName(b, lang), lang === 'ur' ? 'ur' : 'en'),
        )
    }
    return sorted
  }, [products, categoryId, debouncedQuery, sort, lang])

  if (!products) {
    return (
      <div className="flex justify-center py-20 text-slate-400">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  return (
    <div>
      {/* Search bar sticky hai — list scroll karte hue bhi hamesha pahunch me. */}
      <div className="pt-safe sticky top-0 z-30 bg-slate-50/95 pb-2 backdrop-blur dark:bg-slate-950/95">
        <div className="px-4 pt-3">
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3.5 text-slate-400">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
              </svg>
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('products.searchPlaceholder')}
              dir="auto"
              aria-label={t('common.search')}
              className="w-full rounded-2xl border-0 bg-white py-3.5 ps-11 pe-4 text-slate-900 ring-1 ring-slate-200 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-800"
            />
          </div>
        </div>

        {/* Category chips — horizontal scroll, taake mobile par jagah na ghere. */}
        {(categories?.length ?? 0) > 0 && (
          <div className="mt-2 flex gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Chip active={categoryId === 'all'} onClick={() => setCategoryId('all')}>
              {t('common.all')}
            </Chip>
            {categories!.map((c) => (
              <Chip
                key={c.id}
                active={categoryId === c.id}
                onClick={() => setCategoryId(categoryId === c.id ? 'all' : c.id!)}
              >
                {c.icon} {localizedName(c, lang)}
              </Chip>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-5 py-2">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {t('products.count', { count: visible.length })}
        </p>
        {!debouncedQuery.trim() && (
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label={t('products.sortBy')}
            className="rounded-lg bg-transparent py-1 text-xs font-medium text-slate-500 outline-none dark:text-slate-400"
          >
            <option value="name">{t('products.sortName')}</option>
            <option value="stock">{t('products.sortStock')}</option>
            <option value="price">{t('products.sortPrice')}</option>
            <option value="newest">{t('products.sortNewest')}</option>
          </select>
        )}
      </div>

      {visible.length === 0 ? (
        products.length === 0 ? (
          <EmptyState
            icon="📦"
            title={t('products.empty')}
            body={t('products.emptyHint')}
            action={
              <Button onClick={() => navigate('/product/new')}>{t('home.quickAdd')}</Button>
            }
          />
        ) : (
          <EmptyState
            icon="🔍"
            title={t('products.noResults', { query: debouncedQuery })}
            body={t('products.noResultsHint')}
          />
        )
      ) : (
        <ul className="space-y-2 px-4 pb-4">
          {visible.map((p) => (
            <li key={p.id}>
              <ProductCard
                product={p}
                categoryIcon={p.categoryId ? categoryIcons.get(p.categoryId) : undefined}
                currency={settings.currency}
                onClick={() => navigate(`/product/${p.id}`)}
                onQuickAdjust={() => setAdjusting(p)}
              />
            </li>
          ))}
        </ul>
      )}

      <StockAdjustSheet
        product={adjusting}
        open={Boolean(adjusting)}
        onClose={() => setAdjusting(undefined)}
        onDone={onToast}
      />

      <FloatingAddButton onClick={() => navigate('/product/new')} label={t('home.quickAdd')} />
    </div>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'shrink-0 rounded-full px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-colors',
        active
          ? 'bg-brand-600 text-white'
          : 'bg-white text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800',
      )}
    >
      {children}
    </button>
  )
}

export function FloatingAddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="fixed bottom-24 end-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/30 active:bg-brand-700"
    >
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M12 5v14M5 12h14" strokeLinecap="round" />
      </svg>
    </button>
  )
}

/** Low-stock ki ginti — Dashboard aur Stock screen dono yahi rule istemaal karte hain. */
export function countByLevel(products: Product[]) {
  let low = 0
  let out = 0
  for (const p of products) {
    const level = stockLevel(p)
    if (level === 'out') out++
    else if (level === 'low') low++
  }
  return { low, out }
}
