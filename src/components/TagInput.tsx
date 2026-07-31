import { useState } from 'react'
import { useI18n } from '../i18n'

/**
 * Hidden search tags ka input. Ye tags product list me kabhi nazar nahi aate —
 * sirf search inhe parhta hai, taake shopkeeper apni marzi ke hijje daal sake.
 */
export function TagInput({
  tags,
  onChange,
}: {
  tags: string[]
  onChange: (tags: string[]) => void
}) {
  const { t } = useI18n()
  const [draft, setDraft] = useState('')

  const commit = (raw: string) => {
    const value = raw.trim().replace(/,$/, '')
    if (!value) return
    // Case-insensitive duplicate check.
    if (!tags.some((tag) => tag.toLowerCase() === value.toLowerCase())) {
      onChange([...tags, value])
    }
    setDraft('')
  }

  const remove = (index: number) => onChange(tags.filter((_, i) => i !== index))

  return (
    <div className="rounded-xl bg-white p-2 ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-brand-500 dark:bg-slate-800 dark:ring-slate-700">
      {tags.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {tags.map((tag, i) => (
            <li
              key={`${tag}-${i}`}
              className="flex items-center gap-1 rounded-lg bg-brand-50 py-1 ps-2.5 pe-1 text-sm font-medium text-brand-800 dark:bg-brand-900/40 dark:text-brand-200"
            >
              <span dir="auto">{tag}</span>
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`${t('common.delete')} ${tag}`}
                className="flex h-6 w-6 items-center justify-center rounded text-brand-600 active:bg-brand-100 dark:text-brand-300 dark:active:bg-brand-800"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        value={draft}
        onChange={(e) => {
          // Comma bhi tag complete karta hai — mobile keyboard par Enter se asaan hai.
          if (e.target.value.endsWith(',')) commit(e.target.value)
          else setDraft(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit(draft)
          } else if (e.key === 'Backspace' && !draft && tags.length) {
            remove(tags.length - 1)
          }
        }}
        onBlur={() => commit(draft)}
        placeholder={t('form.tagsPlaceholder')}
        dir="auto"
        className="w-full border-0 bg-transparent px-1.5 py-1.5 text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
      />
    </div>
  )
}
