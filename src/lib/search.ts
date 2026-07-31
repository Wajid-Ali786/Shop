import Fuse from 'fuse.js'
import type { Product } from '../db/types'

/** Urdu/Arabic aerab (diacritics) aur tatweel — inhe hata dete hain. */
const ARABIC_DIACRITICS = /[ً-ٰٟـۖ-ۭ]/g

/** Urdu me ek hi awaaz ke kai huroof hain; unhe ek shakal par le aate hain. */
const URDU_FOLD: Array<[RegExp, string]> = [
  [/[آأإٱ]/g, 'ا'], // آ أ إ ٱ → ا
  [/[ہۃة]/g, 'ه'], // ہ ۃ ة → ه
  [/[یىي]/g, 'ی'], // ی ى ي → ی
  [/[ؤئ]/g, 'و'], // ؤ ئ → و
  [/ک/g, 'ك'], // ک → ك
]

/**
 * Roman-Urdu ki spelling har banda alag likhta hai. Ye rules alag-alag
 * spellings ko ek hi form par le aate hain, taake "chawal", "chaawal" aur
 * "cawal" — teenon ek hi cheez ban jayein.
 */
const ROMAN_FOLD: Array<[RegExp, string]> = [
  [/ph/g, 'f'],
  [/gh/g, 'g'],
  [/kh/g, 'k'],
  [/ch/g, 'c'],
  [/sh/g, 's'],
  [/th/g, 't'],
  [/dh/g, 'd'],
  [/bh/g, 'b'],
  [/z/g, 'j'],
  [/q/g, 'k'],
  [/x/g, 'k'],
  [/v/g, 'w'],
  [/y/g, 'i'],
  [/ee/g, 'i'],
  [/oo/g, 'u'],
  [/aa/g, 'a'],
  [/ai/g, 'a'],
  [/au/g, 'a'],
  [/e/g, 'a'],
  [/o/g, 'u'],
  // Silent/hamza-jaise huroof jo log kabhi likhte kabhi nahi.
  [/h/g, ''],
  [/'/g, ''],
]

/** Arabic-Indic aur Extended Arabic-Indic digits → 0-9. */
function foldDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (d) => {
    const code = d.charCodeAt(0)
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660
    return String(code - base)
  })
}

/**
 * Search ke liye text ko ek "canonical" shakal par le aata hai.
 * Yehi function product save karte waqt (searchBlob banane ke liye) aur
 * search karte waqt (query par) — dono jagah chalta hai, warna match nahi hoga.
 */
export function normalize(input: string): string {
  if (!input) return ''
  let s = input.toLowerCase().normalize('NFKD')

  s = foldDigits(s)
  s = s.replace(ARABIC_DIACRITICS, '')
  for (const [re, to] of URDU_FOLD) s = s.replace(re, to)

  // Latin accents hata do (é → e), phir Roman folding.
  s = s.replace(/[̀-ͯ]/g, '')
  for (const [re, to] of ROMAN_FOLD) s = s.replace(re, to)

  // Repeated letters ("chaaaawal") aur punctuation collapse.
  s = s.replace(/([a-z])\1+/g, '$1')
  s = s.replace(/[^\p{L}\p{N}\s]+/gu, ' ')
  return s.replace(/\s+/g, ' ').trim()
}

/**
 * Product ka poora searchable text — naam (dono zabanein), brand, tags aur barcode.
 * Hidden tags yahan aate hain: UI me nazar nahi aate, lekin search inhe dekhta hai.
 */
export function buildSearchBlob(
  p: Pick<Product, 'nameEn' | 'nameUr' | 'brand' | 'tags' | 'barcode'>,
  categoryName?: string,
): string {
  const parts = [p.nameEn, p.nameUr, p.brand, categoryName, p.barcode, ...(p.tags ?? [])]
  const raw = parts.filter(Boolean).join(' ')
  // Original bhi rakhte hain taake barcode/digits ka exact match na toote.
  return `${normalize(raw)} ${raw.toLowerCase()}`.trim()
}

export interface SearchOptions {
  /** Fuzzy fallback tab chalta hai jab substring match itne se kam de. */
  fuzzyThreshold?: number
}

/**
 * Do-step search:
 *   1. Normalized substring match — instant, aur exact soch ke mutabiq results deta hai.
 *   2. Agar results kam hon to Fuse.js fuzzy — spelling ki galti (chawl → chawal) pakadta hai.
 */
export function searchProducts(
  products: Product[],
  query: string,
  opts: SearchOptions = {},
): Product[] {
  const q = query.trim()
  if (!q) return products

  const nq = normalize(q)
  const rawq = q.toLowerCase()

  const exact: Product[] = []
  const partial: Product[] = []

  for (const p of products) {
    const blob = p.searchBlob || ''
    if (!blob) continue
    // Naam ke shuru se match ho to upar dikhana chahiye.
    if (blob.startsWith(nq) || normalize(p.nameEn).startsWith(nq)) exact.push(p)
    else if ((nq && blob.includes(nq)) || blob.includes(rawq)) partial.push(p)
  }

  const hits = [...exact, ...partial]
  const min = opts.fuzzyThreshold ?? 3
  if (hits.length >= min) return hits

  const fuse = new Fuse(products, {
    keys: ['searchBlob', 'nameEn', 'nameUr'],
    threshold: 0.4,
    ignoreLocation: true,
    minMatchCharLength: 2,
  })
  const fuzzy = fuse.search(nq || rawq).map((r) => r.item)

  const seen = new Set(hits.map((p) => p.id))
  for (const p of fuzzy) {
    if (!seen.has(p.id)) {
      hits.push(p)
      seen.add(p.id)
    }
  }
  return hits
}
