import { bundledModules } from './bundled-modules'
import { createModuleRegistry } from '../platform/module-system/registry'
import { createLessonRegistry } from '../platform/lessons/registry'
import type { DescriptorCatalog, EngineeringModuleDescriptor } from '../platform/module-system/types'
import type { LessonDescriptor } from '../platform/lessons/types'
import { week06Lesson } from '../modules/controls/week06-lesson'

export interface AppCatalog {
  readonly modules: DescriptorCatalog<EngineeringModuleDescriptor>
  readonly lessons: DescriptorCatalog<LessonDescriptor>
}

/** Bundled-module composition. Only this layer imports concrete teaching modules. */
export function createAppCatalog(includePlaceholders = true): AppCatalog {
  const modules = createModuleRegistry()
  const lessons = createLessonRegistry()
  if (includePlaceholders) {
    bundledModules.forEach((pkg) => modules.register(pkg.descriptor))
    lessons.register(week06Lesson)
  }
  return { modules, lessons }
}
