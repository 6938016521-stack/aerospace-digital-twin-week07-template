import {
  BoxGeometry, CylinderGeometry, ExtrudeGeometry, Group, LatheGeometry,
  Mesh, MeshStandardMaterial, Object3D, Shape, SphereGeometry, Vector2,
} from 'three'
import type { BufferGeometry } from 'three'
import { AIRCRAFT_ASSET, ANCHORS, JOINTS } from './definition.ts'

/** Original source asset. Coordinates are body axes, transformed once by the renderer. */
export function createAircraftAsset(): Group {
  const root = new Group()
  root.name = 'AircraftRoot'
  root.userData = { ...AIRCRAFT_ASSET, fidelity: 'visual-only' }
  const shell = new MeshStandardMaterial({ color: '#dce5e5', metalness: 0.24, roughness: 0.38 })
  const wing = new MeshStandardMaterial({ color: '#beced3', metalness: 0.25, roughness: 0.42 })
  const accent = new MeshStandardMaterial({ color: '#e4aa65', metalness: 0.2, roughness: 0.4 })
  const dark = new MeshStandardMaterial({ color: '#244951', metalness: 0.4, roughness: 0.28 })
  const tyre = new MeshStandardMaterial({ color: '#233237', roughness: 0.9 })
  const canopyMaterial = new MeshStandardMaterial({ color: '#3b727e', metalness: 0.3, roughness: 0.18, transparent: true, opacity: 0.78 })

  function mesh(name: string, geometry: BufferGeometry, material: MeshStandardMaterial, parent = root): Mesh {
    const result = new Mesh(geometry, material)
    result.name = name
    result.castShadow = true
    result.receiveShadow = true
    parent.add(result)
    return result
  }
  function group(name: string, parent = root): Group {
    const result = new Group()
    result.name = name
    parent.add(result)
    return result
  }
  function panel(points: readonly (readonly [number, number])[], depth = 0.075): ExtrudeGeometry {
    const shape = new Shape(points.map(([x, y]) => new Vector2(x, y)))
    return new ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: 0.018, bevelThickness: 0.018, bevelSegments: 2, steps: 1 })
  }

  const body = mesh('Fuselage', new LatheGeometry([
    new Vector2(0.03, -3.4), new Vector2(0.16, -2.6), new Vector2(0.36, -1.1),
    new Vector2(0.49, 0.2), new Vector2(0.46, 1.25), new Vector2(0.30, 2.5), new Vector2(0, 3.15),
  ], 40), shell)
  body.rotation.z = -Math.PI / 2
  body.scale.z = 0.92
  const canopy = mesh('Canopy', new SphereGeometry(1, 32, 16), canopyMaterial)
  canopy.scale.set(1.1, 0.37, 0.43)
  canopy.position.set(0.45, 0, -0.43)
  const nose = mesh('NoseCap', new SphereGeometry(1, 24, 12), dark)
  nose.scale.set(0.35, 0.27, 0.25)
  nose.position.set(2.72, 0, 0)

  const wings = group('Wing')
  for (const side of [-1, 1] as const) {
    const name = side === -1 ? 'Left' : 'Right'
    const fixed = mesh(`Wing${name}`, panel([[1.0, side * 0.35], [0.23, side * 4.85], [-0.3, side * 4.65], [-0.3, side * 0.35]]), wing, wings)
    fixed.position.z = -0.015
    const tip = mesh(`Wingtip${name}`, new BoxGeometry(0.6, 0.08, 0.08), accent, wings)
    tip.position.set(-0.02, side * 4.7, 0.01)
  }
  const tail = group('HorizontalTail')
  for (const side of [-1, 1] as const) {
    const fixed = mesh(`Stabilizer${side < 0 ? 'Left' : 'Right'}`, panel([[-2.25, side * 0.12], [-2.6, side * 1.65], [-2.85, side * 1.65], [-2.85, side * 0.12]], 0.055), wing, tail)
    fixed.position.z = -0.14
  }
  const vertical = group('VerticalTail')
  const fin = mesh('Fin', panel([[-2.28, 0], [-2.62, -1.47], [-3.02, -1.43], [-3.02, 0]], 0.055), shell, vertical)
  fin.rotation.x = Math.PI / 2
  fin.position.y = 0.025

  for (const [name, joint] of Object.entries(JOINTS)) {
    const parent = joint.control === 'elevator' ? tail : joint.control === 'rudder' ? vertical : root
    const pivot = group(name, parent)
    pivot.position.fromArray(joint.position)
    pivot.userData = { role: 'control-hinge', control: joint.control, axis: joint.axis, positiveSign: joint.sign }
    const geometry = joint.control === 'rudder'
      ? new BoxGeometry(0.33, 0.07, 1.28)
      : new BoxGeometry(joint.control === 'flap' ? 0.5 : 0.4, joint.control === 'elevator' ? 1.48 : joint.control === 'aileron' ? 2.15 : 1.7, 0.065)
    const surface = mesh(joint.surface, geometry, accent, pivot)
    surface.position.x = joint.control === 'flap' ? -0.25 : joint.control === 'rudder' ? -0.165 : -0.2
    surface.userData = { role: 'control-surface', control: joint.control }
  }

  const gear = group('LandingGear')
  for (const [index, [x, y]] of [[-0.25, -1.0], [-0.25, 1.0], [2.0, 0]].entries()) {
    const strut = mesh(`GearStrut${index}`, new CylinderGeometry(0.035, 0.035, 0.6, 8), dark, gear)
    strut.rotation.x = Math.PI / 2
    strut.position.set(x!, y!, 0.65)
    const wheel = mesh(`Wheel${index}`, new CylinderGeometry(0.17, 0.17, 0.12, 20), tyre, gear)
    wheel.position.set(x!, y!, 0.92)
  }
  const anchors = group('SemanticAnchors')
  for (const [name, anchor] of Object.entries(ANCHORS)) {
    const node = new Object3D()
    node.name = name
    node.position.fromArray(anchor.position)
    node.userData = { role: 'semantic-anchor', status: anchor.status, unit: 'm', frame: 'engineering' }
    anchors.add(node)
  }
  root.updateMatrixWorld(true)
  return root
}
