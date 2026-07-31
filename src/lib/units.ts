import type { Unit } from '../db/types'

/** Har unit ka base — stock hamesha base unit me store hota hai. */
const BASE_OF: Record<Unit, Unit> = {
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
const TO_BASE: Record<Unit, number> = {
  kg: 1,
  g: 0.001,
  l: 1,
  ml: 0.001,
  piece: 1,
  dozen: 12,
  packet: 1,
  bag: 1,
}

export const ALL_UNITS: Unit[] = ['kg', 'g', 'l', 'ml', 'piece', 'dozen', 'packet', 'bag']

/** Wo units jinme ye product enter kiya ja sakta hai (same base wale). */
export function compatibleUnits(unit: Unit): Unit[] {
  const base = BASE_OF[unit]
  return ALL_UNITS.filter((u) => BASE_OF[u] === base)
}

export function baseUnit(unit: Unit): Unit {
  return BASE_OF[unit]
}

/** 250 g → 0.25 (kg). Entry form isi se stock save karta hai. */
export function toBase(qty: number, unit: Unit): number {
  return round3(qty * TO_BASE[unit])
}

/** 0.25 (kg) → 250 agar `unit` = g. */
export function fromBase(qty: number, unit: Unit): number {
  return round3(qty / TO_BASE[unit])
}

/** Floating point ka kachra saaf (0.1+0.2 wala masla). */
export function round3(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000
}

/** Ye unit decimal quantity allow karta hai? Piece/dozen me aadha nahi hota. */
export function allowsFraction(unit: Unit): boolean {
  const base = BASE_OF[unit]
  return base === 'kg' || base === 'l'
}

/**
 * Stock ko parhne me asaan shakal me dikhata hai:
 * 0.25 kg → "250 g", 1.5 kg → "1.5 kg", 12 piece → "12 piece".
 */
export function formatQty(qty: number, unit: Unit, unitLabel: (u: Unit) => string): string {
  const base = BASE_OF[unit]
  let value = qty
  let display: Unit = base

  if ((base === 'kg' || base === 'l') && Math.abs(qty) > 0 && Math.abs(qty) < 1) {
    display = base === 'kg' ? 'g' : 'ml'
    value = fromBase(qty, display)
  }

  const rounded = round3(value)
  const text = Number.isInteger(rounded) ? String(rounded) : String(rounded)
  return `${text} ${unitLabel(display)}`
}
