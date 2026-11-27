import {uid} from '../engine/schema.ts';
import {useState} from 'react';
import {CharacterSecondary,SceneSecondary,characterSecondaryDefaults,sceneSecondaryDefaults,secondaryComponents,type CharacterSecondaryData,type SceneSecondaryData,type SecondaryComponent} from '../engine/secondaryMotionSchema.ts';
import {lveMaterials} from '../engine/lveSimulation.ts';
import type {Character} from '../engine/schema.ts';
import {NumberField} from './shared.tsx';
export function CharacterSecondaryControls({character,change}:{character:Character;change:(value:CharacterSecondaryData|undefined)=>void}){
 const q=character.secondaryMotion??characterSecondaryDefaults,[error,setError]=useState('');
 function patch(p:Partial<CharacterSecondaryData>){const parsed=CharacterSecondary.safeParse({...q,...p});if(parsed.success){change(parsed.data);setError('');}else setError('Invalid physics settings');}
 function component(key:SecondaryComponent,p:NonNullable<NonNullable<CharacterSecondaryData['components']>[SecondaryComponent]>){patch({components:{...q.components,[key]:{...q.components?.[key],...p}}});}
 return <details className="factory-details"><summary>Living Vector Engine · character</summary><p className="small-text">Scene secondary motion must also be enabled. Character Factory still shows the static rest audition.</p>
 <label className="check"><input type="checkbox" checked={q.enabled} onChange={e=>patch({enabled:e.target.checked})}/> Allow secondary motion</label>
 <NumberField text="Character strength" value={q.strength} min={0} max={1} step={.05} onChange={strength=>patch({strength})}/>
 {secondaryComponents.map(key=><details key={key}><summary>{key}</summary><label className="check"><input type="checkbox" checked={q.components?.[key]?.enabled!==false} onChange={e=>component(key,{enabled:e.target.checked})}/> Enable {key}</label>
 <NumberField text={key+' strength'} value={q.components?.[key]?.strength??1} min={0} max={1} step={.05} onChange={strength=>component(key,{strength})}/>
 <label>Material override<select aria-label={key+' material override'} value="" onChange={e=>{const v=e.target.value;component(key,{material:v==='default'?undefined:v==='spring'||v==='braid'||v==='fabric'?{...lveMaterials[v]}:undefined});}}><option value="">Choose material</option><option value="default">Asset default</option><option value="spring">Firm spring</option><option value="braid">Flexible chain</option><option value="fabric">Soft fabric</option></select></label>
 {q.components?.[key]?.material&&<p className="small-text">Custom material active</p>}</details>)}
 <button type="button" onClick={()=>change(undefined)}>Restore character defaults</button>{error&&<p role="alert">{error}</p>}</details>;
}
export function SceneSecondaryControls({settings,change,duration,getPlayhead}:{settings?:SceneSecondaryData;change:(v:SceneSecondaryData)=>void;duration:number;getPlayhead:()=>number}){
 const q=settings??sceneSecondaryDefaults,[error,setError]=useState('');
 function patch(p:Partial<SceneSecondaryData>){const parsed=SceneSecondary.safeParse({...q,...p});if(parsed.success){change(parsed.data);setError('');}else setError('Invalid scene physics settings');}
 return <details className="environment-controls"><summary>Secondary motion · LVE</summary>
 <label className="check"><input type="checkbox" aria-label="Enable secondary motion" checked={q.enabled} onChange={e=>patch({enabled:e.target.checked})}/> Enable secondary motion</label>
 {q.enabled&&<><label>Simulation quality<select value={q.quality} onChange={e=>patch({quality:e.target.value as SceneSecondaryData['quality']})}><option value="eco">Economy · 30 Hz</option><option value="balanced">Balanced · 60 Hz</option></select></label>
 {([['strength','Scene strength',0,1,.05],['windX','Wind X',-80,80,1],['windY','Wind Y',-80,80,1],['turbulence','Turbulence',0,12,.5]] as const).map(([key,label,min,max,step])=><NumberField key={key} text={label} min={min} max={max} step={step} value={q[key]} onChange={value=>patch({[key]:value})}/>)}
 <p className="small-text">Wind direction: {Math.round(Math.atan2(q.windY,q.windX)*180/Math.PI)}° · strength {Math.round(Math.hypot(q.windX,q.windY))}. X right, Y down.</p>
 <NumberField text="Gravity (world Y)" min={-40} max={40} step={1} value={q.gravity??12} onChange={gravity=>patch({gravity})}/>
 <details><summary>Local wind regions</summary><p className="small-text">World coordinates, unaffected by camera zoom. Circular falloff blends with scene wind.</p>{(q.regions??[]).map(region=><div key={region.id}>{([['x','Region X',-2000,3000],['y','Region Y',-2000,3000],['radius','Region radius',10,1000],['windX','Local wind X',-80,80],['windY','Local wind Y',-80,80]] as const).map(([k,label,min,max])=><NumberField key={k} text={label} min={min} max={max} value={region[k]} onChange={value=>patch({regions:q.regions!.map(r=>r.id===region.id?{...r,[k]:value}:r)})}/>)}<button type="button" onClick={()=>patch({regions:q.regions!.filter(r=>r.id!==region.id)})}>Remove region</button></div>)}<button type="button" disabled={(q.regions?.length??0)>=8} onClick={()=>patch({regions:[...(q.regions??[]),{id:uid(),x:480,y:270,radius:240,windX:30,windY:0}]})}>Add local wind region</button></details>
 <button type="button" disabled={q.gusts.length>=16} onClick={()=>{const time=Math.min(duration,Math.round(getPlayhead()*100)/100);patch({gusts:[...q.gusts.filter(g=>g.time!==time),{time,x:60,y:-8,duration:.5}].sort((a,b)=>a.time-b.time)});}}>Add wind gust at playhead</button>
 <button type="button" onClick={()=>patch({windX:0,windY:0,turbulence:0,gusts:[],regions:[]})}>Clear wind and gusts</button>
 <p className="small-text">Play the scene to see motion. Paused stage arrangement stays at rest. {q.gusts.length} scripted gusts.</p></>}{error&&<p role="alert">{error}</p>}</details>;
}
