import {useState} from 'react';
import {makeWorldSet,worldSetNames,nativeWorldProp,type WorldSetName} from '../engine/worldCatalog.ts';
import {nativeWorldPropKinds,type NativeWorldPropKind,type WorldSetData,type WorldArtworkData} from '../engine/worldArtworkSchema.ts';
import {exportWorldSet,exportWorldProp,parseWorldPackage,type WorldPackageData} from '../engine/worldPackage.ts';
import {nativePackageLimits} from '../engine/nativeAssetPackage.ts';
import {downloadText} from '../services/assetPreparation.ts';
import type {Prop,Scene} from '../engine/schema.ts';
import {NumberField} from './shared.tsx';
export function WorldControls({scene,change}:{scene:Scene;change:(value:WorldSetData|undefined,ground?:boolean)=>void}){
 const [selected,setSelected]=useState<WorldSetName>('Living room'),[pending,setPending]=useState<WorldSetData>(),[message,setMessage]=useState('');const world=scene.visual?.world;
 function layer(id:string,patch:Partial<WorldArtworkData>){if(world)change({...world,layers:world.layers.map(l=>l.id===id?{...l,art:{...l.art,...patch}}:l)});}
 return <details className="environment-controls"><summary>Living world · vector sets</summary><p className="small-text">Select and preview a vector set. Existing objects, actors, clips, camera and lighting remain unchanged. An imported background image takes precedence over background layers.</p>
 <label>World set<select aria-label="Living world set" value={selected} onChange={e=>setSelected(e.target.value as WorldSetName)}>{worldSetNames.map(v=><option key={v}>{v}</option>)}</select></label>
 <button type="button" onClick={()=>{try{setPending(makeWorldSet(selected));setMessage('Review set before applying.');}catch(e){setMessage(String(e));}}}>Prepare vector set</button>
 <label>Import world package<input type="file" aria-label="Import world set package" accept=".sirvibe-assets,.json" onChange={async e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';if(!file)return;setPending(undefined);try{if(file.size>nativePackageLimits.bytes)throw Error('Package exceeds byte limit');const p=parseWorldPackage(await file.text());if(p.worldPacks.length!==1||p.worldPacks[0].category!=='environment')throw Error('Choose a single environment pack');setPending(p.worldPacks[0].set);setMessage('Validated world set. Review before applying.');}catch(e){setMessage(String(e));}}}/></label>
 {pending&&<div><p>{pending.name} · {pending.layers.length} layers · {pending.layers.filter(l=>l.art.dynamics?.length).length} motion groups</p><button type="button" onClick={()=>{change(pending);setPending(undefined);}}>Apply vector set</button><button type="button" onClick={()=>{change(pending,true);setPending(undefined);}}>Apply set and walkable ground</button><button type="button" onClick={()=>setPending(undefined)}>Discard</button></div>}
 {world&&<><p>Active: {world.name}</p><button type="button" onClick={()=>downloadText(world.id+'.sirvibe-assets',exportWorldSet(world))}>Export world set</button><button type="button" onClick={()=>change(undefined)}>Remove vector set</button>
 {world.layers.map(l=><details key={l.id}><summary>{l.id} · {l.layer}</summary>{l.art.dynamics?.length&&<><label><input type="checkbox" checked={l.art.enabled!==false} onChange={e=>layer(l.id,{enabled:e.target.checked})}/> Allow decorative motion</label><NumberField text="Motion strength" min={0} max={1} step={.05} value={l.art.strength??.65} onChange={strength=>layer(l.id,{strength})}/></>}
 {Object.entries(l.art.artwork.palette).map(([key,color])=><label key={key}>{key}<input type="color" value={color} onChange={e=>layer(l.id,{artwork:{...l.art.artwork,palette:{...l.art.artwork.palette,[key]:e.target.value}}})}/></label>)}</details>)}</>}
 {message&&<p role="status">{message}</p>}</details>;
}
export function WorldPropControls({prop,change}:{prop:Prop;change:(value:Prop)=>void}){
 const [message,setMessage]=useState(''),[pending,setPending]=useState<WorldArtworkData>();if(!nativeWorldPropKinds.includes(prop.kind as NativeWorldPropKind))return null;const kind=prop.kind as NativeWorldPropKind,a=prop.worldArtwork;
 return <details className="environment-controls"><summary>Native vector prop</summary><p className="small-text">Art fits the existing prop bounds and grip. Held objects always use rest artwork at the resolved hand anchor.</p>
 <button type="button" onClick={()=>change({...prop,worldArtwork:nativeWorldProp(kind)})}>Use native vector artwork</button>
 <label>Import prop package<input type="file" aria-label="Import native world prop" accept=".sirvibe-assets,.json" onChange={async e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';if(!file)return;setPending(undefined);try{if(file.size>nativePackageLimits.bytes)throw Error('Package exceeds byte limit');const p=parseWorldPackage(await file.text());if(p.worldPacks.length!==1||p.worldPacks[0].category!=='prop'||p.worldPacks[0].kind!==kind)throw Error('Choose one compatible prop package');setPending(p.worldPacks[0].art);setMessage('Validated prop artwork. Confirm to apply.');}catch(e){setMessage(String(e));}}}/></label>
 {pending&&<><button type="button" onClick={()=>{change({...prop,worldArtwork:pending});setPending(undefined);}}>Apply validated prop artwork</button><button type="button" onClick={()=>setPending(undefined)}>Discard</button></>}
 {a&&<><button type="button" onClick={()=>change({...prop,worldArtwork:undefined})}>Restore default art</button><button type="button" onClick={()=>downloadText(kind+'.sirvibe-assets',exportWorldProp(kind,a))}>Export native prop</button>{a.dynamics?.length&&<label><input type="checkbox" checked={a.enabled!==false} onChange={e=>change({...prop,worldArtwork:{...a,enabled:e.target.checked}})}/> Allow decorative motion</label>}</>}
 {message&&<p role="status">{message}</p>}</details>;
}
