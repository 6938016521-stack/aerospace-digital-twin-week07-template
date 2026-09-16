import { useState, useSyncExternalStore } from 'react'
import { createAircraftStore, createModuleRuntime } from '../platform'
import { controlsPackage } from '../modules/controls/package'
import { week06Lesson } from '../modules/controls/week06-lesson'
import { ScenePanel } from '../scene/ScenePanel'
import { PitchPanel } from '../modules/controls/PitchPanel'
import { quantity } from '../platform'
const names=['demand','effectiveness','speed','authority','uncertainty','rate']
const intros=[
 'Required and applied are different. Predict the required control moment at zero target before applying the change. Then set the prescribed force to the required 250 N and observe zero net moment.',
 'Elevator position changes aerodynamic moment. Positive elevator is trailing edge down; with the supplied negative derivative it produces a nose-down increment. Predict the change from −5° to −4°.',
 'Keep −5° elevator and all other inputs fixed. Predict the effect of reducing 40 m/s to 20 m/s. The elevator contribution scales with V²; the competing moment stays −750 N-m.',
 'A stronger response can violate a declared limit. Compare 40 and 80 m/s with −5° elevator. The inferred force is a diagnostic estimate; an out-of-envelope command is not an achieved response.',
 'At 40 m/s, actuator travel is now ±5°. Compare no gain uncertainty with 20%. Conservative capacity uses weakest effectiveness, not a probability distribution.',
 'Actuator travel returns to ±12° and uncertainty is 20%. Planning starts from 0°, at 20°/s. Compare 0.25 and 0.30 seconds. This is reachability, not animated actuator dynamics.'
]
function makeStore(index:number){const runtime=createModuleRuntime();runtime.install(controlsPackage);const s=week06Lesson.scenarios[index]!;return createAircraftStore([s],s.id,{runtime})}
export function Week07Demonstration({name}:{name:string}){const index=names.indexOf(name);if(index<0)return <main><h1>Unknown demonstration</h1><a href="#">Return to app</a></main>;return <Demonstration key={name} index={index}/>}
function Demonstration({index}:{index:number}){
 const [store]=useState(()=>makeStore(index));const snapshot=useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot);const [error,setError]=useState('')
 function change(){const id=crypto.randomUUID();const settings=[{field:'requestedAcceleration',value:0,unit:'rad/s^2'},{field:'elevator',value:-4*Math.PI/180,unit:'rad'},{field:'airspeed',value:20,unit:'m/s'},{field:'airspeed',value:80,unit:'m/s'},{field:'gainUncertainty',value:.2,unit:'1'},{field:'responseTime',value:.3,unit:'s'}] as const;const setting=settings[index]!;const type=setting.field==='airspeed'?'SET_AIRSPEED':setting.field==='elevator'?'SET_ELEVATOR':'SET_MODULE_STATE';const value=quantity(setting.value,setting.unit,id);const result=store.dispatch({id,type,payload:type==='SET_MODULE_STATE'?{moduleId:'controls',field:setting.field,value}:{value},source:'lesson',context:{scenarioId:snapshot.scenarioId,model:null}},{id,source:'instructor-supplied',description:'Prepared Week07 instructor demonstration change',derivedFrom:[]});setError(result.ok?'':result.error)}
 return <div className="studio"><header className="studio-header"><h1>Week07 · Instructor demonstration</h1><a href={'/teaching/week07/student.html#'+encodeURIComponent(localStorage.getItem('week07-return-slide')??'W07-OPEN-01')} target="week07-lecture">Return to lecture</a><a href="#week07">Student lab</a><a href="#">Explore</a></header><main className="studio-main"><ScenePanel store={store} snapshot={snapshot} showControls hideSceneTools inspector={()=><section className="week07-panel"><h2>{week06Lesson.stages[index]!.title}</h2><p>{intros[index]}</p><p>Reference model · supplied instructor demonstration. This does not count as student model execution. Each view restores its stated baseline.</p><button onClick={change}>Apply demonstration change</button><button onClick={()=>{const r=store.dispatch({id:crypto.randomUUID(),type:'RESET_SCENARIO',payload:{scenarioId:snapshot.scenarioId},source:'lesson',context:{scenarioId:snapshot.scenarioId,model:null}});setError(r.ok?'':r.error)}}>Restore baseline</button>{error&&<p role="alert">{error}</p>}<PitchPanel store={store} snapshot={snapshot}/></section>}/></main></div>
}
