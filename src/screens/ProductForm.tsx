import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  createProduct,
  deleteProduct,
  getProduct,
  listCategories,
  saveImage,
  updateProduct,
  deleteImage,
} from '../db/repo'
import type { Product, Unit } from '../db/types'
import { useI18n, localizedName } from '../i18n'
import { useImageUrl, useSettings } from '../lib/hooks'
import { goBack, navigate } from '../lib/router'
import { ALL_UNITS, allowsFraction, fromBase, toBase } from '../lib/units'
import { formatMoney } from '../lib/format'
import { ImagePicker } from '../components/ImagePicker'
import { TagInput } from '../components/TagInput'
import { AppHeader, Button, Card, Field, Input, Select, Spinner } from '../components/ui'

interface FormState {
  nameEn: string
  nameUr: string
  brand: string
  categoryId: string
  unit: Unit
  costPrice: string
  salePrice: string
  wholesalePrice: string
  stockQty: string
  lowStockAt: string
  tags: string[]
  barcode: string
  expiryDate: string
  isActive: boolean
}

const EMPTY: FormState = {
  nameEn: '',
  nameUr: '',
  brand: '',
  categoryId: '',
  unit: 'piece',
  costPrice: '',
  salePrice: '',
  wholesalePrice: '',
  stockQty: '',
  lowStockAt: '',
  tags: [],
  barcode: '',
  expiryDate: '',
  isActive: true,
}

function toForm(p: Product, defaultLowStock: number): FormState {
  return {
    nameEn: p.nameEn,
    nameUr: p.nameUr ?? '',
    brand: p.brand ?? '',
    categoryId: p.categoryId !== undefined ? String(p.categoryId) : '',
    unit: p.unit,
    costPrice: p.costPrice !== undefined ? String(p.costPrice) : '',
    salePrice: String(p.salePrice),
    wholesalePrice: p.wholesalePrice !== undefined ? String(p.wholesalePrice) : '',
    stockQty: String(fromBase(p.stockQty, p.unit)),
    lowStockAt:
      p.lowStockAt !== undefined ? String(fromBase(p.lowStockAt, p.unit)) : String(defaultLowStock),
    tags: [...p.tags],
    barcode: p.barcode ?? '',
    expiryDate: p.expiryDate ?? '',
    isActive: p.isActive,
  }
}

