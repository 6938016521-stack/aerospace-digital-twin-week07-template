import type { CommandDescriptor } from '../commands/types'
import type { CanonicalQuantityId } from '../state/quantities'
import type { CanonicalUnit } from '../units/types'

export interface ModuleDependency {
  readonly id: string
  readonly versionRange: string
}

export interface StateExtensionDescriptor {
  readonly editable?: boolean
  /** modules.<own module ID>.<quantity name> */
  readonly path: string
  readonly label: string
  readonly unit: CanonicalUnit
}

export interface OutputDescriptor {
  /** outputs.<own module ID>.<quantity name> */
  readonly id: string
  readonly label: string
  readonly unit: CanonicalUnit
}

export interface InputDescriptor {
  readonly id: string
  readonly source:
    | { readonly kind: 'canonical'; readonly quantityId: CanonicalQuantityId }
    | { readonly kind: 'output'; readonly outputId: string }
}

export interface ModelSlotDescriptor {
  readonly id: string
  readonly title: string
  readonly studentReplaceable: boolean
}

/** Data-only manifest. P3 ModulePackage binds executable evaluation and verification hooks. */
export interface EngineeringModuleDescriptor {
  readonly id: string
  readonly version: string
  readonly title: string
  readonly description: string
  readonly implementation: 'not-implemented' | 'provided'
  readonly requires: {
    readonly platform: string
    readonly modules: readonly ModuleDependency[]
  }
  readonly stateExtensions: readonly StateExtensionDescriptor[]
  readonly inputs: readonly InputDescriptor[]
  readonly outputs: readonly OutputDescriptor[]
  readonly pitchMomentOutputIds?: readonly string[]
  readonly commands: readonly CommandDescriptor[]
  readonly modelSlots: readonly ModelSlotDescriptor[]
  readonly visualizationIds: readonly string[]
  readonly lessonIds: readonly string[]
  readonly verificationCaseIds: readonly string[]
  readonly evidenceRuleIds: readonly string[]
}

export interface DescriptorCatalog<T> {
  get(id: string): T | undefined
  list(): readonly T[]
}

export interface DescriptorRegistry<T> extends DescriptorCatalog<T> {
  register(descriptor: T): void
}
