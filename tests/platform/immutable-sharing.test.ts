import { expect, it } from 'vitest'
import { immutableCopy, appendImmutable, extendImmutable } from '../../src/platform/module-system/registry'
import { createParameterStore } from '../../src/app/parameter-workspace'
import { contentId } from '../../src/platform/provenance/content-id'
it('shares owned immutable branches but isolates external shallow-frozen data', () => {
  const child = { value: 1 }
  const source = Object.freeze({ child })
  const snapshot = immutableCopy(source)
  child.value = 2
  expect(snapshot.child.value).toBe(1)
  expect(Object.isFrozen(snapshot.child)).toBe(true)
  const next = immutableCopy({ previous: snapshot, newValue: { value: 3 } })
  expect(next.previous).toBe(snapshot)
  expect(() => { next.previous.child.value = 8 }).toThrow()
  const history = appendImmutable([], snapshot)
  expect(appendImmutable<object>(history, next)[0]).toBe(snapshot)
  expect(extendImmutable<object>({ old: snapshot }, { next }).old).toBe(snapshot)
  expect(() => immutableCopy({ fn: () => 1 })).toThrow()
})
it('does not clone historical events or unchanged provenance records on a step', () => {
  const store = createParameterStore()
  store.dispatch({ id: 'load', type: 'RESET_SCENARIO', payload: { scenarioId: 'c3-elevator-example' }, source: 'pointer', context: { scenarioId: 'parameter-workspace', model: null } })
  const before = store.getSnapshot()
  store.dispatch({ id: 'step', type: 'STEP_SIMULATION', payload: null, source: 'system', context: { scenarioId: before.scenarioId, model: null } })
  const after = store.getSnapshot()
  expect(after.events[0]).toBe(before.events[0])
  for (const id of Object.keys(before.state.provenance)) expect(after.state.provenance[id]).toBe(before.state.provenance[id])
  expect(before.events).toHaveLength(1)
  expect(before.state.simulation.elapsedTime).toMatchObject({ value: 0 })
  expect(Object.isFrozen(after.events)).toBe(true)
})
it('generates compact deterministic identifiers sensitive to values and sources', () => {
  const id = contentId('module:result', [{ value: 1, provenanceId: 'a' }])
  expect(id).toBe(contentId('module:result', [{ value: 1, provenanceId: 'a' }]))
  expect(id).not.toBe(contentId('module:result', [{ value: 2, provenanceId: 'a' }]))
  expect(id).not.toBe(contentId('module:result', [{ value: 1, provenanceId: 'b' }]))
  expect(id).toHaveLength('module:result:'.length + 32)
})
