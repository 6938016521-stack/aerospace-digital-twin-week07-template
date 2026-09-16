import type { CanonicalUnit } from '../units/types'

/** Unit is carried by the vector; frame is explicit rather than inferred from axes. */
export interface FramedVector<F extends 'engineering' | 'render', U extends CanonicalUnit> {
  readonly frame: F
  readonly unit: U
  readonly x: number
  readonly y: number
  readonly z: number
}

export type EngineeringVector<U extends CanonicalUnit> = FramedVector<'engineering', U>
export type RenderVector<U extends CanonicalUnit> = FramedVector<'render', U>

/** Body +X forward, +Y right, +Z down → render +X forward, +Y up, +Z right. */
export function engineeringToRender<U extends CanonicalUnit>(v: EngineeringVector<U>): RenderVector<U> {
  return { frame: 'render', unit: v.unit, x: v.x, y: -v.z, z: v.y }
}

/** Inverse of a proper (determinant +1) rotation; valid for polar and axial vectors. */
export function renderToEngineering<U extends CanonicalUnit>(v: RenderVector<U>): EngineeringVector<U> {
  return { frame: 'engineering', unit: v.unit, x: v.x, y: v.z, z: -v.y }
}
