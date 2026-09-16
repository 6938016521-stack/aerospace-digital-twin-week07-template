import { describe, expect, it } from 'vitest'
import { engineeringToRender, renderToEngineering } from '../../src/platform'
import type { EngineeringVector } from '../../src/platform'

function vector(x: number, y: number, z: number): EngineeringVector<'m'> {
  return { frame: 'engineering', unit: 'm', x, y, z }
}

describe('engineering/render coordinate contract', () => {
  it.each([
    [vector(1, 0, 0), [1, 0, 0]],
    [vector(0, 1, 0), [0, 0, 1]],
    [vector(0, 0, 1), [0, -1, 0]],
  ] as const)('maps the body basis %j correctly', (input, expected) => {
    const output = engineeringToRender(input)
    expect(output.x).toBeCloseTo(expected[0])
    expect(output.y).toBeCloseTo(expected[1])
    expect(output.z).toBeCloseTo(expected[2])
    expect(output.frame).toBe('render')
    expect(output.unit).toBe('m')
  })

  it.each([vector(2, -3, 7), vector(-0.25, 6.5, -8), vector(0, 0, 0)])('round-trips %j', (input) => {
    expect(renderToEngineering(engineeringToRender(input))).toEqual(input)
  })

  it('preserves handedness: transformed X cross transformed Y equals transformed Z', () => {
    const x = engineeringToRender(vector(1, 0, 0))
    const y = engineeringToRender(vector(0, 1, 0))
    const z = engineeringToRender(vector(0, 0, 1))
    expect(x.y * y.z - x.z * y.y).toBeCloseTo(z.x)
    expect(x.z * y.x - x.x * y.z).toBeCloseTo(z.y)
    expect(x.x * y.y - x.y * y.x).toBeCloseTo(z.z)
  })

  it('preserves vector magnitude and does not modify input', () => {
    const input = Object.freeze(vector(3, -4, 12))
    const output = engineeringToRender(input)
    expect(Math.hypot(output.x, output.y, output.z)).toBeCloseTo(13)
    expect(input).toEqual(vector(3, -4, 12))
  })
})
