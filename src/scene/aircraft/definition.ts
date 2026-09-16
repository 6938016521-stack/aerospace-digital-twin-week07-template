/** Visual dimensions only; never imported by the engineering kernel. */
export const AIRCRAFT_ASSET = {
  id: 'aerolab-01', version: '1.0.0', name: 'AeroLab-01',
  file: 'aircraft/aerolab-01.glb', frame: 'engineering', unit: 'm',
  description: 'An original illustrative fixed-wing airframe. Not a calibrated aircraft model.',
} as const

export const JOINTS = {
  ElevatorPivotLeft: { surface: 'ElevatorLeft', control: 'elevator', position: [-2.85, -0.85, -0.12], axis: 'y', sign: 1 },
  ElevatorPivotRight: { surface: 'ElevatorRight', control: 'elevator', position: [-2.85, 0.85, -0.12], axis: 'y', sign: 1 },
  AileronPivotLeft: { surface: 'AileronLeft', control: 'aileron', position: [-0.3, -3.5, 0.03], axis: 'y', sign: 1 },
  AileronPivotRight: { surface: 'AileronRight', control: 'aileron', position: [-0.3, 3.5, 0.03], axis: 'y', sign: -1 },
  RudderPivot: { surface: 'Rudder', control: 'rudder', position: [-3.02, 0, -0.73], axis: 'z', sign: -1 },
  FlapPivotLeft: { surface: 'FlapLeft', control: 'flap', position: [-0.3, -1.5, 0.03], axis: 'y', sign: 1 },
  FlapPivotRight: { surface: 'FlapRight', control: 'flap', position: [-0.3, 1.5, 0.03], axis: 'y', sign: 1 },
} as const

export type SurfaceControl = (typeof JOINTS)[keyof typeof JOINTS]['control']
export type JointName = keyof typeof JOINTS

export const ANCHORS = {
  BodyAxisOrigin: { position: [0, 0, 0], status: 'visual-reference' },
  CGReference: { position: [0, 0, 0], status: 'unconfigured' },
  WingAC: { position: [0, 0, 0], status: 'unconfigured' },
  TailAC: { position: [0, 0, 0], status: 'unconfigured' },
  NeutralPointReference: { position: [0, 0, 0], status: 'unconfigured' },
  ThrustReference: { position: [3, 0, 0], status: 'visual-reference' },
  LeftWingReference: { position: [0, -4.7, 0.03], status: 'visual-reference' },
  RightWingReference: { position: [0, 4.7, 0.03], status: 'visual-reference' },
  GroundContactReference: { position: [0, 0, 1.08], status: 'visual-reference' },
} as const
