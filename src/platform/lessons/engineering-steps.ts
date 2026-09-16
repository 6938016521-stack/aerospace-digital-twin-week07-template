export const ENGINEERING_STEPS = [
  'question',
  'system',
  'representation',
  'physics',
  'assumptions',
  'inputs',
  'model',
  'prediction',
  'execution',
  'verification',
  'claim',
  'reflection',
] as const

Object.freeze(ENGINEERING_STEPS)

export type EngineeringStepId = (typeof ENGINEERING_STEPS)[number]
export type EngineeringRecordFieldId = EngineeringStepId | 'aiUse'

/** Flags are independent: a required step can also be editable and scaffolded. */
export interface StepScaffolding {
  readonly suppliedBy: 'instructor' | 'student'
  readonly editable: boolean
  readonly required: boolean
  readonly locked: boolean
  readonly scaffold?: string
}

export type EngineeringRequirements = Readonly<
  Partial<Record<EngineeringRecordFieldId, StepScaffolding>>
>
