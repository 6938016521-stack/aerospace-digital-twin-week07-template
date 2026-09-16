function parse(version: string): readonly number[] {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) throw new Error(`Unsupported version: ${version}`)
  const parts = version.split('.').map(Number)
  if (parts.some((part) => !Number.isSafeInteger(part))) throw new Error('Version component exceeds safe integer range.')
  return parts
}
export function matchesVersion(version: string, range: string): boolean {
  const actual = parse(version)
  if (range === '*') return true
  const operator = range[0] === '^' || range[0] === '~' ? range[0] : ''
  const base = parse(operator ? range.slice(1) : range)
  const compare = (a: readonly number[], b: readonly number[]) => {
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! - b[i]!
    return 0
  }
  if (!operator) return compare(actual, base) === 0
  const upper = operator === '~' ? [base[0]!, base[1]! + 1, 0] : base[0]! > 0 ? [base[0]! + 1, 0, 0] : base[1]! > 0 ? [0, base[1]! + 1, 0] : [0, 0, base[2]! + 1]
  return compare(actual, base) >= 0 && compare(actual, upper) < 0
}
