import { createAircraftStore, createModuleRuntime } from '../platform'
import { elevatorScenario } from '../modules/controls/elevator-scenario'
import { createStudentControlsPackage } from '../modules/controls/student-package'
import { defaultBlankWeek07Artifact, type StudentLabArtifact } from '../student/lab'

export function createWeek07Store(artifact: StudentLabArtifact = defaultBlankWeek07Artifact) {
  const runtime = createModuleRuntime()
  runtime.install(createStudentControlsPackage(artifact))
  const scenario = { ...elevatorScenario, id: 'week07-student', title: 'Week 07 student model', activeModels: [{moduleId:'controls',modelId:artifact.id,version:artifact.version}], baseline:{...elevatorScenario.baseline,simulation:{...elevatorScenario.baseline.simulation,scenarioId:'week07-student'}} }
  return createAircraftStore([scenario],scenario.id,{runtime})
}
