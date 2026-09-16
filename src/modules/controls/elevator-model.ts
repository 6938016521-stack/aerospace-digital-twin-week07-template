/** Illustrative linear increment about a fixed body reference point; no trim, downwash or damping. */
export function elevatorEffect(density: number, speed: number, area: number, chord: number, derivative: number, angle: number) {
  if (![density, speed, area, chord, derivative, angle].every(Number.isFinite) || density <= 0 || speed < 0 || area <= 0 || chord <= 0) throw new Error('Positive density, area and chord, and nonnegative airspeed are required.')
  const dynamicPressure = 0.5 * density * speed ** 2
  const deltaCm = derivative * angle
  const deltaMoment = dynamicPressure * area * chord * deltaCm
  if (![dynamicPressure, deltaCm, deltaMoment].every(Number.isFinite)) throw new Error('Elevator calculation overflow.')
  return { dynamicPressure, deltaCm, deltaMoment }
}
export const aeroFields = {
  aeroMode: { label: 'Elevator model (0 prescribed, 1 linear, 2 piecewise)', unit: '1' },
  referenceStation: { label: 'Moment reference X', unit: 'm' },
  referenceArea: { label: 'Reference area S', unit: 'm^2' },
  referenceChord: { label: 'Reference chord c̄', unit: 'm' },
  elevatorDerivative: { label: 'Cmδe (per radian)', unit: '1/rad' },
} as const
export const aeroOutputs = {
  deltaCm: { label: 'ΔCm', unit: '1' },
  deltaMoment: { label: 'Elevator ΔM at reference', unit: 'N*m' },
  effectiveTailForce: { label: 'Equivalent tail force (+ down)', unit: 'N' },
} as const

/** Equivalent-force assumption: no residual couple at the tail station. */
export function transferElevatorMoment(referenceMoment: number, referenceX: number, tailX: number, cgX: number) {
  const referenceArm = referenceX - tailX
  if (referenceArm === 0) throw new Error('Moment reference and tail station must differ for the equivalent-force model.')
  const force = referenceMoment / referenceArm
  const momentAtCG = (cgX - tailX) * force
  if (![referenceMoment, referenceX, tailX, cgX, force, momentAtCG].every(Number.isFinite)) throw new Error('Moment transfer exceeds finite arithmetic.')
  return { force, momentAtCG }
}
