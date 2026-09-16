import type { EngineeringModuleDescriptor, LessonDescriptor } from '../../src/platform'

export function demoModule(id = 'demo'): EngineeringModuleDescriptor {
  return {
    id, version: '0.1.0', title: 'Synthetic module',
    description: 'Test fixture only; no physics is executed.', implementation: 'not-implemented',
    requires: { platform: '^0.1.0', modules: [] },
    stateExtensions: [{ path: `modules.${id}.sample`, label: 'Synthetic length', unit: 'm' }],
    inputs: [{ id: 'airspeed', source: { kind: 'canonical', quantityId: 'motion.airspeed' } }],
    outputs: [{ id: `outputs.${id}.sample`, label: 'Synthetic force', unit: 'N' }],
    commands: [], modelSlots: [], visualizationIds: [], lessonIds: [],
    verificationCaseIds: [], evidenceRuleIds: [],
  }
}

export function demoLesson(id = 'demo-lesson'): LessonDescriptor {
  return {
    id, version: '0.1.0', title: 'Synthetic lesson', moduleIds: ['demo'],
    scenarios: [], stages: [],
  }
}
