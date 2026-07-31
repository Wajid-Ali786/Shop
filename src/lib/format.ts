/** Rs 1,250 — Pakistani grouping ke saath. */
export function formatMoney(amount: number, currency = 'Rs'): string {
  const n = Number.isFinite(amount) ? amount : 0
  const formatted = new Intl.NumberFormat('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n)
  return `${currency} ${formatted}`
}

export function formatDate(ts: number | string | undefined, lang: 'en' | 'ur' = 'en'): string {
  if (ts === undefined) return ''
  const d = typeof ts === 'string' ? new Date(ts) : new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(lang === 'ur' ? 'ur-PK' : 'en-PK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d)
}

export function formatDateTime(ts: number, lang: 'en' | 'ur' = 'en'): string {
  return new Intl.DateTimeFormat(lang === 'ur' ? 'ur-PK' : 'en-PK', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ts))
}

/** Aaj se kitne din baad (negative = guzar chuka). Expiry alerts ke liye. */
export function daysUntil(isoDate: string): number {
  const target = new Date(isoDate + 'T00:00:00')
  if (Number.isNaN(target.getTime())) return Number.POSITIVE_INFINITY
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function todayIso(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
