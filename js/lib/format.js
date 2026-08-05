/** Rs 1,250 — Pakistani grouping ke saath. */
export function formatMoney(amount, currency = 'Rs') {
  const n = Number.isFinite(Number(amount)) ? Number(amount) : 0
  const formatted = new Intl.NumberFormat('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n)
  return `${currency} ${formatted}`
}

export function formatDate(value, lang = 'en') {
  if (value === undefined || value === null || value === '') return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(lang === 'ur' ? 'ur-PK' : 'en-PK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d)
}

export function formatDateTime(ts, lang = 'en') {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(lang === 'ur' ? 'ur-PK' : 'en-PK', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d)
}

/** Aaj se kitne din baad (manfi = guzar chuka). Expiry alerts ke liye. */
/**
 * Itne din pehle "jald khatam ho rahi hai" ka nishan lagna shuru hota hai.
 *
 * Ye yahan rehta hai, stock screen me nahi, kyunki ab isay product cards bhi
 * istemaal karte hain — do jagah do alag adad hone se list aur stock screen
 * ek doosre se ulti baat kehte.
 */
export const EXPIRY_WARNING_DAYS = 30

export function daysUntil(isoDate) {
  const target = new Date(`${isoDate}T00:00:00`)
  if (Number.isNaN(target.getTime())) return Infinity
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function todayIso() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
