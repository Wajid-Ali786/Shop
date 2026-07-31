import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  createCategory,
  deleteCategory,
  listCategories,
  listProducts,
  rebuildSearchBlobs,
  seedDefaultCategories,
  updateCategory,
} from '../db/repo'
import type { Category } from '../db/types'
import { useI18n, localizedName } from '../i18n'
import { goBack } from '../lib/router'
import { AppHeader, Button, Field, Input, Sheet, Spinner } from '../components/ui'

/** Karyana shops me aksar yehi icons kaam aate hain. */
const ICON_CHOICES = [
  '📦', '🌾', '🛢️', '🌶️', '🥛', '☕', '🍪', '🍞', '🧼', '🪥',
  '🧹', '🧊', '🥤', '🍬', '🥚', '🧴', '🚬', '🍚', '🫘', '🧂',
]

export function CategoriesScreen({ onToast }: { onToast: (msg: string) => void }) {
  const { t, lang } = useI18n()
  const categories = useLiveQuery(() => listCategories(), [])
  const products = useLiveQuery(() => listProducts(), [])
  const [editing, setEditing] = useState<Category | 'new'>()

  const productCounts = useMemo(() => {
    const counts = new Map<number, number>()
    for (const p of products ?? []) {
      if (p.categoryId === undefined) continue
      counts.set(p.categoryId, (counts.get(p.categoryId) ?? 0) + 1)
    }
    return counts
  }, [products])

  const remove = async (cat: Category) => {
    if (!window.confirm(t('categories.deleteConfirm'))) return
    await deleteCategory(cat.id!)
    // Category ka naam searchBlob ka hissa hai, isliye products refresh karne parte hain.
    await rebuildSearchBlobs()
    onToast(t('common.done'))
  }

  const restoreDefaults = async () => {
    const added = await seedDefaultCategories()
    onToast(added > 0 ? t('categories.restored', { count: added }) : t('common.done'))
  }

  if (!categories) {
    return (
      <div className="flex justify-center py-20 text-slate-400">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  return (
    <div className="pb-4">
      <AppHeader
        title={t('categories.title')}
        onBack={goBack}
        action={
          <button
            onClick={() => setEditing('new')}
            aria-label={t('categories.add')}
            className="flex h-11 w-11 items-center justify-center rounded-full text-brand-600 active:bg-brand-50 dark:active:bg-brand-950"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
          </button>
        }
      />

      <div className="p-4">
        {categories.length === 0 ? (
          <div className="py-10 text-center">
            <p className="mb-4 text-slate-500 dark:text-slate-400">{t('categories.empty')}</p>
            <Button variant="secondary" onClick={restoreDefaults}>
              {t('categories.restoreDefaults')}
            </Button>
          </div>
        ) : (
          <ul className="space-y-2">
            {categories.map((cat) => (
              <li
                key={cat.id}
                className="flex items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-slate-200/70 dark:bg-slate-900 dark:ring-slate-800"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xl dark:bg-slate-800">
                  {cat.icon ?? '📦'}
                </span>

                <button onClick={() => setEditing(cat)} className="min-w-0 flex-1 text-start">
                  <p className="truncate font-semibold" dir="auto">
                    {localizedName(cat, lang)}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('categories.productCount', { count: productCounts.get(cat.id!) ?? 0 })}
                  </p>
                </button>

                <button
                  onClick={() => remove(cat)}
                  aria-label={`${t('common.delete')} ${cat.nameEn}`}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-400 active:bg-red-50 active:text-red-600 dark:active:bg-red-950"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <CategoryEditor
        value={editing}
        onClose={() => setEditing(undefined)}
        onSaved={() => onToast(t('form.saved'))}
      />
    </div>
  )
}

function CategoryEditor({
  value,
  onClose,
  onSaved,
}: {
  value?: Category | 'new'
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useI18n()
  const isNew = value === 'new'
  const [nameEn, setNameEn] = useState('')
  const [nameUr, setNameUr] = useState('')
  const [icon, setIcon] = useState('📦')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!value) return
    if (value === 'new') {
      setNameEn('')
      setNameUr('')
      setIcon('📦')
    } else {
      setNameEn(value.nameEn)
      setNameUr(value.nameUr ?? '')
      setIcon(value.icon ?? '📦')
    }
  }, [value])

  const save = async () => {
    if (!nameEn.trim() || saving) return
    setSaving(true)
    try {
      const payload = { nameEn: nameEn.trim(), nameUr: nameUr.trim() || undefined, icon }
      if (isNew) await createCategory(payload)
      else if (value) await updateCategory(value.id!, payload)
      // Category ka naam products ke searchBlob me shamil hai.
      await rebuildSearchBlobs()
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      open={Boolean(value)}
      onClose={onClose}
      title={isNew ? t('categories.add') : t('categories.edit')}
    >
      <div className="space-y-4">
        <Field label={t('categories.icon')}>
          <div className="grid grid-cols-8 gap-2">
            {ICON_CHOICES.map((choice) => (
              <button
                key={choice}
                type="button"
                onClick={() => setIcon(choice)}
                className={
                  'flex h-11 items-center justify-center rounded-lg text-xl transition-colors ' +
                  (icon === choice
                    ? 'bg-brand-100 ring-2 ring-brand-500 dark:bg-brand-900/50'
                    : 'bg-slate-100 dark:bg-slate-800')
                }
              >
                {choice}
              </button>
            ))}
          </div>
        </Field>

        <Field label={t('categories.nameEn')} required>
          <Input
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
            dir="auto"
            autoFocus
          />
        </Field>

        <Field label={t('categories.nameUr')}>
          <Input value={nameUr} onChange={(e) => setNameUr(e.target.value)} dir="rtl" />
        </Field>

        <Button full onClick={save} disabled={!nameEn.trim() || saving}>
          {t('common.save')}
        </Button>
      </div>
    </Sheet>
  )
}
