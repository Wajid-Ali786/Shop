/** Har unit ka base — stock hamesha base unit me store hota hai. */
const BASE_OF = {
  kg: 'kg',
  g: 'kg',
  l: 'l',
  ml: 'l',
  piece: 'piece',
  dozen: 'piece',
  packet: 'packet',
  bag: 'bag',
}

/** Ek unit me kitne base units hain. */
const TO_BASE = {
  kg: 1,
  g: 0.001,
  l: 1,
  ml: 0.001,
  piece: 1,
  dozen: 12,
  packet: 1,
  bag: 1,
}

export const ALL_UNITS = ['kg', 'g', 'l', 'ml', 'piece', 'dozen', 'packet', 'bag']

export function baseUnit(unit) {
  return BASE_OF[unit] || 'piece'
}

/** Wo units jinme ye product enter kiya ja sakta hai (ek hi base wale). */
export function compatibleUnits(unit) {
  const base = baseUnit(unit)
  return ALL_UNITS.filter((u) => BASE_OF[u] === base)
}

/** 250 g → 0.25 (kg). Form isi se stock save karta hai. */
export function toBase(qty, unit) {
  return round3(Number(qty || 0) * (TO_BASE[unit] ?? 1))
}

/** 0.25 (kg) → 250 agar unit = g. */
export function fromBase(qty, unit) {
  return round3(Number(qty || 0) / (TO_BASE[unit] ?? 1))
}

/** Floating point ka kachra saaf (0.1 + 0.2 wala masla). */
export function round3(n) {
  return Math.round((Number(n) + Number.EPSILON) * 1000) / 1000
}

/** Ye unit aadha/paun allow karta hai? Piece aur dozen me nahi hota. */
export function allowsFraction(unit) {
  const base = baseUnit(unit)
  return base === 'kg' || base === 'l'
}

/**
 * Parhne me asaan shakal: 0.25 kg → "250 g", 1.5 kg → "1.5 kg".
 * `unitLabel` i18n se aata hai taake Urdu me "کلو" likha jaye.
 */
export function formatQty(qty, unit, unitLabel) {
  const base = baseUnit(unit)
  let value = Number(qty || 0)
  let display = base

  if ((base === 'kg' || base === 'l') && value > 0 && value < 1) {
    display = base === 'kg' ? 'g' : 'ml'
    value = fromBase(value, display)
  }

  return `${round3(value)} ${unitLabel(display)}`
}
