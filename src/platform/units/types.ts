import type { ProvenanceId } from '../provenance/types'

export const CANONICAL_UNITS = [
  '1', 'm', 'm^2', 'kg', 'kg*m^2', 's', 'rad', 'rad/s', 'rad/s^2',
  'm/s', 'm/s^2', 'kg/m^3', 'N', 'N*m', 'Pa', 'K', '1/rad',
] as const

Object.freeze(CANONICAL_UNITS)

export type CanonicalUnit = (typeof CANONICAL_UNITS)[number]

export interface KnownQuantity<U extends CanonicalUnit> {
  readonly status: 'known'
  readonly value: number
  readonly unit: U
  readonly provenanceId: ProvenanceId
}

export interface UnconfiguredQuantity<U extends CanonicalUnit> {
  readonly status: 'unconfigured'
  readonly unit: U
  readonly reason: string
}

export type EngineeringValue<U extends CanonicalUnit> =
  | KnownQuantity<U>
  | UnconfiguredQuantity<U>

export function unconfigured<U extends CanonicalUnit>(
  unit: U,
  reason = 'No engineering value has been supplied.',
): UnconfiguredQuantity<U> {
  return Object.freeze({ status: 'unconfigured', unit, reason })
}

/** Construct a finite canonical value; this does not verify its physical validity. */
export function quantity<U extends CanonicalUnit>(
  value: number,
  unit: U,
  provenanceId: ProvenanceId,
): KnownQuantity<U> {
  if (!Number.isFinite(value)) throw new Error('Engineering quantities must be finite.')
  if (!provenanceId.trim()) throw new Error('Known quantities require a provenance reference.')
  if (!(CANONICAL_UNITS as readonly string[]).includes(unit)) {
    throw new Error(`Unknown canonical unit: ${unit}`)
  }
  return Object.freeze({ status: 'known', value, unit, provenanceId })
}
