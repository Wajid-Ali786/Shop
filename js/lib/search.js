/**
 * Search — app ka sab se ahem hissa.
 *
 * Dukandar tezi se type karta hai, hijje har baar alag hote hain, aur kabhi
 * Roman kabhi Urdu likhta hai. Isliye har lafz ko pehle ek "canonical" shakal
 * par laate hain, phir match karte hain.
 */

/** Urdu/Arabic ke aerab (zabar, zer, pesh wagera) aur tatweel. */
const ARABIC_DIACRITICS = /[ً-ْٰٟـۖ-ۭ]/g

/** Urdu me ek hi awaaz ke kai huroof — sab ko ek shakal par. */
const URDU_FOLD = [
  [/[آأإٱ]/g, 'ا'], // آ أ إ ٱ → ا
  [/[ہۃة]/g, 'ه'], // ہ ۃ ة → ه
  [/[یىي]/g, 'ی'], // ی ى ي → ی
  [/[ؤئ]/g, 'و'], // ؤ ئ → و
  [/ك/g, 'ک'], // ك → ک
]

/**
 * Roman-Urdu ke hijje: "chawal", "chaawal", "cawal" — teenon ek hi cheez.
 * Tarteeb ahem hai (do-harfi rules pehle).
 */
const ROMAN_FOLD = [
  [/ph/g, 'f'],
  [/gh/g, 'g'],
  [/kh/g, 'k'],
  [/ch/g, 'c'],
  [/sh/g, 's'],
  [/th/g, 't'],
  [/dh/g, 'd'],
  [/bh/g, 'b'],
  [/ck/g, 'k'],
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
  // Wo huroof jo log kabhi likhte hain kabhi nahi.
  [/h/g, ''],
  [/'/g, ''],
]

/** Arabic-Indic (٠١٢) aur Extended (۰۱۲) digits → 0-9. */
function foldDigits(s) {
  return s.replace(/[٠-٩۰-۹]/g, (d) => {
    const code = d.charCodeAt(0)
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660
    return String(code - base)
  })
}

/**
 * Text ko canonical shakal par laata hai.
 * Product save karte waqt AUR search karte waqt — dono jagah yehi chalta hai,
 * warna dono taraf ki shakal alag ho jayegi aur match nahi hoga.
 */
export function normalize(input) {
  if (!input) return ''
  let s = String(input).toLowerCase().normalize('NFKD')

  s = foldDigits(s)
  s = s.replace(ARABIC_DIACRITICS, '')
  for (const [re, to] of URDU_FOLD) s = s.replace(re, to)

  // Latin accents (é → e), phir Roman folding.
  s = s.replace(/[̀-ͯ]/g, '')
  for (const [re, to] of ROMAN_FOLD) s = s.replace(re, to)

  // "chaaaawal" jaise repeated letters aur punctuation.
  s = s.replace(/([a-z])\1+/g, '$1')
  s = s.replace(/[^\p{L}\p{N}\s]+/gu, ' ')
  return s.replace(/\s+/g, ' ').trim()
}

/**
 * Product ka poora searchable text. Hidden tags yahin aate hain — list me
 * kahin nazar nahi aate, lekin search inhe parhta hai.
 */
export function buildSearchBlob(product, categoryName) {
  const parts = [
    product.nameEn,
    product.nameUr,
    product.brand,
    categoryName,
    product.barcode,
    ...(product.tags || []),
  ]
  const raw = parts.filter(Boolean).join(' ')
  // Asal text bhi rakhte hain taake barcode/number ka theek match na toote.
  return `${normalize(raw)} ${raw.toLowerCase()}`.trim()
}

/**
 * Do lafzon ke darmiyan edit distance (Levenshtein), ek limit ke saath.
 * Limit se zyada nikle to jaldi haath khada kar deta hai — poori list par
 * chalta hai isliye tez hona zaroori hai.
 */
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)

  for (let i = 1; i <= a.length; i++) {
    const curr = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
      if (curr[j] < best) best = curr[j]
    }
    if (best > max) return max + 1
    prev = curr
  }
  return prev[b.length]
}

/** Lafz ki lambai ke hisaab se kitni galti maaf ki ja sakti hai. */
function allowedTypos(word) {
  if (word.length <= 3) return 0
  if (word.length <= 5) return 1
  return 2
}

/**
 * Search do marhalon me:
 *   1. Normalized substring match — foran, aur wahi deta hai jo user soch raha hai.
 *   2. Nateeje kam hon to lafz-ba-lafz fuzzy — hijje ki galti (chawl → chawal) pakadta hai.
 */
export function searchProducts(products, query) {
  const q = String(query || '').trim()
  if (!q) return products

  const nq = normalize(q)
  const rawq = q.toLowerCase()

  const starts = []
  const contains = []

  for (const p of products) {
    const blob = p.searchBlob || ''
    if (!blob) continue

    if (blob.startsWith(nq) || normalize(p.nameEn).startsWith(nq)) starts.push(p)
    else if ((nq && blob.includes(nq)) || blob.includes(rawq)) contains.push(p)
  }

  const hits = [...starts, ...contains]
  if (hits.length >= 3 || !nq) return hits

  // ---- fuzzy fallback ----
  const seen = new Set(hits.map((p) => p.id))
  const queryWords = nq.split(' ').filter(Boolean)
  const scored = []

  for (const p of products) {
    if (seen.has(p.id)) continue
    const words = (p.searchBlob || '').split(' ').filter(Boolean)

    let best = Infinity
    for (const qw of queryWords) {
      const budget = allowedTypos(qw)
      if (budget === 0) continue
      for (const w of words) {
        const d = editDistance(qw, w, budget)
        if (d <= budget && d < best) best = d
      }
    }
    if (best !== Infinity) scored.push({ product: p, score: best })
  }

  scored.sort((a, b) => a.score - b.score)
  for (const s of scored) hits.push(s.product)
  return hits
}
