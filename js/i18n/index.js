import { en } from './en.js'
import { ur } from './ur.js'

const DICTS = { en, ur }

let lang = 'en'
const listeners = new Set()

/** Zabaan browser me yaad rehti hai taake har baar chunni na pare. */
const STORAGE_KEY = 'karyana.lang'

export function initI18n() {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'en' || saved === 'ur') lang = saved
  applyLang()
}

export function getLang() {
  return lang
}

export function setLang(next) {
  if (next !== 'en' && next !== 'ur') return
  lang = next
  localStorage.setItem(STORAGE_KEY, next)
  applyLang()
  for (const fn of listeners) fn(lang)
}

export function onLangChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** <html lang/dir> — isi se poora layout RTL ho jata hai. */
function applyLang() {
  document.documentElement.lang = lang
  document.documentElement.dir = lang === 'ur' ? 'rtl' : 'ltr'
}

/** {name} jaise placeholders bharta hai. */
function interpolate(template, vars) {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in vars ? String(vars[key]) : match,
  )
}

export function t(key, vars) {
  const dict = DICTS[lang] || en
  return interpolate(dict[key] ?? en[key] ?? key, vars)
}

/** Unit ka localized naam — formatQty() ko yehi pass hota hai. */
export function unitLabel(unit) {
  return t(`unit.${unit}`)
}

/** Urdu naam ho to Urdu me, warna English. */
export function localizedName(item) {
  if (!item) return ''
  if (lang === 'ur' && item.nameUr && item.nameUr.trim()) return item.nameUr
  return item.nameEn || ''
}
