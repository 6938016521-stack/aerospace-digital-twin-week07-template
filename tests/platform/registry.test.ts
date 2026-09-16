import { describe, expect, it } from 'vitest'
import { createLessonRegistry, createModuleRegistry, RegistrationError } from '../../src/platform'
import type { EngineeringModuleDescriptor, CanonicalQuantityId, CanonicalUnit } from '../../src/platform'
import { demoLesson, demoModule } from '../fixtures/descriptors'

describe('module descriptor registry', () => {
  it('starts empty and supports registration, lookup and ordered listing', () => {
    const registry = createModuleRegistry()
    expect(registry.list()).toEqual([])
    expect(registry.get('missing')).toBeUndefined()
    registry.register(demoModule('alpha'))
    registry.register(demoModule('beta'))
    expect(registry.get('alpha')).toEqual(demoModule('alpha'))
    expect(registry.list().map((entry) => entry.id)).toEqual(['alpha', 'beta'])
  })

  it('rejects duplicate module IDs without replacing the original', () => {
    const registry = createModuleRegistry()
    registry.register(demoModule())
    expect(() => registry.register({ ...demoModule(), title: 'Replacement' }))
      .toThrow(expect.objectContaining({ code: 'DUPLICATE_ID' }))
    expect(registry.get('demo')?.title).toBe('Synthetic module')
  })

  it.each(['', 'Week 06', 'a.b', '__proto__', 'constructor', 'prototype'])('rejects invalid ID %s', (id) => {
    expect(() => createModuleRegistry().register(demoModule(id))).toThrow(RegistrationError)
  })

  it.each([
    'massProperties.cgX', 'motion.airspeed', 'controls.elevator',
    'modules.another.sample', 'modules.demo', 'modules.demo.sample.child',
    'modules.demo.__proto__',
  ])('rejects reserved, foreign or ambiguous state path %s atomically', (path) => {
    const registry = createModuleRegistry()
    registry.register(demoModule('existing'))
    const before = registry.list()
    expect(() => registry.register({
      ...demoModule(),
      stateExtensions: [
        { path: 'modules.demo.valid', label: 'Valid', unit: 'm' },
        { path, label: 'Invalid', unit: 'm' },
      ],
    })).toThrow(expect.objectContaining({ code: 'STATE_OWNERSHIP' }))
    expect(registry.list()).toEqual(before)
    // A failed transaction must not leave a ghost ownership reservation.
    registry.register(demoModule())
    expect(registry.list()).toHaveLength(2)
  })

  it('rejects repeated state and output declarations within a descriptor', () => {
    const descriptor = demoModule()
    const registry = createModuleRegistry()
    expect(() => registry.register({ ...descriptor, stateExtensions: [...descriptor.stateExtensions, ...descriptor.stateExtensions] }))
      .toThrow(expect.objectContaining({ code: 'DUPLICATE_STATE' }))
    expect(() => registry.register({ ...descriptor, outputs: [...descriptor.outputs, ...descriptor.outputs] }))
      .toThrow(expect.objectContaining({ code: 'DUPLICATE_OUTPUT' }))
    expect(registry.list()).toEqual([])
    registry.register(descriptor)
  })

  it('rejects duplicate output ownership between modules atomically', () => {
    const registry = createModuleRegistry()
    registry.register(demoModule('alpha'))
    expect(() => registry.register({
      ...demoModule('beta'), outputs: demoModule('alpha').outputs,
    })).toThrow(expect.objectContaining({ code: 'DUPLICATE_OUTPUT' }))
    expect(registry.get('beta')).toBeUndefined()
    registry.register(demoModule('beta'))
  })

  it('rejects foreign output namespaces without retaining valid earlier claims', () => {
    const registry = createModuleRegistry()
    expect(() => registry.register({
      ...demoModule(), outputs: [
        { id: 'outputs.demo.sample', label: 'Valid', unit: 'N' },
        { id: 'outputs.other.sample', label: 'Foreign', unit: 'N' },
      ],
    })).toThrow(expect.objectContaining({ code: 'OUTPUT_OWNERSHIP' }))
    expect(registry.list()).toEqual([])
    registry.register(demoModule())
  })

  it('rejects unknown canonical input IDs and unit metadata', () => {
    const registry = createModuleRegistry()
    expect(() => registry.register({ ...demoModule(), inputs: [
      { id: 'speed', source: { kind: 'canonical', quantityId: 'motion.otherSpeed' as CanonicalQuantityId } },
    ] })).toThrow(expect.objectContaining({ code: 'UNKNOWN_QUANTITY' }))
    expect(() => registry.register({ ...demoModule(), outputs: [
      { id: 'outputs.demo.sample', label: 'Bad unit', unit: 'banana' as CanonicalUnit },
    ] })).toThrow(expect.objectContaining({ code: 'UNKNOWN_UNIT' }))
    expect(registry.list()).toEqual([])
  })

  it('isolates registered data from caller edits and freezes nested returned data', () => {
    const descriptor = structuredClone(demoModule())
    const registry = createModuleRegistry()
    registry.register(descriptor)
    Object.assign(descriptor, { title: 'Changed externally' })
    Object.assign(descriptor.stateExtensions[0]!, { path: 'motion.airspeed' })
    expect(registry.get('demo')?.title).toBe('Synthetic module')
    expect(registry.get('demo')?.stateExtensions[0]?.path).toBe('modules.demo.sample')
    expect(() => Object.assign(registry.get('demo')!.stateExtensions[0]!, { path: 'motion.airspeed' })).toThrow()
    expect(Object.isFrozen(registry.list())).toBe(true)
  })

  it('does not mutate the registry when a descriptor cannot be snapshotted', () => {
    const registry = createModuleRegistry()
    const invalid = { ...demoModule(), description: () => 'Executable' } as unknown as EngineeringModuleDescriptor
    expect(() => registry.register(invalid)).toThrow()
    expect(registry.list()).toEqual([])
    registry.register(demoModule())
  })

  it('records dependencies without pretending P0 resolves or activates them', () => {
    const registry = createModuleRegistry()
    registry.register({ ...demoModule(), requires: { platform: '^99.0.0', modules: [{ id: 'absent', versionRange: '^1.0.0' }] } })
    expect(registry.get('demo')?.requires.modules[0]?.id).toBe('absent')
    expect(registry).not.toHaveProperty('activate')
  })
})

describe('lesson descriptor registry', () => {
  it('starts empty and registers/looks up a lesson without course code in the kernel', () => {
    const registry = createLessonRegistry()
    expect(registry.list()).toEqual([])
    expect(registry.get('missing')).toBeUndefined()
    registry.register(demoLesson())
    expect(registry.get('demo-lesson')).toEqual(demoLesson())
    expect(registry.list()).toHaveLength(1)
  })

  it('rejects duplicates and invalid IDs without modifying existing entries', () => {
    const registry = createLessonRegistry()
    registry.register(demoLesson())
    expect(() => registry.register(demoLesson())).toThrow(expect.objectContaining({ code: 'DUPLICATE_ID' }))
    expect(() => registry.register(demoLesson(''))).toThrow(expect.objectContaining({ code: 'INVALID_ID' }))
    expect(registry.list()).toEqual([demoLesson()])
  })

  it('isolates and freezes lesson configuration', () => {
    const descriptor = demoLesson()
    const registry = createLessonRegistry()
    registry.register(descriptor)
    Object.assign(descriptor, { title: 'External edit' })
    expect(registry.get('demo-lesson')?.title).toBe('Synthetic lesson')
    expect(Object.isFrozen(registry.get('demo-lesson')?.moduleIds)).toBe(true)
  })
})
