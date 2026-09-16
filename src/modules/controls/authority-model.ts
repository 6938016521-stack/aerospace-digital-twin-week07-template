/** Symmetric illustrative envelope; uncertainty is a bounded gain, not a probability. */
export const authorityFields = {
  kneeAngle: { label: 'Effectiveness knee', unit: 'rad' },
  reducedSlope: { label: 'Slope beyond knee (fraction)', unit: '1' },
  geometricLimit: { label: 'Geometric travel ±', unit: 'rad' },
  actuatorLimit: { label: 'Actuator travel ±', unit: 'rad' },
  validityLimit: { label: 'Declared model range ±', unit: 'rad' },
  forceLimit: { label: 'Equivalent tail force limit', unit: 'N' },
  gainUncertainty: { label: 'Effectiveness uncertainty (fraction)', unit: '1' },
  rateLimit: { label: 'Planning rate limit', unit: 'rad/s' },
  responseTime: { label: 'Planning time horizon', unit: 's' },
  startAngle: { label: 'Planning start pose', unit: 'rad' },
} as const
export const authorityOutputs = {
  targetAngle: { label: 'Required deflection, nominal', unit: 'rad' },
  worstCaseTargetAngle: { label: 'Required deflection, weakest effectiveness', unit: 'rad' },
  estimatedForce: { label: 'Requested force estimate', unit: 'N' },
  estimatedMoment: { label: 'Requested control moment estimate', unit: 'N*m' },
  estimatedNetMoment: { label: 'Requested net moment estimate', unit: 'N*m' },
  estimatedAcceleration: { label: 'Requested acceleration estimate', unit: 'rad/s^2' },
  usableAngle: { label: 'Usable travel ±', unit: 'rad' },
  availableMoment: { label: 'Nominal available moment ±', unit: 'N*m' },
  guaranteedMoment: { label: 'Conservative available moment ±', unit: 'N*m' },
  possibleMoment: { label: 'Upper uncertainty bound ±', unit: 'N*m' },
  authorityMargin: { label: 'Conservative static margin', unit: 'N*m' },
  reachableMin: { label: 'Reachable angle minimum', unit: 'rad' },
  reachableMax: { label: 'Reachable angle maximum', unit: 'rad' },
  rateMargin: { label: 'Conservative horizon margin', unit: 'N*m' },
  withinEnvelope: { label: 'Command within static envelope (0/1)', unit: '1' },
} as const
export type AuthorityLimits = { [K in keyof typeof authorityFields]: number }
export function validateLimits(l: AuthorityLimits) {
  if (!Object.values(l).every(Number.isFinite)) throw new Error('All C4 limits must be finite.')
  if (l.kneeAngle <= 0 || l.reducedSlope < 0 || l.reducedSlope > 1 || l.gainUncertainty < 0 || l.gainUncertainty >= 1) throw new Error('Knee must be positive, reduced slope in [0,1], and uncertainty in [0,1).')
  if ([l.geometricLimit, l.actuatorLimit, l.validityLimit, l.forceLimit, l.rateLimit, l.responseTime].some(v => v < 0)) throw new Error('Travel, force, rate and time limits must be nonnegative.')
}
export function effectiveAngle(angle: number, knee: number, slope: number) {
  return Math.sign(angle) * (Math.min(Math.abs(angle), knee) + Math.max(0, Math.abs(angle) - knee) * slope)
}
export function inverseEffectiveAngle(required: number, coefficient: number, knee: number, slope: number): number | null {
  if (required === 0) return 0
  if (coefficient === 0) return null
  const effective = required / coefficient
  const magnitude = Math.abs(effective)
  if (magnitude > knee && slope === 0) return null
  const angle = Math.sign(effective) * (magnitude <= knee ? magnitude : knee + (magnitude - knee) / slope)
  return Number.isFinite(angle) ? angle : null
}
export function authorityAssessment(l: AuthorityLimits, forcePerRadian: number, arm: number, required: number, command: number) {
  validateLimits(l)
  if (![forcePerRadian, arm, required, command].every(Number.isFinite)) throw new Error('Authority inputs must be finite.')
  const permittedEffective = forcePerRadian === 0 ? Infinity : l.forceLimit / (Math.abs(forcePerRadian) * (1 + l.gainUncertainty))
  const structural = permittedEffective < l.kneeAngle ? permittedEffective : l.reducedSlope === 0 ? Infinity : l.kneeAngle + (permittedEffective - l.kneeAngle) / l.reducedSlope
  const restrictions = { geometry: l.geometricLimit, actuator: l.actuatorLimit, validity: l.validityLimit, structure: structural }
  const usableAngle = Math.min(...Object.values(restrictions))
  const moment = (a: number) => forcePerRadian * arm * effectiveAngle(a, l.kneeAngle, l.reducedSlope)
  const availableMoment = Math.abs(moment(usableAngle))
  const guaranteedMoment = availableMoment * (1 - l.gainUncertainty)
  const possibleMoment = availableMoment * (1 + l.gainUncertainty)
  // The declared start must itself be inside the static envelope; never silently clamp it.
  const startValid = Math.abs(l.startAngle) <= usableAngle
  const travel = l.rateLimit * l.responseTime
  const reachableMin = Math.max(-usableAngle, l.startAngle - travel)
  const reachableMax = Math.min(usableAngle, l.startAngle + travel)
  const endpoints = [moment(reachableMin), moment(reachableMax)]
  const intervals = [1 - l.gainUncertainty, 1 + l.gainUncertainty].map(g => [Math.min(...endpoints) * g, Math.max(...endpoints) * g])
  const low = Math.max(...intervals.map(i => i[0]!)), high = Math.min(...intervals.map(i => i[1]!))
  const rateMargin = startValid ? Math.min(required - low, high - required) : null
  const result = { targetAngle: inverseEffectiveAngle(required, forcePerRadian * arm, l.kneeAngle, l.reducedSlope), worstCaseTargetAngle: inverseEffectiveAngle(required, forcePerRadian * arm * (1 - l.gainUncertainty), l.kneeAngle, l.reducedSlope), usableAngle, availableMoment, guaranteedMoment, possibleMoment, authorityMargin: guaranteedMoment - Math.abs(required), reachableMin: startValid ? reachableMin : null, reachableMax: startValid ? reachableMax : null, rateMargin, withinEnvelope: Math.abs(command) <= usableAngle ? 1 : 0 }
  if (!Object.values(result).every(v => v === null || Number.isFinite(v))) throw new Error('Authority arithmetic overflow.')
  return { ...result, restrictions, binding: Object.entries(restrictions).filter(([, v]) => v === usableAngle).map(([k]) => k), moment }
}
