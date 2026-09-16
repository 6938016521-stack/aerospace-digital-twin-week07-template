import { quantity } from '../../platform'
import type { LessonDescriptor, ScenarioDefinition } from '../../platform'
import { pitchScenario } from './pitch-scenario'
import { elevatorScenario } from './elevator-scenario'
import { authorityScenario } from './authority-scenario'

const source = 'c5-week06-supplied'
const q = <U extends Parameters<typeof quantity>[1]>(value: number, unit: U) => quantity(value, unit, source)
const angle = (value: number) => q(value * Math.PI / 180, 'rad')

function scenario(id: string, title: string, baseline: ScenarioDefinition['baseline']): ScenarioDefinition {
  return {
    id,
    title,
    activeModuleIds: ['controls'],
    activeModels: [],
    baseline: {
      ...baseline,
      simulation: { ...baseline.simulation, scenarioId: id },
      provenance: {
        ...baseline.provenance,
        [source]: {
          id: source,
          source: 'ai-assisted',
          description: 'Software-authored C5 Week 06 teaching baseline. Values are illustrative and unapproved; they are not calibrated aircraft data.',
          derivedFrom: [],
        },
      },
    },
  }
}

const signedMoment = scenario('c5-signed-moment', 'Week 06 · calculate the required control moment', pitchScenario.baseline)
const elevatorResponse = scenario('c5-elevator-response', 'Week 06 · elevator response', elevatorScenario.baseline)
const airspeedScaling = scenario('c5-airspeed-scaling', 'Week 06 · airspeed scaling', elevatorScenario.baseline)
const authority = scenario('c5-authority', 'Week 06 · authority envelope', authorityScenario.baseline)
const uncertainty = scenario('c5-uncertainty', 'Week 06 · uncertainty capacity', {
  ...authorityScenario.baseline,
  modules: { controls: { ...authorityScenario.baseline.modules.controls, actuatorLimit: angle(5), gainUncertainty: q(0, '1') } },
})
const ratePlanning = scenario('c5-rate-planning', 'Week 06 · rate planning', authorityScenario.baseline)

