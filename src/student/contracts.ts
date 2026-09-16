import { ENGINEERING_STEPS } from '../platform/lessons/engineering-steps'
import type { EngineeringRecordFieldId } from '../platform/lessons/engineering-steps'
import type { ModelReference } from '../platform/evidence/types'
import type { CommitProvenance } from '../platform/provenance/types'

export type RecordedDecision =
  | { readonly status: 'incomplete' }
  | { readonly status: 'recorded'; readonly text: string }

/** Association and draft contract only. Recorded text is not validated readiness. */
export interface EngineeringRecord {
  readonly id: string
  readonly revision: string
  readonly model: ModelReference
  readonly fields: Readonly<Record<EngineeringRecordFieldId, RecordedDecision>>
  readonly readiness: 'not-assessed'
}

export interface StudentModelArtifact {
  readonly id: string
  readonly model: ModelReference
  readonly slotId: string
  readonly record: { readonly id: string; readonly revision: string }
  readonly implementationStatus: 'not-implemented' | 'supplied'
  readonly schemaValidation: 'not-run' | 'valid' | 'invalid'
  readonly verification: 'not-run' | 'passed' | 'failed'
  readonly commit: CommitProvenance | null
}

export function createBlankEngineeringRecord(
  id: string,
  revision: string,
  model: ModelReference,
): EngineeringRecord {
  const fields = Object.fromEntries(
    [...ENGINEERING_STEPS, 'aiUse'].map((step) => [step, Object.freeze({ status: 'incomplete' })]),
  ) as Record<EngineeringRecordFieldId, RecordedDecision>
  return Object.freeze({
    id, revision, model: Object.freeze({ ...model }), fields: Object.freeze(fields),
    readiness: 'not-assessed',
  })
}
