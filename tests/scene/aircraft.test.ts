import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { createAircraftAsset } from '../../src/scene/aircraft/createAsset'
import { JOINTS, ANCHORS } from '../../src/scene/aircraft/definition'
import { articulate, cgPosition, commitCG, surfacePose, validateRig } from '../../src/scene/bindings'
import { createParameterStore } from '../../src/app/parameter-workspace'
import { quantity } from '../../src/platform/units/types'

describe('permanent aircraft contract', () => {
  it('loads the committed GLB with its semantic rig and unresolved reference anchors', async () => {
    const bytes = readFileSync('public/aircraft/aerolab-01.glb')
    const asset = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
    validateRig(asset.scene)
    for (const name of Object.keys(ANCHORS)) expect(asset.scene.getObjectByName(name)).toBeDefined()
    expect(asset.scene.getObjectByName('WingAC')?.userData.status).toBe('unconfigured')
  })
  it('rejects broken rig structure', () => {
    const root = createAircraftAsset()
    root.getObjectByName('Rudder')!.removeFromParent()
    expect(() => validateRig(root)).toThrow('Invalid hinge')
  })
  for (const [name, joint] of Object.entries(JOINTS)) it(`${name} rotates aft geometry with the declared sign while its hinge stays fixed`, () => {
    const root = createAircraftAsset()
    const state = createParameterStore().getSnapshot().state
    const changed = { ...state, controls: { ...state.controls, [`${joint.control}Commanded`]: quantity(0.2, 'rad', 'test') } }
    const pivot = root.getObjectByName(name)!
    const origin = pivot.getWorldPosition(new Vector3())
    articulate(root, changed)
    root.updateMatrixWorld(true)
    expect(pivot.getWorldPosition(new Vector3()).distanceTo(origin)).toBe(0)
    const trailing = pivot.localToWorld(new Vector3(-0.3, 0, 0)).sub(origin)
    expect(joint.axis === 'y' ? Math.sign(trailing.z) : Math.sign(trailing.y)).toBe(joint.axis === 'y' ? joint.sign : -joint.sign)
  })
  it('keeps unknown physical data distinct from previews and gives physical positions precedence', () => {
    const state = createParameterStore().getSnapshot().state
    expect(surfacePose(state, 'elevator').source).toContain('unconfigured')
    const preview = { ...state, controls: { ...state.controls, elevatorCommanded: quantity(0.2, 'rad', 'test') } }
    expect(surfacePose(preview, 'elevator')).toEqual({ radians: 0.2, source: 'Command preview' })
    expect(surfacePose({ ...preview, controls: { ...preview.controls, elevator: quantity(-0.1, 'rad', 'test') } }, 'elevator')).toEqual({ radians: -0.1, source: 'Physical state' })
    expect(state.controls.elevator.status).toBe('unconfigured')
  })
  it('commits one CG command, rejects a stale drag, and reset removes the marker', () => {
    const store = createParameterStore()
    const initial = store.getSnapshot()
    expect(cgPosition(initial.state)).toBeNull()
    expect(commitCG(store, initial, [1, 2, -0.3]).ok).toBe(true)
    expect(cgPosition(store.getSnapshot().state)).toEqual([1, 2, -0.3])
    expect(commitCG(store, initial, [0, 0, 0]).ok).toBe(false)
    expect(store.getSnapshot().events).toHaveLength(1)
    const context = { scenarioId: initial.scenarioId, model: null }
    store.dispatch({ id: 'reset', type: 'RESET_SCENARIO', source: 'numeric-input', context, payload: { scenarioId: initial.scenarioId } })
    expect(cgPosition(store.getSnapshot().state)).toBeNull()
  })
})
