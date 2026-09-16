/** Body +X forward, +Y right, +Z down. Pure prescribed-force planar model. */
export function pitchBalance(inertia: number, requested: number, competing: number, cgX: number, tailX: number, tailForce: number) {
  if (![inertia, requested, competing, cgX, tailX, tailForce].every(Number.isFinite) || inertia <= 0) throw new Error('Finite inputs and positive pitch inertia are required.')
  const arm = cgX - tailX
  const controlMoment = arm * tailForce
  const requiredMoment = inertia * requested - competing
  const netMoment = controlMoment + competing
  const acceleration = netMoment / inertia
  const requiredForce = arm === 0 ? null : requiredMoment / arm
  if (![arm, controlMoment, requiredMoment, netMoment, acceleration, ...(requiredForce === null ? [] : [requiredForce])].every(Number.isFinite)) throw new Error('Pitch calculation overflow.')
  return { arm, controlMoment, requiredMoment, netMoment, acceleration, requiredForce }
}
export const pitchFields = {
  requestedAcceleration: { label: 'Requested pitch acceleration', unit: 'rad/s^2' },
  tailForce: { label: 'Tail force (+ down)', unit: 'N' },
  tailStation: { label: 'Tail force station X', unit: 'm' },
  competingMoment: { label: 'Competing pitch moment', unit: 'N*m' },
} as const
export const pitchOutputs = {
  signedArm: { label: 'Signed pitch arm', unit: 'm' },
  perpendicularArm: { label: 'Perpendicular distance', unit: 'm' },
  tailMoment: { label: 'Tail control moment', unit: 'N*m' },
  competingMoment: { label: 'Competing moment', unit: 'N*m' },
  requiredMoment: { label: 'Required control moment', unit: 'N*m' },
  achievedAcceleration: { label: 'Achieved acceleration', unit: 'rad/s^2' },
  requiredForce: { label: 'Required tail force', unit: 'N' },
} as const
