import { controlsPackage } from '../modules/controls/package'
import { signalCheckPackage } from '../modules/signal-check/package'
import { createModuleRuntime } from '../platform'

/** Add instructor packages here; kernel and existing scene do not change. */
export const bundledModules = [signalCheckPackage, controlsPackage] as const
export function createBundledRuntime() {
  const runtime = createModuleRuntime()
  bundledModules.forEach((pkg) => runtime.install(pkg))
  return runtime
}
