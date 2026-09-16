import { CANONICAL_QUANTITY_IDS } from '../state/quantities'
import { CANONICAL_UNITS } from '../units/types'
import type { DescriptorRegistry, EngineeringModuleDescriptor } from './types'

export type RegistrationErrorCode =
  | 'INVALID_ID'
  | 'DUPLICATE_ID'
  | 'STATE_OWNERSHIP'
  | 'DUPLICATE_STATE'
  | 'OUTPUT_OWNERSHIP'
  | 'DUPLICATE_OUTPUT'
  | 'UNKNOWN_QUANTITY'
  | 'UNKNOWN_UNIT'

export class RegistrationError extends Error {
  constructor(readonly code: RegistrationErrorCode, message: string) {
    super(message)
    this.name = 'RegistrationError'
  }
}

export function assertDescriptorId(id: string): void {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id) || ['constructor', 'prototype'].includes(id)) {
    throw new RegistrationError('INVALID_ID', `Invalid descriptor ID: ${id}`)
  }
}

// Only objects recursively copied/frozen here are safe to share. An externally
// shallow-frozen object is never trusted as an immutable subtree.
const ownedImmutable = new WeakSet<object>()
/** Copy external data, sharing only previously owned immutable subtrees. */
export function immutableCopy<T>(value: T): T {
  const seen = new WeakMap<object, object>()
  function copy(entry: unknown): unknown {
    if (typeof entry === 'function' || typeof entry === 'symbol') throw new Error('Snapshots cannot contain executable or symbolic values.')
    if (entry === null || typeof entry !== 'object') return entry
    if (!Array.isArray(entry) && ![Object.prototype, null].includes(Object.getPrototypeOf(entry))) throw new Error('Snapshots require plain structured data.')
    if (ownedImmutable.has(entry)) return entry
    if (seen.has(entry)) return seen.get(entry)
    const result: Record<string, unknown> | unknown[] = Array.isArray(entry) ? [] : {}
    seen.set(entry, result)
    for (const key of Object.keys(entry)) Object.defineProperty(result, key, { value: copy((entry as Record<string, unknown>)[key]), enumerable: true, configurable: true, writable: true })
    Object.freeze(result)
    ownedImmutable.add(result)
    return result
  }
  return copy(value) as T
}

/** Append without copying immutable historical elements again. */
export function appendImmutable<T>(values: readonly T[], value: T): readonly T[] {
  const result = Object.freeze([...immutableCopy(values), immutableCopy(value)])
  ownedImmutable.add(result)
  return result
}

/** Extend a plain immutable dictionary without traversing existing records. */
export function extendImmutable<T>(values: Readonly<Record<string, T>>, additions: Readonly<Record<string, T>>): Readonly<Record<string, T>> {
  const result = Object.freeze({ ...immutableCopy(values), ...immutableCopy(additions) })
  ownedImmutable.add(result)
  return result
}

function isOwnedPath(path: string, root: string, moduleId: string): boolean {
  const [prefix, owner, ...segments] = path.split('.')
  return prefix === root && owner === moduleId && segments.length === 1 &&
    segments.every((part) => /^[a-zA-Z][a-zA-Z0-9]*$/.test(part) &&
      !['constructor', 'prototype'].includes(part))
}

function assertUnit(unit: string): void {
  if (!(CANONICAL_UNITS as readonly string[]).includes(unit)) {
    throw new RegistrationError('UNKNOWN_UNIT', `Unknown canonical unit: ${unit}`)
  }
}

/** P0 catalog only: registration neither activates a module nor resolves dependencies. */
export function createModuleRegistry(): DescriptorRegistry<EngineeringModuleDescriptor> {
  const modules = new Map<string, EngineeringModuleDescriptor>()
  const stateOwners = new Map<string, string>()
  const outputOwners = new Map<string, string>()

  return {
    register(descriptor) {
      assertDescriptorId(descriptor.id)
      if (modules.has(descriptor.id)) {
        throw new RegistrationError('DUPLICATE_ID', `Module already registered: ${descriptor.id}`)
      }
      const claimedState = new Set<string>()
      const claimedOutputs = new Set<string>()
      for (const extension of descriptor.stateExtensions) {
        if (!isOwnedPath(extension.path, 'modules', descriptor.id)) {
          throw new RegistrationError('STATE_OWNERSHIP', `Module ${descriptor.id} cannot own ${extension.path}`)
        }
        if (claimedState.has(extension.path) || stateOwners.has(extension.path)) {
          throw new RegistrationError('DUPLICATE_STATE', `State already owned: ${extension.path}`)
        }
        assertUnit(extension.unit)
        claimedState.add(extension.path)
      }
      for (const output of descriptor.outputs) {
        if (claimedOutputs.has(output.id) || outputOwners.has(output.id)) {
          throw new RegistrationError('DUPLICATE_OUTPUT', `Output already owned: ${output.id}`)
        }
        if (!isOwnedPath(output.id, 'outputs', descriptor.id)) {
          throw new RegistrationError('OUTPUT_OWNERSHIP', `Module ${descriptor.id} cannot own ${output.id}`)
        }
        assertUnit(output.unit)
        claimedOutputs.add(output.id)
      }
      for (const input of descriptor.inputs) {
        if (input.source.kind === 'canonical' && !CANONICAL_QUANTITY_IDS.includes(input.source.quantityId)) {
          throw new RegistrationError('UNKNOWN_QUANTITY', `Unknown canonical quantity: ${input.source.quantityId}`)
        }
      }
      // Complete validation and snapshotting before mutating any catalog/ownership map.
      const snapshot = immutableCopy(descriptor)
      modules.set(snapshot.id, snapshot)
      claimedState.forEach((path) => stateOwners.set(path, snapshot.id))
      claimedOutputs.forEach((id) => outputOwners.set(id, snapshot.id))
    },
    get: (id) => modules.get(id),
    list: () => Object.freeze([...modules.values()]),
  }
}
