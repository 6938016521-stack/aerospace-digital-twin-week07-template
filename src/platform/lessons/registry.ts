import { assertDescriptorId, immutableCopy, RegistrationError } from '../module-system/registry'
import type { DescriptorRegistry } from '../module-system/types'
import type { LessonDescriptor } from './types'

/** Structural content/readiness and scenario validation belong to the lesson runtime. */
export function createLessonRegistry(): DescriptorRegistry<LessonDescriptor> {
  const lessons = new Map<string, LessonDescriptor>()
  return {
    register(descriptor) {
      assertDescriptorId(descriptor.id)
      if (lessons.has(descriptor.id)) {
        throw new RegistrationError('DUPLICATE_ID', `Lesson already registered: ${descriptor.id}`)
      }
      const snapshot = immutableCopy(descriptor)
      lessons.set(snapshot.id, snapshot)
    },
    get: (id) => lessons.get(id),
    list: () => Object.freeze([...lessons.values()]),
  }
}
