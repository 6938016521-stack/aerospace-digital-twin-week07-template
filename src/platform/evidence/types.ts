import type { EngineeringValue, CanonicalUnit } from '../units/types'
import type { ProvenanceId } from '../provenance/types'

export type FidelityLevel = 0 | 1 | 2 | 3 | 4
export type VerificationStatus = 'not-run' | 'passed' | 'failed'

export interface ModelReference {
  readonly moduleId: string
  readonly modelId: string
  readonly version: string
}

export interface NamedQuantity {
  readonly id: string
  readonly label: string
  readonly quantity: EngineeringValue<CanonicalUnit>
}

export interface ValidityAssessment {
  readonly status: 'not-assessed' | 'within-range' | 'outside-range'
  readonly applicableRange: readonly string[]
  readonly limitations: readonly string[]
}

export type UncertaintyAssessment =
  | { readonly status: 'not-assessed' }
  | { readonly status: 'declared'; readonly description: string; readonly quantities: readonly NamedQuantity[] }

/** Metadata is evidence supplied by a model; the platform does not invent claims. */
export interface ModelResultEvidence {
  readonly id: string
  readonly question: string
  readonly model: ModelReference
  readonly fidelity: FidelityLevel
  readonly assumptions: readonly string[]
  readonly inputs: readonly NamedQuantity[]
  readonly intermediates: readonly NamedQuantity[]
  readonly outputs: readonly NamedQuantity[]
  readonly validity: ValidityAssessment
  readonly warnings: readonly string[]
  readonly uncertainty: UncertaintyAssessment
  readonly schemaValidation: 'not-run' | 'valid' | 'invalid'
  readonly verification: VerificationStatus
  readonly provenanceIds: readonly ProvenanceId[]
  readonly supportedClaims: readonly string[]
  readonly unsupportedClaims: readonly string[]
  readonly nextEvidence: readonly string[]
}
