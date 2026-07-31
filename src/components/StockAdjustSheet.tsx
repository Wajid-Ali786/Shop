import { useEffect, useState } from 'react'
import type { MovementReason, Product } from '../db/types'
import { useI18n, localizedName } from '../i18n'
import { adjustStock, setStockCount } from '../db/repo'
import { allowsFraction, compatibleUnits, formatQty, toBase } from '../lib/units'
import type { Unit } from '../db/types'
import { Button, Field, Input, Select, Sheet, cx } from './ui'

type Mode = 'in' | 'out' | 'count'

const REASONS: Record<Mode, MovementReason[]> = {
  in: ['purchase', 'correction', 'other'],
  out: ['sale', 'damage', 'expired', 'other'],
  count: ['correction'],
}

/**
 * Stock badalne ka waahid UI. Teen tareeqe:
 *   in    — naya maal aaya
 *   out   — becha / kharab hua
 *   count — ginti kar ke asal miqdaar set kar di
 */
export function StockAdjustSheet({
  product,
  open,
  onClose,
  onDone,
}: {
  product?: Product
  open: boolean
  onClose: () => void
  onDone: (message: string) => void
}) {
  const { t, lang, unitLabel } = useI18n()
  const [mode, setMode] = useState<Mode>('in')
  const [qty, setQty] = useState('')
  const [entryUnit, setEntryUnit] = useState<Unit>('kg')
  const [reason, setReason] = useState<MovementReason>('purchase')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  // Sheet khulte hi form reset — pichli entry ka koi asar na rahe.
  useEffect(() => {
    if (!open || !product) return
    setMode('in')
    setQty('')
    setEntryUnit(product.unit)
    setReason('purchase')
    setNote('')
  }, [open, product])

  // Mode badle to us mode ki pehli wajah default ho jaye.
  useEffect(() => {
    setReason(REASONS[mode][0])
  }, [mode])

  if (!product) return null

  const units = compatibleUnits(product.unit)
  const parsed = Number.parseFloat(qty)
  const valid = Number.isFinite(parsed) && parsed >= 0 && qty.trim() !== ''

  const preview = (() => {
    if (!valid) return null
    const base = toBase(parsed, entryUnit)
    if (mode === 'count') return base
    return Math.max(0, product.stockQty + (mode === 'in' ? base : -base))
  })()

  const submit = async () => {
    if (!valid || saving) return
    setSaving(true)
    try {
      const base = toBase(parsed, entryUnit)
      if (mode === 'count') {
        await setStockCount(product.id!, base, note || undefined)
      } else {
        if (base === 0) return
        await adjustStock({
          productId: product.id!,
          qty: base,
          type: mode,
          reason,
          note: note || undefined,
        })
      }
      onDone(t('stock.adjusted'))
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={localizedName(product, lang)}>
      <div className="space-y-4">
        <div className="rounded-xl bg-slate-100 px-4 py-3 dark:bg-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('stock.currentStock')}</p>
          <p className="text-lg font-bold">
            {formatQty(product.stockQty, product.unit, unitLabel)}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {(['in', 'out', 'count'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cx(
                'min-h-12 rounded-xl px-2 text-sm font-semibold transition-colors',
                mode === m
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
              )}
            >
              {m === 'in' ? `+ ${t('stock.addStock')}` : m === 'out' ? `− ${t('stock.removeStock')}` : t('stock.setCount')}
            </button>
          ))}
        </div>

        <Field label={t('stock.quantity')} required>
          <div className="flex gap-2">
            <Input
              type="number"
              inputMode={allowsFraction(entryUnit) ? 'decimal' : 'numeric'}
              step={allowsFraction(entryUnit) ? '0.001' : '1'}
              min="0"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="0"
              autoFocus
              className="flex-1"
            />
            {units.length > 1 ? (
              <Select
                value={entryUnit}
                onChange={(e) => setEntryUnit(e.target.value as Unit)}
                className="w-32"
              >
                {units.map((u) => (
                  <option key={u} value={u}>
                    {unitLabel(u)}
                  </option>
                ))}
              </Select>
            ) : (
              <div className="flex w-32 items-center justify-center rounded-xl bg-slate-100 px-3 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {unitLabel(product.unit)}
              </div>
            )}
          </div>
        </Field>

        {preview !== null && (
          <div className="rounded-xl bg-brand-50 px-4 py-3 dark:bg-brand-900/30">
            <p className="text-xs text-brand-700 dark:text-brand-300">{t('stock.newStock')}</p>
            <p className="text-lg font-bold text-brand-800 dark:text-brand-200">
              {formatQty(preview, product.unit, unitLabel)}
            </p>
          </div>
        )}

        {mode !== 'count' && (
          <Field label={t('stock.reason')}>
            <Select value={reason} onChange={(e) => setReason(e.target.value as MovementReason)}>
              {REASONS[mode].map((r) => (
                <option key={r} value={r}>
                  {t(`reason.${r}` as 'reason.purchase')}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label={t('stock.note')}>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('stock.notePlaceholder')}
            dir="auto"
          />
        </Field>

        <Button full onClick={submit} disabled={!valid || saving}>
          {t('common.save')}
        </Button>
      </div>
    </Sheet>
  )
}
