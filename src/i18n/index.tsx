import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { en, type TranslationKey } from './en'
import { ur } from './ur'
import type { Unit } from '../db/types'
import { loadSettings, saveSetting } from '../db/repo'

export type Lang = 'en' | 'ur'

const DICTS: Record<Lang, Record<TranslationKey, string>> = { en, ur }

export type TFunction = (key: TranslationKey, vars?: Record<string, string | number>) => string

interface I18nValue {
  lang: Lang
  dir: 'ltr' | 'rtl'
  setLang: (lang: Lang) => void
  t: TFunction
  /** Unit ka localized naam — formatQty() ko yehi pass hota hai. */
  unitLabel: (u: Unit) => string
  ready: boolean
}

const I18nContext = createContext<I18nValue | null>(null)

/** {name} jaise placeholders bharta hai. */
function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in vars ? String(vars[key]) : match,
  )
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    loadSettings()
      .then((s) => setLangState(s.lang))
      .catch(() => setLangState('en'))
      .finally(() => setReady(true))
  }, [])

  // <html lang/dir> set karna zaroori hai — is se Urdu me poora layout RTL ho jata hai.
  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ur' ? 'rtl' : 'ltr'
  }, [lang])

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    void saveSetting('lang', next)
  }, [])

  const t = useCallback<TFunction>(
    (key, vars) => interpolate(DICTS[lang][key] ?? en[key] ?? key, vars),
    [lang],
  )

  const unitLabel = useCallback((u: Unit) => t(`unit.${u}` as TranslationKey), [t])

  const value = useMemo<I18nValue>(
    () => ({ lang, dir: lang === 'ur' ? 'rtl' : 'ltr', setLang, t, unitLabel, ready }),
    [lang, setLang, t, unitLabel, ready],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n ko I18nProvider ke andar hona chahiye')
  return ctx
}

/** Product ka naam maujuda zabaan ke hisaab se — Urdu naam na ho to English. */
export function localizedName(
  item: { nameEn: string; nameUr?: string },
  lang: Lang,
): string {
  if (lang === 'ur' && item.nameUr?.trim()) return item.nameUr
  return item.nameEn
}