export const week06Lesson: LessonDescriptor = {
  id: 'controls-week06',
  version: '1.0.0',
  title: 'Week 06 · Pitch control: demand, response, authority',
  moduleIds: ['controls'],
  scenarios: [signedMoment, elevatorResponse, airspeedScaling, authority, uncertainty, ratePlanning],
  stages: [
    {
      id: 'signed-moment', title: 'Calculate the required control moment', scenarioId: signedMoment.id,
      allowedCommandIds: ['SET_MODULE_STATE'], visibleVisualizationIds: [],
      prediction: { required: true, prompt: 'If the target pitch acceleration changes to 0 rad/s² while all other supplied terms stay fixed, what required control moment do you predict, and why?' },
      revealAfterPrediction: ['requiredMoment', 'requiredForce', 'achievedAcceleration'],
      instructions: ['Separate the target requirement from the applied response. Work through the fixed reference example, then predict what requirement follows when the target becomes zero.', 'After your prediction, set Requested pitch acceleration to 0 rad/s² and check the target requirement. Reveal the explanation, then explicitly apply the displayed required tail force. Editing the target alone does not change the applied force.'],
      studentTasks: ['Set the target pitch acceleration to 0 rad/s² and check the required +750 N·m control moment.', 'Apply the displayed required tail force. Verify that zero acceleration comes from balanced moments, not from a zero control moment.'],
      takeaways: ['Required control moment equals pitch moment of inertia times target pitch acceleration, minus the competing moment. Subtracting a negative competing moment increases the required nose-up control contribution.', 'The target only changes the requirement. It does not automatically change the applied tail force or achieved acceleration. With a zero target, +750 N·m is still required to balance the −750 N·m competing moment; applying +250 N through the 3 m arm makes the net moment and acceleration zero.'],
      claimBoundary: ['This is a prescribed-force teaching calculation. It does not establish an aircraft tail force or aerodynamic model.'],
      allowedModuleFields: ['controls.requestedAcceleration', 'controls.tailForce'], engineeringRequirements: {},
    },
    {
      id: 'elevator-response', title: 'Elevator response at one operating point', scenarioId: elevatorResponse.id,
      allowedCommandIds: ['SET_ELEVATOR'], visibleVisualizationIds: [],
      prediction: { required: true, prompt: 'Predict whether a less-negative elevator command will raise or lower the selected pitch acceleration, and why.' },
      revealAfterPrediction: ['deltaMoment', 'tailMoment', 'achievedAcceleration'],
      instructions: ['This C3 baseline holds the illustrative atmosphere, geometry, and airspeed fixed at 40 m/s. The requested target is 0.12 rad/s². Edit only Elevator (deg).', 'Choose one elevator value, apply it, and compare the observed selected acceleration with the requested target.'],
      studentTasks: ['Run one elevator experiment.', 'State whether the selected result meets the target and support it with the observed reading.'],
      takeaways: ['For this illustrative linear model, the nominal inverse solution is approximately −4.11°. The baseline selected −5° produces approximately 0.1784 rad/s² against a 0.12 rad/s² target.', 'Those numbers are model outputs for this supplied example, not aircraft data.'],
      claimBoundary: ['The linear effectiveness and equivalent tail force are illustrative; no trim, stall, damping, or calibration is represented.'],
      allowedModuleFields: [], engineeringRequirements: {},
    },
    {
      id: 'airspeed-scaling', title: 'Airspeed scaling', scenarioId: airspeedScaling.id,
      allowedCommandIds: ['SET_AIRSPEED'], visibleVisualizationIds: [],
      prediction: { required: true, prompt: 'With the same elevator command, predict what happens to elevator moment when airspeed is lowered from 40 m/s to 20 m/s.' },
      revealAfterPrediction: ['dynamicPressure', 'deltaMoment', 'achievedAcceleration'],
      instructions: ['Keep the baseline elevator command unchanged. Edit only Airspeed (m/s), setting it to 20 m/s for your experiment.', 'Compare the observed elevator moment with the baseline operating point.'],
      studentTasks: ['Set airspeed to 20 m/s and record the observed moment.', 'Explain the ratio using the model relation for dynamic pressure.'],
      takeaways: ['At fixed density, geometry, and elevator, the illustrative elevator contribution scales with V². Reducing 40 m/s to 20 m/s produces one quarter of the elevator contribution: about 410.50 N·m at 20 m/s.', 'The net moment is about −339.50 N·m and the selected acceleration about −0.06790 rad/s² because the competing moment remains. This is a model relation, not a flight-test result.'],
      claimBoundary: ['The conclusion applies only while this linear illustrative model is used with the held inputs.'],
      allowedModuleFields: [], engineeringRequirements: {},
    },
    {
      id: 'authority', title: 'Authority at higher airspeed', scenarioId: authority.id,
      allowedCommandIds: ['SET_AIRSPEED'], visibleVisualizationIds: [],
      prediction: { required: true, prompt: 'At 80 m/s, predict whether the selected −5° command remains inside the declared authority envelope. Explain using the model quantities.' },
      revealAfterPrediction: ['usableAngle', 'withinEnvelope', 'estimatedForce', 'estimatedAcceleration'],
      instructions: ['The tail station and fixed reference stay unchanged. Edit only Airspeed (m/s), setting it to 80 m/s.', 'At 80 m/s, test whether the selected −5° command is out of declared usable travel. Use the observed authority readout to assess the envelope.'],
      studentTasks: ['Set airspeed to 80 m/s and record the envelope result.', 'Explain the inferred-force relation: the model converts reference moment to an equivalent tail force through the fixed reference-to-tail arm.'],
      takeaways: ['A higher dynamic pressure can make the same selected command exceed a force-derived authority bound even when the commanded travel is unchanged.', 'The inferred force is an equivalent-force relation based on the fixed reference and tail station; it is not a measured tail load.'],
      claimBoundary: ['Authority is a declared illustrative envelope, not a structural substantiation or actuator qualification.'],
      allowedModuleFields: [], engineeringRequirements: {},
    },
    {
      id: 'uncertainty', title: 'Uncertainty and conservative capacity', scenarioId: uncertainty.id,
      allowedCommandIds: ['SET_MODULE_STATE'], visibleVisualizationIds: [],
      prediction: { required: true, prompt: 'Predict how adding gain uncertainty changes conservative capacity relative to the nominal target requirement.' },
      revealAfterPrediction: ['guaranteedMoment', 'authorityMargin', 'worstCaseTargetAngle'],
      instructions: ['This baseline has 5° actuator travel and zero gain uncertainty. Edit only Gain uncertainty (fraction), setting it to 0.2.', 'Compare the observed conservative capacity with the nominal target requirement.'],
      studentTasks: ['Set gain uncertainty to 0.2 and record the conservative capacity.', 'Decide whether capacity supports the nominal target across the stated gain range.'],
      takeaways: ['For the supplied baseline, conservative capacity changes from about 1642 N·m to about 1314 N·m when uncertainty is increased to 0.2, against a 1350 N·m requirement.', 'Capacity under uncertainty is distinct from the nominal target result.'],
      claimBoundary: ['Gain uncertainty is a bounded illustrative input, not a probability distribution or validation claim.'],
      allowedModuleFields: ['controls.gainUncertainty'], engineeringRequirements: {},
    },
    {
      id: 'rate-planning', title: 'Rate planning horizon', scenarioId: ratePlanning.id,
      allowedCommandIds: ['SET_MODULE_STATE'], visibleVisualizationIds: [],
      prediction: { required: true, prompt: 'Predict whether extending the planning horizon from 0.25 s to 0.30 s allows the weakest-gain required pose to become reachable.' },
      revealAfterPrediction: ['reachableMin', 'reachableMax', 'worstCaseTargetAngle', 'rateMargin'],
      instructions: ['Keep the supplied actuator limits, rate, and uncertainty. Edit only Response time (s), setting it to 0.30 s.', 'Use the observed rate-plan readout to compare reachability with the weakest-gain required pose.'],
      studentTasks: ['Set response time to 0.30 s and record the rate margin.', 'Explain why the changed horizon affects planning capability.'],
      takeaways: ['In this supplied example, 0.25 s to 0.30 s crosses the reachability condition for the approximately 5.14° weakest-gain requirement at 20°/s.', 'This is a static rate-planning calculation, not an actuator animation or simulated motion.'],
      claimBoundary: ['The calculation does not claim actuator dynamics, tracking performance, or aircraft response over time.'],
      allowedModuleFields: ['controls.responseTime'], engineeringRequirements: {},
    },
  ],
}
