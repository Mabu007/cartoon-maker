import {useEffect,useState} from 'react';
import {calibrateNative,exportNativePackage,nativeKey,parseNativePackage,type NativeAssetPack,type NativePackage} from '../engine/nativeAssetPackage.ts';
import {nativeExample} from '../engine/nativeAssetExamples.ts';
import {vectorDrawList,svgPath} from '../engine/vectorArtwork.ts';
import {deleteNativeAsset,exportInstalledNative,listNativeAssets,saveNativeAssets} from '../services/nativeAssetStore.ts';
import {downloadText} from '../services/assetPreparation.ts';
export function NativeAssetLibrary({apply}:{apply?:(packs:NativeAssetPack[],root:string)=>void}){
 const [rows,setRows]=useState<NativeAssetPack[]>([]),[draft,setDraft]=useState<NativePackage>(),[pack,setPack]=useState(0),[component,setComponent]=useState(0),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const fail=(e:unknown)=>setMessage(e instanceof Error?e.message:String(e));
 const refresh=async()=>setRows(await listNativeAssets());
 useEffect(()=>{void refresh().catch(fail);},[]);
 function stage(value:NativePackage){setDraft(value);setPack(0);setComponent(0);setMessage('Validated in quarantine. Nothing has been installed or applied.');}
 const current=draft?.packs[pack],part=current?.components[component];
 async function openFile(file:File){setBusy(true);setMessage('');try{if(file.size>2_000_000)throw Error('Package exceeds 2 MB');stage(parseNativePackage(await file.text()));}catch(e){fail(e);}finally{setBusy(false);}}
 async function install(){if(!draft)return;setBusy(true);try{await saveNativeAssets(draft);await refresh();setDraft(undefined);setMessage('All package revisions installed atomically.');}catch(e){fail(e);}finally{setBusy(false);}}
 const change=(v:{palette?:Record<string,string>;pivot?:[number,number]})=>{if(draft)try{setDraft(calibrateNative(draft,pack,component,v));setMessage('Calibration validated.');}catch(e){fail(e);}};
 return <section className="factory-fields" aria-label="Native vector library">
 <h3>Native vector packages</h3><p className="small-text">Plain JSON v2, 2 MB maximum. SVG, ZIP, remote resources and executable content are not accepted. Existing raster packages use the original import tab.</p>
 <label className="field">Import native package<input aria-label="Import native package" type="file" accept=".sirvibe-assets,.json" disabled={busy} onChange={e=>{const input=e.currentTarget,file=input.files?.[0];input.value='';if(file)void openFile(file);}}/></label>
 <div className="field-row">{(['hair','clothing','accessory'] as const).map(kind=><button key={kind} type="button" disabled={busy} onClick={()=>{try{stage(nativeExample(kind));}catch(e){fail(e);}}}>Example {kind}</button>)}</div>
 {draft&&current&&part&&<div className="factory-details"><h4>Quarantine preview</h4><label>Package<select aria-label="Quarantine package" value={pack} onChange={e=>{setPack(Number(e.target.value));setComponent(0);}}>{draft.packs.map((p,i)=><option key={nativeKey(p)} value={i}>{p.name} · r{p.revision}</option>)}</select></label>
 <label>Component<select aria-label="Quarantine component" value={component} onChange={e=>setComponent(Number(e.target.value))}>{current.components.map((p,i)=><option key={p.id} value={i}>{p.slot} / {p.view}</option>)}</select></label>
 <NativePreview part={part}/><p className="small-text">Views: {current.coverage.join(', ')}. Profiles: {part.profiles.join(', ')}. {part.dynamics?.length??0} sparse physics groups. {current.dependencies.length} pinned dependencies.</p>
 {Object.entries(part.artwork.palette).map(([key,color])=><label key={key}>{key}<input aria-label={'Native palette '+key} type="color" value={color} onChange={e=>change({palette:{[key]:e.target.value}})}/></label>)}
 {part.artwork.units==='rig'&&(['x','y'] as const).map((axis,i)=><label key={axis}>Pivot {axis}<input type="number" aria-label={'Native pivot '+axis} min={part.artwork.bounds[i]} max={part.artwork.bounds[i+2]} step={1} value={part.artwork.pivot[i]} onChange={e=>{const next:[number,number]=[...part.artwork.pivot];next[i]=Number(e.target.value);change({pivot:next});}}/></label>)}
 <div className="field-row"><button type="button" disabled={busy} onClick={()=>void install()}>Install validated package</button><button type="button" onClick={()=>{downloadText(current.id+'.sirvibe-assets',exportNativePackage(draft.packs));}}>Export quarantine package</button><button type="button" disabled={busy} onClick={()=>setDraft(undefined)}>Discard quarantine</button></div></div>}
 <h4>Installed packages</h4>{rows.map(p=><div className="field-row" key={nativeKey(p)}><span>{p.name} · r{p.revision}</span>{apply&&<button type="button" onClick={()=>{try{apply(rows,nativeKey(p));}catch(e){fail(e);}}}>Use {p.name}</button>}<button type="button" onClick={()=>void exportInstalledNative(nativeKey(p)).then(value=>downloadText(p.id+'.sirvibe-assets',value)).catch(fail)}>Export</button><button type="button" onClick={()=>void deleteNativeAsset(nativeKey(p)).then(refresh).catch(fail)}>Delete</button></div>)}
 {message&&<p role="status" className="small-text">{message}</p>}</section>;
}
function NativePreview({part}:{part:NativeAssetPack['components'][number]}){
 const a=part.artwork,[x,y,x1,y1]=a.bounds,draw=vectorDrawList(a)??[];
 return <svg role="img" aria-label="Quarantined native vector preview" viewBox={`${x-4} ${y-4} ${x1-x+8} ${y1-y+8}`} style={{width:'100%',height:210,background:'#4a4a55'}}>{draw.map(r=><path key={r.id} d={svgPath(r.commands)} fill={r.fill??'none'} stroke={r.stroke?.color??'none'} strokeWidth={r.stroke?.width} transform={r.transform?'matrix('+r.transform.join(' ')+')':undefined}/>) }<circle cx={a.pivot[0]} cy={a.pivot[1]} r={a.units==='rig'?1.6:.04} fill="#fbd397"/></svg>;
}
