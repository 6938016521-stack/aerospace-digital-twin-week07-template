import { describe, expect, it } from 'vitest'
import { CANONICAL_QUANTITIES, CANONICAL_QUANTITY_IDS, createUnconfiguredAircraftState, quantity, unconfigured } from '../../src/platform'

describe('engineering quantities', () => {
  it('attaches unit and provenance to a known value, including a genuine zero', () => {
    expect(quantity(0, 'm', 'synthetic-test')).toEqual({ status: 'known', value: 0, unit: 'm', provenanceId: 'synthetic-test' })
  })

  it.each([NaN, Infinity, -Infinity])('rejects nonfinite value %s', (value) => {
    expect(() => quantity(value, 'm', 'synthetic-test')).toThrow('finite')
  })

  it('requires provenance for a known value', () => {
    expect(() => quantity(1, 'm', ' ')).toThrow('provenance')
  })

  it('does not give missing values numerical content or fabricated provenance', () => {
    const value = unconfigured('rad')
    expect(value.status).toBe('unconfigured')
    expect(value).not.toHaveProperty('value')
    expect(value).not.toHaveProperty('provenanceId')
    expect(Object.isFrozen(value)).toBe(true)
  })
})

describe('canonical P0 snapshot', () => {
  it('gives every physical field the declared unit and no invented value', () => {
    const state = createUnconfiguredAircraftState()
    let count = 0
    for (const group of Object.keys(CANONICAL_QUANTITIES) as (keyof typeof CANONICAL_QUANTITIES)[]) {
      for (const [field, unit] of Object.entries(CANONICAL_QUANTITIES[group])) {
        expect(state[group]).toHaveProperty(field, unconfigured(unit))
        count += 1
      }
    }
    expect(CANONICAL_QUANTITY_IDS).toHaveLength(count)
    expect(new Set(CANONICAL_QUANTITY_IDS).size).toBe(count)
  })

  it('contains no aircraft identity, active simulation, evidence or module outputs', () => {
    const state = createUnconfiguredAircraftState()
    expect(state.aircraftId).toBeNull()
    expect(state.simulation.status).toBe('unconfigured')
    expect(state.simulation.elapsedTime).toEqual(unconfigured('s'))
    expect(state.simulation.timeStep).toEqual(unconfigured('s'))
    expect(state.modules).toEqual({})
    expect(state.outputs).toEqual({})
    expect(state.evidence).toEqual([])
    expect(state.provenance).toEqual({})
  })

  it('prevents mutation of the initial snapshot and nested quantities', () => {
    const state = createUnconfiguredAircraftState()
    expect(() => Object.assign(state.massProperties.cgX, { value: 5 })).toThrow()
    expect(() => Object.assign(state.controls, { elevator: quantity(1, 'rad', 'test') })).toThrow()
    expect(Object.isFrozen(state)).toBe(true)
    expect(Object.isFrozen(state.simulation)).toBe(true)
  })
})
