// Compile-only tests: npm run typecheck checks the @ts-expect-error assertions.
// These intentionally invalid examples must never run as application code.
import { quantity, unconfigured, engineeringToRender } from '../../src/platform'
import type { KnownQuantity, EngineeringValue, CoreCommand, CanonicalQuantityId, AircraftState } from '../../src/platform'

export const validMoment: KnownQuantity<'N*m'> = quantity(1350, 'N*m', 'synthetic-test')
export const missingAngle: EngineeringValue<'rad'> = unconfigured('rad')

// @ts-expect-error Force cannot be assigned to a moment.
export const incompatibleUnit: KnownQuantity<'N*m'> = quantity(5, 'N', 'synthetic-test')
// @ts-expect-error Degrees are display units, not canonical stored angles.
export const nonCanonicalUnit = quantity(10, 'deg', 'synthetic-test')
// @ts-expect-error A known quantity cannot omit provenance.
export const missingProvenance: KnownQuantity<'m'> = { status: 'known', value: 5, unit: 'm' }
// @ts-expect-error An unconfigured quantity has no value to use in arithmetic.
export const missingNumber = unconfigured('m').value
// @ts-expect-error Canonical IDs cannot create a second independent airspeed.
export const invalidQuantityId: CanonicalQuantityId = 'controls.airspeed'
// @ts-expect-error Already-rendered coordinates cannot be interpreted as engineering coordinates.
export const wrongFrame = engineeringToRender({ frame: 'render', unit: 'm', x: 1, y: 2, z: 3 })
// @ts-expect-error Vector units must also belong to the canonical unit catalog.
export const wrongVectorUnit = engineeringToRender({ frame: 'engineering', unit: 'banana', x: 1, y: 2, z: 3 })

export const validCommand: CoreCommand = {
  id: 'test-command', type: 'SET_AIRSPEED', payload: { value: quantity(20, 'm/s', 'synthetic-test') },
  source: 'numeric-input', context: { scenarioId: null, model: null },
}

// @ts-expect-error A typed airspeed command rejects an angle payload.
export const invalidCommand: CoreCommand = { ...validCommand, payload: { value: quantity(2, 'rad', 'test') } }

export function assertReadonlyState(state: AircraftState): void {
  // @ts-expect-error Modules/views cannot write shared physical state.
  state.massProperties.cgX = quantity(1, 'm', 'test')
  // @ts-expect-error Simulation state is owned by the kernel.
  state.simulation.status = 'running'
}
