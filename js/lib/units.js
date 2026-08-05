/**
 * Karyana shop me do bilkul alag tarah ki cheezein bikti hain, aur inhe ek
 * jaisa samajhna hi asal galti thi:
 *
 *   loose — khuli cheez, tol kar bikti hai (chawal, cheeni, khula tel).
 *           Shopkeeper WAZAN ginta hai: "12.5 kg".
 *
 *   pack  — banda banaya packet/bottle (Coca Cola 1.5L, Surf 1kg, doodh 250ml).
 *           Shopkeeper GINTI karta hai: "6 bottle" — 6 litre nahi.
 *           Bottle ke andar kitna hai wo alag baat hai (packSize + packUnit).
 */

// ------------------------------------------------------------ loose units

/** Har loose unit ka base — stock hamesha base unit me store hota hai. */
const BASE_OF = {
  kg: 'kg',
  g: 'kg',
  l: 'l',
  ml: 'l',
  piece: 'piece',
}

/** Ek unit me kitne base units hain. */
const TO_BASE = {
  kg: 1,
  g: 0.001,
  l: 1,
  ml: 0.001,
  piece: 1,
}

/** Wo units jinme khuli cheez naapi ja sakti hai. */
export const LOOSE_UNITS = ['kg', 'g', 'l', 'ml', 'piece']

/** Jin unit me shopkeeper stock likhta hai (base units). */
export const LOOSE_BASE_UNITS = ['kg', 'l', 'piece']

/** Ek pack ko kya kahenge — "6 bottle", "6 packet". */
export const PACK_LABELS = ['piece', 'packet', 'bottle', 'tin', 'box', 'dozen', 'bag']

/** Pack ke andar ki miqdaar kis me naapi jaye (optional). */
export const PACK_SIZE_UNITS = ['ml', 'l', 'g', 'kg']

export function baseUnit(unit) {
  return BASE_OF[unit] || 'piece'
}

/** Wo units jinme ye loose product enter kiya ja sakta hai (ek hi base wale). */
export function compatibleUnits(unit) {
  const base = baseUnit(unit)
  return LOOSE_UNITS.filter((u) => BASE_OF[u] === base)
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

// ---------------------------------------------------------------- product

/**
 * Purane products me `sellBy` nahi tha — un ka `unit` hi sab kuch tha.
 * Ye function purani aur nayi dono shakal ko ek jaisa bana deta hai, taake
 * kisi purane record ko dobara likhne ki zaroorat na pare.
 */
export function isPack(product) {
  if (!product) return false
  if (product.sellBy) return product.sellBy === 'pack'
  // Purana record: kg/g/l/ml wale tol kar bikte the, baqi gine jate the.
  return !['kg', 'g', 'l', 'ml'].includes(product.unit)
}

/** Pack products me aadha bottle nahi hota; khuli cheez me aadha kilo hota hai. */
export function allowsFraction(product) {
  if (isPack(product)) return false
  const base = baseUnit(product?.unit)
  return base === 'kg' || base === 'l'
}

/**
 * Stock ki asal shakal:
 *   loose → "12.5 kg", aur 1 se kam ho to "250 g"
 *   pack  → "6 bottle"   (kabhi "6 litre" nahi)
 */
export function formatQty(qty, product, unitLabel) {
  const value = Number(qty || 0)

  if (isPack(product)) {
    const label = product?.packLabel || product?.unit || 'piece'
    return `${round3(value)} ${unitLabel(label)}`
  }

  const base = baseUnit(product?.unit)
  let shown = value
  let display = base

  // 0.25 kg ko "250 g" likhna zyada qudrati lagta hai.
  if ((base === 'kg' || base === 'l') && value > 0 && value < 1) {
    display = base === 'kg' ? 'g' : 'ml'
    shown = fromBase(value, display)
  }

  return `${round3(shown)} ${unitLabel(display)}`
}

/** "1.5 L each" — pack ke andar kitna hai. Size na ho to kuch nahi. */
/**
 * Naap ka chhota nishan — jaisa bottle par likha hota hai.
 *
 * `unitLabel` poora lafz deta hai ("litre"), jo jumle me theek hai magar
 * tasveer ke kone wale nishan me bohat lamba. Bottle par bhi "2 L" hi likha
 * hota hai, is liye wahi. Ye chaar nishan har zabaan me ek jaise hain, is
 * liye tarjuma nahi hota.
 */
const SHORT_UNITS = { ml: 'ml', l: 'L', g: 'g', kg: 'kg' }

export function shortUnit(unit) {
  return SHORT_UNITS[unit] || unit || ''
}

/** Packet me kitna hai, chhote nishan ke saath — "2 L", "500 g". */
export function formatPackSizeShort(product) {
  if (!isPack(product) || !product?.packSize || !product?.packUnit) return ''
  return `${round3(product.packSize)} ${shortUnit(product.packUnit)}`
}

export function formatPackSize(product, unitLabel) {
  if (!isPack(product) || !product?.packSize || !product?.packUnit) return ''
  return `${round3(product.packSize)} ${unitLabel(product.packUnit)}`
}

/**
 * 6 bottle × 1.5 L = "9 L" — kul kitna maal para hai.
 * Sirf un pack products par jin ka size maloom ho.
 */
export function formatPackTotal(qty, product, unitLabel) {
  if (!isPack(product) || !product?.packSize || !product?.packUnit) return ''
  const total = round3(Number(qty || 0) * Number(product.packSize))
  if (!total) return ''

  // 1500 ml ko "1.5 l" likhna behtar hai.
  const unit = product.packUnit
  if ((unit === 'ml' || unit === 'g') && total >= 1000) {
    const bigger = unit === 'ml' ? 'l' : 'kg'
    return `${round3(total / 1000)} ${unitLabel(bigger)}`
  }
  return `${total} ${unitLabel(unit)}`
}

/** Qeemat kis cheez ke hisaab se hai — "per bottle" ya "per kg". */
export function priceUnitLabel(product, unitLabel) {
  if (isPack(product)) return unitLabel(product?.packLabel || product?.unit || 'piece')
  return unitLabel(baseUnit(product?.unit))
}
