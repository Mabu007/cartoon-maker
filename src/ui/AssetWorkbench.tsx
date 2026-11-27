import { useEffect, useRef, useState } from 'react';
import { assetInstructions, assetViews, bodyProfiles, compatibility, exportAssetPackage, AssetManifest, type VisualAssetPack } from '../engine/visualAssets.ts';
import { uid } from '../engine/schema.ts';
import { decodeArtwork, downloadText, preparePixels, verifyPackageImages, type Preparation } from '../services/assetPreparation.ts';
import { deleteVisualAsset, listVisualAssets, saveVisualAssets, updateVisualAsset, type AssetRow } from '../services/visualAssetStore.ts';
import { mediaUrl } from '../services/media.ts';
import { Modal } from './shared.tsx';
type Category='hair'|'clothing'|'prop'|'environment';
const initial:Preparation={crop:{x:0,y:0,width:1,height:1},polygon:[],tolerance:25};
export function AssetWorkbench({close,apply,profile='average',sourceImage}:{close:()=>void;apply:(pack:VisualAssetPack)=>void|Promise<void>;profile?:typeof bodyProfiles[number];sourceImage?:string}){
  const [tab,setTab]=useState<'library'|'prepare'>(sourceImage?'prepare':'library'),[rows,setRows]=useState<AssetRow[]>([]),[query,setQuery]=useState('');
  const [category,setCategory]=useState<Category>(sourceImage?'prop':'hair'),[name,setName]=useState('New artwork'),[view,setView]=useState<typeof assetViews[number]>('three-quarter');
  const [targetProfile,setProfile]=useState(profile),[image,setImage]=useState<HTMLImageElement>(),[settings,setSettings]=useState<Preparation>(initial);
  const [pivot,setPivot]=useState({x:.5,y:.5}),[rigWidth,setWidth]=useState(90),[rigHeight,setHeight]=useState(100);
  const [mode,setMode]=useState<'polygon'|'pivot'>('polygon'),[license,setLicense]=useState('Original artwork'),[provenance,setProvenance]=useState('User-created');
  const [error,setError]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(false),[preview,setPreview]=useState(''),[instructions,setInstructions]=useState('');
  const [symmetrical,setSymmetrical]=useState(true),[sceneSource,setSceneSource]=useState(Boolean(sourceImage));
  const [interaction,setInteraction]=useState<'none'|'hold'|'sit'>('none'),[anchor,setAnchor]=useState({x:.5,y:.5});
  const token=useRef(0),mounted=useRef(true),input=useRef<HTMLInputElement>(null),importInput=useRef<HTMLInputElement>(null);
  const refresh=()=>listVisualAssets().then(value=>{if(mounted.current)setRows(value);});
  const fail=(cause:unknown)=>{if(mounted.current)setError(cause instanceof Error?cause.message:'Artwork operation failed.');};
  useEffect(()=>{mounted.current=true;void refresh().catch(fail);return()=>{mounted.current=false;token.current++;};},[]);
  async function load(file:File,fromScene=false){
    const current=++token.current;setBusy(true);setError('');setPreview('');
    try{const decoded=await decodeArtwork(file);if(current!==token.current)return;
      setImage(decoded);setName(file.name.replace(/\.[^.]+$/,'').slice(0,60));setSettings({...initial,crop:{x:0,y:0,width:decoded.naturalWidth,height:decoded.naturalHeight}});setSceneSource(fromScene);
      setPivot({x:.5,y:category==='hair'?.65:category==='clothing'?.05:1});setTab('prepare');
    }catch(cause){if(current===token.current)fail(cause);}finally{if(current===token.current&&mounted.current)setBusy(false);}
  }
  useEffect(()=>{if(!sourceImage)return;let alive=true;void mediaUrl(sourceImage).then(url=>fetch(url)).then(r=>r.blob()).then(blob=>{if(alive)return load(new File([blob],'Scene-extraction.webp',{type:blob.type}),true);}).catch(fail);return()=>{alive=false;};},[sourceImage]);
  function selectCategory(value:Category){setCategory(value);setWidth(value==='hair'?90:value==='clothing'?60:140);setHeight(value==='hair'?100:value==='clothing'?75:140);setPivot({x:.5,y:value==='hair'?.65:value==='clothing'?.05:1});}
  function compiled():VisualAssetPack{
    if(!image)throw Error('Choose artwork first.');
    const raster=preparePixels(image,settings);
    if((category==='hair'||category==='clothing')&&!raster.alpha)throw Error('Character artwork needs transparency. Select a polygon or remove its background colour.');
    const partId='part-'+uid(),id='asset-'+uid();
    return AssetManifest.parse({format:'sirvibe-visual-assets',version:1,id,name,revision:1,category,style:'illustrated',rig:'sirvibe-native-v1',license,provenance,tags:sceneSource?['scene-extraction']:[],dependencies:[],
      files:[{path:'artwork.webp',data:raster.data,width:raster.width,height:raster.height}],
      parts:[{id:partId,file:'artwork.webp',view,slot:category==='hair'?'hair':category==='clothing'?'top':undefined,pivot,width:rigWidth,height:rigHeight,offsetX:0,offsetY:0,fit:category==='clothing'?'body':'fixed',profiles:[targetProfile],symmetrical,
        interaction:category==='prop'?interaction:undefined,interactionAnchor:category==='prop'&&interaction!=='none'?anchor:undefined,
        placement:sceneSource?{x:(settings.crop.x+settings.crop.width*pivot.x)/image.naturalWidth*960,y:(settings.crop.y+settings.crop.height*pivot.y)/image.naturalHeight*540}:undefined}]
    });
  }
  async function save(){setError('');try{const pack=compiled();await saveVisualAssets([pack]);await refresh();setStatus(`${name} saved. Choose Use artwork to apply it.`);setTab('library');}catch(cause){fail(cause);}}
  async function importPack(file:File){setError('');setBusy(true);const current=++token.current;try{if(file.size>12_000_000)throw Error('Package exceeds 12 MB.');const result=await verifyPackageImages(await file.text());if(current!==token.current)return;await saveVisualAssets(result.packs);await refresh();if(mounted.current)setStatus('Asset package imported.');}catch(cause){if(current===token.current)fail(cause);}finally{if(current===token.current&&mounted.current)setBusy(false);}}
  function cropSelection(){
    if(!image||settings.polygon.length<3)return;
    const xs=settings.polygon.map(p=>p.x*image.naturalWidth),ys=settings.polygon.map(p=>p.y*image.naturalHeight),x=Math.floor(Math.min(...xs)),y=Math.floor(Math.min(...ys));
    const width=Math.min(image.naturalWidth-x,Math.ceil(Math.max(...xs))-x),height=Math.min(image.naturalHeight-y,Math.ceil(Math.max(...ys))-y);
    setSettings(s=>({...s,crop:{x,y,width:Math.max(1,width),height:Math.max(1,height)}}));
    if(sceneSource){setWidth(Math.max(8,Math.min(960,width/image.naturalWidth*960)));setHeight(Math.max(8,Math.min(540,height/image.naturalHeight*540)));}
  }
  async function prompt(){const value=assetInstructions(category,targetProfile);try{await navigator.clipboard.writeText(value);setStatus('AI asset instructions copied.');}catch{setInstructions(value);}}
  function template(){const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="-100 -240 200 270"><rect x="-100" y="-240" width="200" height="270" fill="#f2edf8"/><g fill="none" stroke="#684695"><path d="M0 0V-76L0-130L0-166M-24-120L-30-93L-36-66M24-120L30-93L36-66M-12-76L-15-38L-18 0M12-76L15-38L18 0"/><ellipse cx="0" cy="-166" rx="38" ry="44"/><rect x="-30" y="-130" width="60" height="75"/></g><g font-family="sans-serif" font-size="5" fill="#302437"><text x="4" y="-166">Head / hair pivot</text><text x="4" y="-130">Neck / torso pivot</text><text x="4" y="0">Ground (0,0)</text></g></svg>`;downloadText('SIRVIBE-native-rig-template.svg',svg,'image/svg+xml');}
  return <Modal wide title="Asset preparation" description="Prepare artwork once. Reuse it in your cartoons." close={close}>
    <div className="asset-workbench"><div className="segmented"><button type="button" aria-pressed={tab==='library'} onClick={()=>setTab('library')}>Your artwork</button><button type="button" aria-pressed={tab==='prepare'} onClick={()=>setTab('prepare')}>Prepare artwork</button></div>
    <input ref={input} hidden type="file" accept="image/png,image/webp,image/svg+xml" onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void load(file);}}/>
    <input ref={importInput} hidden type="file" accept=".sirvibe-assets,application/json" onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void importPack(file);}}/>
    <div className="field-row"><button type="button" className="quiet" disabled={busy} onClick={()=>input.current?.click()}>Choose artwork</button><button type="button" className="quiet" disabled={busy} onClick={()=>importInput.current?.click()}>Import asset pack</button><button type="button" className="quiet" onClick={template}>Rig template</button></div>
    {busy&&<p role="status">Preparing artwork… <button type="button" onClick={()=>{token.current++;setBusy(false);}}>Cancel</button></p>}
    {error&&<p role="alert" className="form-error">{error}</p>}{status&&<p role="status">{status}</p>}
    {tab==='library'?<><input aria-label="Search artwork" placeholder="Search names, categories and tags" value={query} onChange={e=>setQuery(e.target.value)}/>
      <div className="visual-asset-grid">{rows.filter(row=>(row.pack.name+' '+row.pack.category+' '+row.pack.tags.join(' ')).toLowerCase().includes(query.toLowerCase())).map(row=><article key={row.id}>
        <img src={row.pack.files[0].data} alt={row.pack.name}/><input aria-label={`Rename artwork ${row.pack.name}`} defaultValue={row.pack.name} maxLength={60} onBlur={e=>{if(e.target.value.trim()&&e.target.value!==row.pack.name)void updateVisualAsset(row.id,{name:e.target.value.trim()}).then(refresh).catch(fail);}}/>
        <p>{compatibility(row.pack)}</p><div className="field-row"><button type="button" className="primary" onClick={()=>{void Promise.resolve().then(()=>apply(row.pack)).catch(fail);}}>Use artwork</button><button type="button" aria-pressed={row.favorite} onClick={()=>void updateVisualAsset(row.id,{favorite:!row.favorite}).then(refresh).catch(fail)}>{row.favorite?'★':'☆'}</button></div>
        <div className="field-row"><button type="button" onClick={()=>{try{downloadText(row.pack.name.replace(/[^a-z0-9_-]/gi,'-')+'.sirvibe-assets',exportAssetPackage((()=>{const included=new Set<string>();const collect=(pack:VisualAssetPack)=>{if(included.has(pack.id))return;included.add(pack.id);for(const id of pack.dependencies){const dependency=rows.find(r=>r.id===id);if(!dependency)throw Error('Missing dependency: '+id);collect(dependency.pack);}};collect(row.pack);return rows.filter(r=>included.has(r.id)).map(r=>r.pack);})()));}catch(cause){fail(cause);}}}>Export</button><button type="button" onClick={()=>{const copy={...row.pack,id:'asset-'+uid(),name:(row.pack.name+' copy').slice(0,60)};void saveVisualAssets([copy]).then(refresh).catch(fail);}}>Duplicate</button><button type="button" onClick={()=>void deleteVisualAsset(row.id).then(refresh).catch(fail)}>Delete</button></div>
      </article>)}</div>{!rows.length&&<p>Your artwork library is empty. Import a pack or prepare an image to begin.</p>}</>:<div className="preparation-grid"><div>
      {image?<div className="preparation-image"><svg viewBox={`0 0 ${image.naturalWidth} ${image.naturalHeight}`} role="img" aria-label="Artwork selection canvas" onPointerDown={event=>{
        const box=event.currentTarget.getBoundingClientRect(),x=Math.max(0,Math.min(1,(event.clientX-box.left)/box.width)),y=Math.max(0,Math.min(1,(event.clientY-box.top)/box.height));
        if(mode==='pivot')setPivot({x:Math.max(0,Math.min(1,(x*image.naturalWidth-settings.crop.x)/settings.crop.width)),y:Math.max(0,Math.min(1,(y*image.naturalHeight-settings.crop.y)/settings.crop.height))});
        else setSettings(s=>({...s,polygon:[...s.polygon,{x,y}].slice(0,80)}));
      }}><image href={image.src} width={image.naturalWidth} height={image.naturalHeight}/><rect {...settings.crop} fill="none" stroke="#ffe0a4" strokeWidth={image.naturalWidth/250}/>
      {settings.polygon.length>0&&<polygon points={settings.polygon.map(p=>`${p.x*image.naturalWidth},${p.y*image.naturalHeight}`).join(' ')} fill="#8654d933" stroke="#b697ff" strokeWidth={image.naturalWidth/200}/>}
      <circle cx={settings.crop.x+pivot.x*settings.crop.width} cy={settings.crop.y+pivot.y*settings.crop.height} r={image.naturalWidth/80} fill="#fbd397"/></svg></div>:<p>Choose a PNG, WebP or SVG. For a character sheet, select and save one component at a time.</p>}
      <div className="field-row"><button type="button" aria-pressed={mode==='polygon'} onClick={()=>setMode('polygon')}>Polygon selection</button><button type="button" aria-pressed={mode==='pivot'} onClick={()=>setMode('pivot')}>Place pivot</button></div>
      <div className="field-row"><button type="button" disabled={!settings.polygon.length} onClick={()=>setSettings(s=>({...s,polygon:s.polygon.slice(0,-1)}))}>Undo point</button><button type="button" onClick={()=>setSettings(s=>({...s,polygon:[]}))}>Clear selection</button><button type="button" disabled={settings.polygon.length<3} onClick={cropSelection}>Crop to selection</button></div>
      <button type="button" className="quiet" disabled={!image||busy} onClick={()=>{try{setPreview(preparePixels(image!,settings).data);setError('');}catch(cause){fail(cause);}}}>Preview transparency</button>{preview&&<img className="prepared-preview" src={preview} alt="Prepared transparent artwork"/>}
      <p className="small-text">Click polygon points around the object. Hair pivots attach to the head; clothing pivots attach to the neck. This prepares visible pixels; hidden parts need separate artwork.</p>
    </div><div>
      <label className="field">Artwork name<input aria-label="Artwork name" value={name} maxLength={60} onChange={e=>setName(e.target.value)}/></label>
      <label className="field">Category<select aria-label="Artwork category" value={category} onChange={e=>selectCategory(e.target.value as Category)}>{(['hair','clothing','prop','environment'] as const).map(c=><option key={c}>{c}</option>)}</select></label>
      <label className="field">Supported view<select aria-label="Artwork view" value={view} onChange={e=>setView(e.target.value as typeof view)}>{assetViews.map(v=><option key={v}>{v}</option>)}</select></label>
      <label className="field">Compatible body profile<select aria-label="Artwork body profile" value={targetProfile} onChange={e=>setProfile(e.target.value as typeof targetProfile)}>{bodyProfiles.map(p=><option key={p}>{p}</option>)}</select></label>
      <div className="field-row"><label>Width in rig units<input aria-label="Artwork rig width" type="number" min={8} max={category==='hair'||category==='clothing'?160:960} value={rigWidth} onChange={e=>setWidth(Number(e.target.value))}/></label><label>Height in rig units<input aria-label="Artwork rig height" type="number" min={8} max={category==='hair'||category==='clothing'?180:540} value={rigHeight} onChange={e=>setHeight(Number(e.target.value))}/></label></div>
      <div className="field-row">{(['x','y'] as const).map(key=><label key={key}>Pivot {key}<input aria-label={`Pivot ${key}`} type="number" min={0} max={1} step={.01} value={pivot[key]} onChange={e=>setPivot(p=>({...p,[key]:Number(e.target.value)}))}/></label>)}</div>
      <label className="check"><input type="checkbox" checked={symmetrical} onChange={e=>setSymmetrical(e.target.checked)}/> Symmetrical artwork (safe to mirror)</label>
      <label className="check"><input type="checkbox" checked={sceneSource} onChange={e=>setSceneSource(e.target.checked)}/> Source is a scene image; preserve its placement</label>
      {category==='prop'&&<><label className="field">Interaction<select aria-label="Artwork interaction" value={interaction} onChange={e=>setInteraction(e.target.value as typeof interaction)}><option>none</option><option>hold</option><option>sit</option></select></label>{interaction!=='none'&&<div className="field-row">{(['x','y'] as const).map(k=><label key={k}>Interaction anchor {k}<input type="number" min={0} max={1} step={.01} value={anchor[k]} onChange={e=>setAnchor(a=>({...a,[k]:Number(e.target.value)}))}/></label>)}</div>}</>}
      <details><summary>Crop and background colour</summary>{(['x','y','width','height'] as const).map(key=><label className="field" key={key}>Crop {key}<input aria-label={`Crop ${key}`} type="number" min={key==='width'||key==='height'?1:0} value={settings.crop[key]} onChange={e=>setSettings(s=>({...s,crop:{...s.crop,[key]:Number(e.target.value)}}))}/></label>)}
      <label className="check"><input type="checkbox" checked={Boolean(settings.eraseColor)} onChange={e=>setSettings(s=>({...s,eraseColor:e.target.checked?'#ffffff':undefined}))}/> Remove a flat background colour</label>{settings.eraseColor&&<><input aria-label="Background removal colour" type="color" value={settings.eraseColor} onChange={e=>setSettings(s=>({...s,eraseColor:e.target.value}))}/><label>Tolerance<input aria-label="Background removal tolerance" type="range" min={0} max={160} value={settings.tolerance} onChange={e=>setSettings(s=>({...s,tolerance:Number(e.target.value)}))}/></label></>}</details>
      <label className="field">Licence<input aria-label="Artwork licence" value={license} maxLength={500} onChange={e=>setLicense(e.target.value)}/></label><label className="field">Provenance<input aria-label="Artwork provenance" value={provenance} maxLength={500} onChange={e=>setProvenance(e.target.value)}/></label>
      <button type="button" className="primary full" disabled={!image||busy} onClick={()=>void save()}>Save reusable artwork</button><button type="button" className="quiet full" onClick={()=>void prompt()}>Copy AI Asset Instructions</button>
      {instructions&&<textarea aria-label="AI asset instructions" rows={8} readOnly value={instructions} onFocus={e=>e.target.select()}/>}
    </div></div>}
    </div>
  </Modal>;
}