export function ProductFormScreen({
  productId,
  onToast,
}: {
  productId?: number
  onToast: (msg: string) => void
}) {
  const { t, lang } = useI18n()
  const settings = useSettings()
  const categories = useLiveQuery(() => listCategories(), [])
  const isEdit = productId !== undefined

  const [form, setForm] = useState<FormState>(EMPTY)
  const [loaded, setLoaded] = useState(!isEdit)
  const [showMore, setShowMore] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [saving, setSaving] = useState(false)

  /** Naye image ka Blob save hone tak yahin rehta hai — form cancel ho to DB saaf rehti hai. */
  const [pendingImage, setPendingImage] = useState<Blob | null>(null)
  const [existingImageId, setExistingImageId] = useState<string>()
  const [imageCleared, setImageCleared] = useState(false)

  const existingUrl = useImageUrl(imageCleared ? undefined : existingImageId)
  const [pendingUrl, setPendingUrl] = useState<string>()

  useEffect(() => {
    if (!pendingImage) {
      setPendingUrl(undefined)
      return
    }
    const url = URL.createObjectURL(pendingImage)
    setPendingUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [pendingImage])

  useEffect(() => {
    if (!isEdit) {
      setForm((f) => ({ ...f, lowStockAt: String(settings.defaultLowStockAt) }))
      return
    }
    getProduct(productId).then((p) => {
      if (!p) {
        navigate('/products')
        return
      }
      setForm(toForm(p, settings.defaultLowStockAt))
      setExistingImageId(p.imageId)
      // Edit karte waqt advanced fields khud khul jayein agar unme kuch bhara ho.
      setShowMore(
        Boolean(p.brand || p.wholesalePrice || p.barcode || p.expiryDate || p.nameUr || !p.isActive),
      )
      setLoaded(true)
    })
  }, [productId, isEdit, settings.defaultLowStockAt])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {}
    if (!form.nameEn.trim()) next.nameEn = t('form.nameRequired')

    const price = Number.parseFloat(form.salePrice)
    if (!form.salePrice.trim()) next.salePrice = t('form.priceRequired')
    else if (!Number.isFinite(price) || price < 0) next.salePrice = t('form.priceInvalid')

    setErrors(next)
    return Object.keys(next).length === 0
  }

  const save = async () => {
    if (saving || !validate()) return
    setSaving(true)
    try {
      let imageId = imageCleared ? undefined : existingImageId
      if (pendingImage) {
        imageId = await saveImage(pendingImage)
        // Purani image ab kisi kaam ki nahi — storage bharne se bachate hain.
        if (existingImageId) await deleteImage(existingImageId)
      } else if (imageCleared && existingImageId) {
        await deleteImage(existingImageId)
      }

      const num = (v: string) => {
        const n = Number.parseFloat(v)
        return Number.isFinite(n) ? n : undefined
      }

      const payload = {
        nameEn: form.nameEn.trim(),
        nameUr: form.nameUr.trim() || undefined,
        brand: form.brand.trim() || undefined,
        categoryId: form.categoryId ? Number(form.categoryId) : undefined,
        unit: form.unit,
        costPrice: num(form.costPrice),
        salePrice: num(form.salePrice) ?? 0,
        wholesalePrice: num(form.wholesalePrice),
        stockQty: toBase(num(form.stockQty) ?? 0, form.unit),
        lowStockAt:
          form.lowStockAt.trim() === ''
            ? undefined
            : toBase(num(form.lowStockAt) ?? 0, form.unit),
        tags: form.tags,
        barcode: form.barcode.trim() || undefined,
        expiryDate: form.expiryDate || undefined,
        isActive: form.isActive,
        imageId,
      }

      if (isEdit) {
        // stockQty yahan se nikal dete hain — stock sirf adjustStock() se badalta hai,
        // warna movement history aur asal stock me farq aa jayega.
        const { stockQty: _ignored, ...editable } = payload
        void _ignored
        await updateProduct(productId, editable)
      } else {
        await createProduct(payload)
      }

      onToast(t('form.saved'))
      goBack()
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!isEdit) return
    if (!window.confirm(t('form.deleteConfirm'))) return
    await deleteProduct(productId)
    onToast(t('common.done'))
    navigate('/products')
  }

  if (!loaded) {
    return (
      <div className="flex justify-center py-20 text-slate-400">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  const cost = Number.parseFloat(form.costPrice)
  const sale = Number.parseFloat(form.salePrice)
  const showProfit = Number.isFinite(cost) && Number.isFinite(sale) && cost > 0
  const profit = showProfit ? sale - cost : 0
  const margin = showProfit && sale > 0 ? (profit / sale) * 100 : 0

  return (
    <div className="pb-32">
      <AppHeader
        title={isEdit ? t('form.editTitle') : t('form.addTitle')}
        onBack={goBack}
        action={
          isEdit ? (
            <button
              onClick={remove}
              aria-label={t('common.delete')}
              className="flex h-11 w-11 items-center justify-center rounded-full text-red-500 active:bg-red-50 dark:active:bg-red-950"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : undefined
        }
      />

      <div className="space-y-4 p-4">
        <Card className="space-y-4">
          <Field label={t('form.image')}>
            <ImagePicker
              previewUrl={pendingUrl ?? existingUrl}
              onPick={(blob) => {
                setPendingImage(blob)
                setImageCleared(false)
              }}
              onRemove={() => {
                setPendingImage(null)
                setImageCleared(true)
              }}
            />
          </Field>

          <Field label={t('form.nameEn')} error={errors.nameEn} required>
            <Input
              value={form.nameEn}
              onChange={(e) => set('nameEn', e.target.value)}
              placeholder={t('form.nameEnPlaceholder')}
              dir="auto"
              autoFocus={!isEdit}
            />
          </Field>

          <Field label={t('form.category')}>
            <Select value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              <option value="">{t('common.uncategorized')}</option>
              {(categories ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {localizedName(c, lang)}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('form.salePrice')} error={errors.salePrice} required>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={form.salePrice}
                onChange={(e) => set('salePrice', e.target.value)}
                placeholder="0"
              />
            </Field>
            <Field label={t('form.unit')}>
              <Select value={form.unit} onChange={(e) => set('unit', e.target.value as Unit)}>
                {ALL_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {t(`unit.${u}` as 'unit.kg')}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('form.stockQty')}>
              <Input
                type="number"
                inputMode={allowsFraction(form.unit) ? 'decimal' : 'numeric'}
                min="0"
                step={allowsFraction(form.unit) ? '0.001' : '1'}
                value={form.stockQty}
                onChange={(e) => set('stockQty', e.target.value)}
                placeholder="0"
                disabled={isEdit}
              />
            </Field>
            <Field label={t('form.lowStockAt')}>
              <Input
                type="number"
                inputMode={allowsFraction(form.unit) ? 'decimal' : 'numeric'}
                min="0"
                step={allowsFraction(form.unit) ? '0.001' : '1'}
                value={form.lowStockAt}
                onChange={(e) => set('lowStockAt', e.target.value)}
                placeholder="0"
              />
            </Field>
          </div>
          {isEdit && (
            <p className="-mt-2 text-xs text-slate-500 dark:text-slate-400">
              {t('detail.adjustStock')} → {t('nav.stock')}
            </p>
          )}
        </Card>

        {/* Hidden tags apne card me — ye app ka signature feature hai. */}
        <Card>
          <Field label={t('form.tags')} hint={t('form.tagsHint')}>
            <TagInput tags={form.tags} onChange={(tags) => set('tags', tags)} />
          </Field>
        </Card>

        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="w-full rounded-xl bg-white py-3 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 active:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800"
        >
          {showMore ? `▲ ${t('form.lessOptions')}` : `▼ ${t('form.moreOptions')}`}
        </button>

        {showMore && (
          <Card className="space-y-4">
            <Field label={t('form.nameUr')}>
              <Input
                value={form.nameUr}
                onChange={(e) => set('nameUr', e.target.value)}
                placeholder={t('form.nameUrPlaceholder')}
                dir="rtl"
              />
            </Field>

            <Field label={t('form.brand')}>
              <Input
                value={form.brand}
                onChange={(e) => set('brand', e.target.value)}
                placeholder={t('form.brandPlaceholder')}
                dir="auto"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={t('form.costPrice')}>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={form.costPrice}
                  onChange={(e) => set('costPrice', e.target.value)}
                  placeholder="0"
                />
              </Field>
              <Field label={t('form.wholesalePrice')}>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={form.wholesalePrice}
                  onChange={(e) => set('wholesalePrice', e.target.value)}
                  placeholder="0"
                />
              </Field>
            </div>

            {showProfit && (
              <div className="flex gap-4 rounded-xl bg-brand-50 px-4 py-3 dark:bg-brand-900/30">
                <div>
                  <p className="text-xs text-brand-700 dark:text-brand-300">{t('form.profit')}</p>
                  <p className="font-bold text-brand-800 dark:text-brand-200">
                    {formatMoney(profit, settings.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-brand-700 dark:text-brand-300">{t('form.margin')}</p>
                  <p className="font-bold text-brand-800 dark:text-brand-200">
                    {margin.toFixed(1)}%
                  </p>
                </div>
              </div>
            )}

            <Field label={t('form.barcode')}>
              <Input
                value={form.barcode}
                onChange={(e) => set('barcode', e.target.value)}
                inputMode="numeric"
                placeholder="8964000..."
              />
            </Field>

            <Field label={t('form.expiryDate')}>
              <Input
                type="date"
                value={form.expiryDate}
                onChange={(e) => set('expiryDate', e.target.value)}
              />
            </Field>

            <label className="flex items-center gap-3 py-1">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => set('isActive', e.target.checked)}
                className="h-5 w-5 rounded accent-brand-600"
              />
              <span className="text-sm font-medium">{t('form.isActive')}</span>
            </label>
          </Card>
        )}
      </div>

      {/* Save button hamesha screen par — lamba form scroll karne ki zaroorat nahi. */}
      <div className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 p-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto max-w-lg">
          <Button full onClick={save} disabled={saving}>
            {saving ? <Spinner /> : t('common.save')}
          </Button>
        </div>
      </div>
    </div>
  )
}
