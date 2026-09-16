/** Display-boundary conversions; canonical angle storage is always radians. */
export function degreesToRadians(degrees: number): number {
  if (!Number.isFinite(degrees)) throw new Error('Angle must be finite.')
  const result = degrees * (Math.PI / 180)
  if (!Number.isFinite(result)) throw new Error('Converted angle must be finite.')
  return result
}

export function radiansToDegrees(radians: number): number {
  if (!Number.isFinite(radians)) throw new Error('Angle must be finite.')
  const result = radians * (180 / Math.PI)
  if (!Number.isFinite(result)) throw new Error('Converted angle must be finite.')
  return result
}
