import { describe, expect, it } from 'vitest'
import { ENGINEERING_STEPS } from '../../src/platform'
import { createBlankEngineeringRecord } from '../../src/student/contracts'
import type { StudentModelArtifact } from '../../src/student/contracts'

describe('student engineering contract', () => {
  const model = { moduleId: 'synthetic', modelId: 'sample-model', version: '0.1.0' }

  it('preserves twelve distinct engineering steps plus AI-use disclosure', () => {
    const record = createBlankEngineeringRecord('record-1', 'draft-1', model)
    expect(ENGINEERING_STEPS).toHaveLength(12)
    expect(new Set(ENGINEERING_STEPS).size).toBe(12)
    expect(Object.keys(record.fields)).toEqual([...ENGINEERING_STEPS, 'aiUse'])
    expect(Object.values(record.fields).every((field) => field.status === 'incomplete')).toBe(true)
    expect(record.readiness).toBe('not-assessed')
  })

  it('links a model artifact to the exact engineering record revision', () => {
    const record = createBlankEngineeringRecord('record-1', 'draft-2', model)
    const artifact: StudentModelArtifact = {
      id: 'artifact-1', model, slotId: 'sample-slot',
      record: { id: record.id, revision: record.revision },
      implementationStatus: 'not-implemented', schemaValidation: 'not-run', verification: 'not-run', commit: null,
    }
    expect(record.model).toEqual(artifact.model)
    expect(artifact.record).toEqual({ id: 'record-1', revision: 'draft-2' })
    expect(artifact.verification).toBe('not-run')
    expect(artifact.commit).toBeNull()
  })

  it('keeps draft decisions immutable and does not invent student text', () => {
    const record = createBlankEngineeringRecord('record-1', 'draft-1', model)
    expect(record.fields.assumptions).not.toHaveProperty('text')
    expect(record.fields.aiUse).not.toHaveProperty('text')
    expect(() => Object.assign(record.fields.prediction, { text: 'Invented answer' })).toThrow()
    expect(Object.isFrozen(record.model)).toBe(true)
  })
})
