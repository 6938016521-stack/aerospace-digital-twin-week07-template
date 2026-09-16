export type ProvenanceId = string

export type ProvenanceSource =
  | 'instructor-supplied'
  | 'reference-aircraft'
  | 'student-entered'
  | 'student-model'
  | 'measured'
  | 'computed'
  | 'imported-dataset'
  | 'ai-assisted'
  | 'external-source'

export interface CommitProvenance {
  readonly team: string
  readonly repository: string
  readonly branch: string
  readonly commitSha: string
  readonly modelVersion: string
  readonly validation: 'not-run' | 'passed' | 'failed'
  readonly collectedAt: string
}

export interface ProvenanceRecord {
  readonly id: ProvenanceId
  readonly source: ProvenanceSource
  readonly description: string
  readonly sourceReference?: string
  readonly derivedFrom: readonly ProvenanceId[]
  readonly commit?: CommitProvenance
}
