import type { CanonicalUnit, EngineeringValue } from '../units/types'
import { unconfigured } from '../units/types'

/** Single definition of the unit and canonical path of every P0 shared quantity. */
export const CANONICAL_QUANTITIES = {
  geometry: {
    wingArea: 'm^2', span: 'm', meanAerodynamicChord: 'm', tailArea: 'm^2', tailArm: 'm',
  },
  massProperties: {
    mass: 'kg', cgX: 'm', cgY: 'm', cgZ: 'm',
    rollInertia: 'kg*m^2', pitchInertia: 'kg*m^2', yawInertia: 'kg*m^2',
  },
  environment: {
    density: 'kg/m^3', gravity: 'm/s^2', windX: 'm/s', windY: 'm/s', windZ: 'm/s',
  },
  motion: {
    airspeed: 'm/s', alpha: 'rad', beta: 'rad',
    positionX: 'm', positionY: 'm', positionZ: 'm',
    roll: 'rad', pitch: 'rad', yaw: 'rad',
    velocityX: 'm/s', velocityY: 'm/s', velocityZ: 'm/s',
    rollRate: 'rad/s', pitchRate: 'rad/s', yawRate: 'rad/s',
  },
  controls: {
    elevatorCommanded: 'rad', elevator: 'rad',
    aileronCommanded: 'rad', aileron: 'rad',
    rudderCommanded: 'rad', rudder: 'rad',
    flapCommanded: 'rad', flap: 'rad', throttleCommanded: '1', throttle: '1',
  },
  loads: {
    dynamicPressure: 'Pa', lift: 'N', drag: 'N', sideForce: 'N', thrust: 'N', weight: 'N',
    netForceX: 'N', netForceY: 'N', netForceZ: 'N',
    rollMoment: 'N*m', pitchMoment: 'N*m', yawMoment: 'N*m',
  },
} as const satisfies Readonly<Record<string, Readonly<Record<string, CanonicalUnit>>>>

Object.values(CANONICAL_QUANTITIES).forEach(Object.freeze)
Object.freeze(CANONICAL_QUANTITIES)

type Definitions = typeof CANONICAL_QUANTITIES
export type QuantityGroup = keyof Definitions
export type CanonicalQuantityId = {
  [G in QuantityGroup]: `${G}.${keyof Definitions[G] & string}`
}[QuantityGroup]

export type PhysicalState = {
  readonly [G in QuantityGroup]: {
    readonly [K in keyof Definitions[G]]: EngineeringValue<Definitions[G][K] & CanonicalUnit>
  }
}

export const CANONICAL_QUANTITY_IDS: readonly CanonicalQuantityId[] = Object.freeze(
  Object.entries(CANONICAL_QUANTITIES).flatMap(([group, fields]) =>
    Object.keys(fields).map((field) => `${group}.${field}` as CanonicalQuantityId),
  ),
)

/** Maps the unit catalog to unconfigured quantities; no physical defaults are supplied. */
export function createUnconfiguredPhysicalState(): PhysicalState {
  return Object.freeze(Object.fromEntries(
    Object.entries(CANONICAL_QUANTITIES).map(([group, fields]) => [
      group,
      Object.freeze(Object.fromEntries(
        Object.entries(fields).map(([field, unit]) => [field, unconfigured(unit)]),
      )),
    ]),
  )) as PhysicalState
}
