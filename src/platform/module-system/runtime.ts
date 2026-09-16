import { contentId } from '../provenance/content-id'
import { quantity, unconfigured } from '../units/types'
import type { ProvenanceRecord } from '../provenance/types'
import type { AircraftState } from '../state/types'
import type { EngineeringValue, CanonicalUnit } from '../units/types'
import type { EngineeringModuleDescriptor } from './types'
import { createModuleRegistry, immutableCopy, extendImmutable } from './registry'
import { matchesVersion } from './versions'
import { PLATFORM_API_VERSION } from '../version'

export interface ModuleEvaluation {
  readonly provenance?: readonly ProvenanceRecord[]
  readonly outputs: Readonly<Record<string, EngineeringValue<CanonicalUnit>>>
  readonly extensions: Readonly<Record<string, EngineeringValue<CanonicalUnit>>>
}
export interface VisualizationDeclaration {
  readonly id: string
  readonly kind: 'quantity-readout'
  readonly outputId: string
  readonly title: string
}
export interface VerificationCase {
  readonly id: string
  readonly description: string
  run(): { readonly passed: boolean; readonly detail: string }
}
export interface ModulePackage {
  readonly descriptor: EngineeringModuleDescriptor
  /** Trusted pure synchronous function; state is frozen and cannot be committed by the module. */
  evaluate(state: AircraftState): ModuleEvaluation
  readonly visualizations: readonly VisualizationDeclaration[]
  readonly verification: readonly VerificationCase[]
}
function addProvenance(records: AircraftState['provenance'], record: ProvenanceRecord) {
  if (Object.hasOwn(records, record.id)) {
    if (JSON.stringify(records[record.id]) !== JSON.stringify(record)) throw new Error(`Provenance cannot be overwritten: ${record.id}`)
    return records
  }
  return extendImmutable(records, { [record.id]: record })
}
export function createModuleRuntime() {
  const packages = new Map<string, ModulePackage>()
  function resolve(roots: readonly string[]): readonly string[] {
    if (new Set(roots).size !== roots.length) throw new Error('Duplicate activation root.')
    const visiting = new Set<string>(), done = new Set<string>(), order: string[] = []
    function visit(id: string) {
      if (visiting.has(id)) throw new Error(`Dependency cycle at ${id}`)
      if (done.has(id)) return
      const pkg = packages.get(id)
      if (!pkg) throw new Error(`Missing module: ${id}`)
      const descriptor = pkg.descriptor
      if (!matchesVersion(PLATFORM_API_VERSION, descriptor.requires.platform)) throw new Error(`Incompatible platform for ${id}`)
      visiting.add(id)
      for (const dep of [...descriptor.requires.modules].sort((a, b) => a.id.localeCompare(b.id))) {
        visit(dep.id)
        if (!matchesVersion(packages.get(dep.id)!.descriptor.version, dep.versionRange)) throw new Error(`Incompatible dependency ${dep.id} for ${id}`)
      }
      for (const input of descriptor.inputs) {
        if (input.source.kind !== 'output') continue
        const outputId = input.source.outputId
        const owner = outputId.split('.')[1]!
        if (!descriptor.requires.modules.some((dep) => dep.id === owner) || !packages.get(owner)?.descriptor.outputs.some((output) => output.id === outputId)) throw new Error(`Undeclared input dependency: ${outputId}`)
      }
      visiting.delete(id); done.add(id); order.push(id)
    }
    [...roots].sort().forEach(visit)
    return Object.freeze(order)
  }
  return {
    install(pkg: ModulePackage) {
      // Validate against a temporary catalog so rejected installs never change ownership.
      const registry = createModuleRegistry()
      packages.forEach((entry) => registry.register(entry.descriptor))
      registry.register(pkg.descriptor)
      if (pkg.descriptor.implementation !== 'provided' || typeof pkg.evaluate !== 'function') throw new Error('An executable module package is required.')
      matchesVersion(pkg.descriptor.version, '*')
      matchesVersion(PLATFORM_API_VERSION, pkg.descriptor.requires.platform)
      pkg.descriptor.requires.modules.forEach((dep) => matchesVersion('0.0.0', dep.versionRange))
      const checkIds = (declared: readonly string[], supplied: readonly string[]) => {
        if (new Set(supplied).size !== supplied.length || supplied.length !== declared.length || supplied.some((id) => !declared.includes(id) || !id.startsWith(`${pkg.descriptor.id}.`))) throw new Error('Registration IDs must match owned manifest references.')
      }
      checkIds(pkg.descriptor.visualizationIds, pkg.visualizations.map((v) => v.id))
      checkIds(pkg.descriptor.verificationCaseIds, pkg.verification.map((v) => v.id))
      for (const visual of pkg.visualizations) if (visual.kind !== 'quantity-readout' || !pkg.descriptor.outputs.some((output) => output.id === visual.outputId)) throw new Error('Invalid visualization output reference.')
      for (const test of pkg.verification) if (typeof test.run !== 'function') throw new Error('Verification callback required.')
      for (const outputId of pkg.descriptor.pitchMomentOutputIds ?? []) {
        if (!pkg.descriptor.outputs.some((output) => output.id === outputId && output.unit === 'N*m')) throw new Error('Pitch load must reference an owned moment output.')
      }
      if (new Set(pkg.descriptor.pitchMomentOutputIds).size !== (pkg.descriptor.pitchMomentOutputIds?.length ?? 0)) throw new Error('Duplicate pitch load contribution.')
      packages.set(pkg.descriptor.id, Object.freeze({ descriptor: registry.get(pkg.descriptor.id)!, evaluate: pkg.evaluate,
        visualizations: immutableCopy(pkg.visualizations), verification: Object.freeze(pkg.verification.map((test) => Object.freeze({ ...test }))) }))
    },
    list: () => Object.freeze([...packages.values()].map((pkg) => pkg.descriptor)),
    resolve,
    visualizations(roots: readonly string[]) { return immutableCopy(resolve(roots).flatMap((id) => packages.get(id)!.visualizations)) },
    verify(id: string) {
      const pkg = packages.get(id)
      if (!pkg) throw new Error(`Missing module: ${id}`)
      return immutableCopy(pkg.verification.map((test) => {
        try { const result = test.run(); if (typeof result.passed !== 'boolean' || typeof result.detail !== 'string') throw new Error('Invalid verification result'); return { id: test.id, ...result } }
        catch (error) { return { id: test.id, passed: false, detail: String(error) } }
      }))
    },
    evaluate(state: AircraftState, roots: readonly string[]) {
      const order = resolve(roots)
      // Retain editable parameters for inactive owners, but never derived fields.
      const retained = Object.fromEntries([...packages].filter(([id]) => !order.includes(id) && state.modules[id]).map(([id, pkg]) => [id, Object.fromEntries(pkg.descriptor.stateExtensions.filter((field) => field.editable).map((field) => { const name = field.path.split('.')[2]!; return [name, state.modules[id]![name] ?? unconfigured(field.unit)] }))]).filter(([, fields]) => Object.keys(fields!).length > 0))
      const modules = { ...retained, ...Object.fromEntries(order.map((id) => [id, Object.fromEntries(packages.get(id)!.descriptor.stateExtensions.map((field) => {
        const name = field.path.split('.')[2]!
        return [name, field.editable ? state.modules[id]?.[name] ?? unconfigured(field.unit) : unconfigured(field.unit)]
      }))])) }
      let next = immutableCopy({ ...state, modules, outputs: {}, evidence: [] } as AircraftState)
      const density = next.environment.density, airspeed = next.motion.airspeed
      if (density.status === 'known' && airspeed.status === 'known') {
        const id = contentId('kernel:dynamic-pressure', [density, airspeed])
        next = immutableCopy({ ...next, loads: { ...next.loads, dynamicPressure: quantity(0.5 * density.value * airspeed.value ** 2, 'Pa', id) }, provenance: addProvenance(next.provenance, { id, source: 'computed', description: 'Canonical dynamic pressure: 0.5*rho*V^2.', derivedFrom: [density.provenanceId, airspeed.provenanceId] }) })
      } else next = immutableCopy({ ...next, loads: { ...next.loads, dynamicPressure: unconfigured('Pa', 'Supply density and airspeed.') } })
      for (const id of order) {
        const pkg = packages.get(id)!
        const result = pkg.evaluate(next)
        let provenance = next.provenance
        for (const record of result.provenance ?? []) {
          if (!record.id.startsWith(`${id}:`) || record.source !== 'computed' || !record.description?.trim() || !Array.isArray(record.derivedFrom) || record.derivedFrom.some((source) => !Object.hasOwn(provenance, source))) throw new Error(`Invalid computed provenance: ${id}`)
          provenance = addProvenance(provenance, record)
        }
        next = immutableCopy({ ...next, provenance })
        const validate = (values: ModuleEvaluation['outputs'], declarations: readonly { id: string; unit: CanonicalUnit }[]) => {
          if (!values || Object.keys(values).length !== declarations.length || Object.keys(values).some((key) => !declarations.some((d) => d.id === key))) throw new Error(`Output/extension ownership mismatch: ${id}`)
          const local: Record<string, EngineeringValue<CanonicalUnit>> = {}
          for (const declaration of declarations) {
            const value = values[declaration.id]
            if (!value || value.unit !== declaration.unit || (value.status === 'known' ? !Number.isFinite(value.value) || !Object.hasOwn(next.provenance, value.provenanceId) : value.status !== 'unconfigured' || !value.reason?.trim())) throw new Error(`Invalid quantity or provenance: ${declaration.id}`)
            local[declaration.id.split('.')[2]!] = value
          }
          return local
        }
        const outputs = validate(result.outputs, pkg.descriptor.outputs)
        const extensions = validate(result.extensions, pkg.descriptor.stateExtensions.map((e) => ({ id: e.path, unit: e.unit })))
        next = immutableCopy({ ...next, outputs: { ...next.outputs, [id]: outputs }, modules: { ...next.modules, [id]: extensions } })
      }
      const contributions = order.flatMap((id) => (packages.get(id)!.descriptor.pitchMomentOutputIds ?? []).map((path) => {
        const [, owner, name] = path.split('.')
        const value = next.outputs[owner!]?.[name!]
        if (!value) throw new Error('Missing pitch contribution.')
        return value
      }))
      let moment = unconfigured('N*m', 'No complete set of pitch moment contributions.') as EngineeringValue<'N*m'>
      if (contributions.length && contributions.every((value) => value.status === 'known')) {
        const values = contributions.filter((value) => value.status === 'known')
        const sourceIds = [...new Set(values.map((value) => value.provenanceId))]
        const provenanceId = contentId('kernel:pitch-sum', values)
        moment = quantity(values.reduce((sum, value) => sum + value.value, 0), 'N*m', provenanceId)
        next = immutableCopy({ ...next, provenance: addProvenance(next.provenance, { id: provenanceId, source: 'computed', description: 'Sum of declared body-Y moment contributions.', derivedFrom: sourceIds }) })
      }
      next = immutableCopy({ ...next, loads: { ...next.loads, pitchMoment: moment } })
      return { state: next, activeModuleIds: order }
    },
  }
}
export type ModuleRuntime = ReturnType<typeof createModuleRuntime>
