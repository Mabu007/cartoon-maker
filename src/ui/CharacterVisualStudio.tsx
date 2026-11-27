import {forearmVectorFixture} from '../engine/vectorArtworkFixture.ts';
import {assetViews,NativeVectorComponent} from '../engine/visualAssets.ts';
import type {View} from '../engine/schema.ts';
import { exportCharacterArtwork, downloadText } from '../services/assetPreparation.ts';
import { exportAssetPackage, characterCompatibility } from '../engine/visualAssets.ts';
import { useState } from 'react';
import { applyProfile, illustratedCharacters, studioCharacters } from '../engine/visualPresets.ts';
import { bodyProfiles, compileComponents, assetInstructions, type CharacterVisualData, type VisualAssetPack } from '../engine/visualAssets.ts';
import type { Character } from '../engine/schema.ts';
import { AssetWorkbench } from './AssetWorkbench.tsx';
const controls=[['shoulders','Shoulder width',.8,1.25],['waist','Waist width',.75,1.35],['hips','Hip width',.8,1.3],['armWidth','Arm thickness',.75,1.3],['thighWidth','Thigh thickness',.75,1.3],['calfWidth','Calf thickness',.8,1.25],['handSize','Hand size',.75,1.3],['footSize','Foot size',.8,1.25],['neckLength','Neck length',.8,1.2]] as const;
export function CharacterVisualStudio({character,change}:{character:Character;change:(c:Character)=>void}){
  const [workbench,setWorkbench]=useState(false),[status,setStatus]=useState(''),[prompt,setPrompt]=useState('');
  const [vectorView,setVectorView]=useState<View>('three-quarter');
  const visual=character.visual??{version:1 as const,style:'classic' as const,profile:'average' as const};
  function patch(values:Partial<CharacterVisualData>){change({...character,visual:{...visual,...values}});}
  function changeLimbArt(value:string){
    const next:CharacterVisualData={...visual};
    if(value==='anatomical-v1')next.limbArt=value;
    else delete next.limbArt;
    change({...character,visual:next});
  }
  function apply(pack:VisualAssetPack){
    if(!['hair','clothing','character'].includes(pack.category))throw Error('Use props and environments from the scene artwork library.');
    if(pack.style!==visual.style)throw Error(`This artwork requires the ${pack.style} art style. Change Art style before applying it.`);
    const components=compileComponents(pack);
    if(!components.length||components.some(c=>!c.profiles.includes(visual.profile)))throw Error(`This artwork does not fit the ${visual.profile} profile. Choose a compatible body profile first.`);
    patch({components:[...(visual.components??[]).filter(old=>!components.some(next=>next.slot===old.slot&&next.view===old.view)),...components],...(visual.vectorComponents?{vectorComponents:visual.vectorComponents.filter(old=>!components.some(next=>next.slot===old.slot&&next.view===old.view))}:{})});
    const report=pack.category==='character'?characterCompatibility(pack):undefined;
    setWorkbench(false);setStatus(`${report?.incompleteViews.length?'Partial body import: native parts fill undeclared slots. ':''}Applied ${pack.name}. Other views retain the native artwork; test all declared views and match sleeve colour for clothing.`);
  }
  const activeVector=visual.vectorComponents?.find(p=>p.slot==='forearm-left'&&p.view===vectorView);
  function editVector(update:Partial<NonNullable<CharacterVisualData['vectorComponents']>[number]>){
    if(!activeVector)return;
    const part=NativeVectorComponent.parse({...activeVector,...update});
    patch({vectorComponents:visual.vectorComponents!.map(p=>p===activeVector?part:p)});
  }
  function addVector(){
    const part=NativeVectorComponent.parse({id:'forearm-fixture',slot:'forearm-left',view:vectorView,profiles:[...bodyProfiles],artwork:structuredClone(forearmVectorFixture)});
    patch({vectorComponents:[...(visual.vectorComponents??[]).filter(p=>p.slot!==part.slot||p.view!==part.view),part],...(visual.components?{components:visual.components.filter(p=>p.slot!==part.slot||p.view!==part.view)}:{})});
    setStatus('Native forearm fixture added. Select the matching preview view; this replaces the left forearm artwork only.');
  }
  return <details className="character-visual-studio"><summary>Illustrated characters & imported artwork</summary>
    <p className="small-text">Studio makeovers · fully editable native artwork and existing animation rig.</p>
    <div className="field-row">{studioCharacters.map(preset=><button type="button" key={preset.id} onClick={()=>{change({...structuredClone(preset),id:character.id,name:character.name});setStatus(`Applied ${preset.name}. Body, face, colours, hair and clothing remain editable.`);}}>Use {preset.name}</button>)}</div>
    <p className="small-text">Imported artwork examples</p>
    <div className="field-row">{illustratedCharacters.map(preset=><button type="button" key={preset.id} onClick={()=>change({...preset,id:character.id,name:character.name})}>Use {preset.name}</button>)}</div>
    <label className="field">Art style<select aria-label="Art style" value={visual.style} onChange={e=>{patch({style:e.target.value as CharacterVisualData['style'],components:[],...(visual.vectorComponents?{vectorComponents:[]}:{})});setStatus('Style changed; custom components were detached.');}}><option value="classic">Classic SIRVIBE</option><option value="illustrated">Illustrated studio</option></select></label>
    {visual.style==='illustrated'&&<label className="field">Limb illustration<select aria-label="Limb illustration" value={visual.limbArt??'legacy'} onChange={e=>changeLimbArt(e.target.value)}><option value="legacy">Original illustrated</option><option value="anatomical-v1">Anatomical vector v1</option></select></label>}
    <label className="field">Body profile<select aria-label="Body profile" value={visual.profile} onChange={e=>{change(applyProfile(character,e.target.value as CharacterVisualData['profile']));setStatus('Profile proportions applied. Incompatible artwork was detached; undo by closing without saving.');}}>{bodyProfiles.map(p=><option key={p}>{p}</option>)}</select></label>
    <details><summary>Native vector component · experimental</summary>
      <label className="field">Component view<select aria-label="Native vector view" value={vectorView} onChange={e=>setVectorView(e.target.value as View)}>{assetViews.map(v=><option key={v}>{v}</option>)}</select></label>
      {!activeVector?<button type="button" onClick={addVector}>Add native forearm fixture</button>:<>
        {Object.entries(activeVector.artwork.palette).map(([key,color])=><label className="field" key={key}>{key}<input aria-label={'Vector palette '+key} type="color" value={color} onChange={e=>editVector({artwork:{...activeVector.artwork,palette:{...activeVector.artwork.palette,[key]:e.target.value}}})}/></label>)}
        <label className="field">Authored deformation<input aria-label="Vector deformation" type="range" min={-.08} max={.08} step={.005} value={activeVector.authoredOffset?.[1]??0} onChange={e=>editVector({authoredOffset:[0,Number(e.target.value)]})}/></label>
        <button type="button" onClick={()=>patch({vectorComponents:visual.vectorComponents!.filter(p=>p!==activeVector)})}>Remove native forearm</button>
      </>}
      <p className="small-text">Local editable geometry; matching view only. Saved with the character. Deformation is an authored offset, not live physics.</p>
    </details>
    {controls.map(([id,label,min,max])=><label className="field slider" key={id}>{label}<input aria-label={label} type="range" min={min} max={max} step={.01} value={visual[id]??1} onChange={e=>patch({[id]:Number(e.target.value)})}/></label>)}
    <div className="field-row"><button type="button" onClick={()=>patch(Object.fromEntries(controls.map(([id])=>[id,1])))}>Reset body adjustments</button><button type="button" onClick={()=>setWorkbench(true)}>Import / prepare artwork</button></div>
    {!!visual.components?.length&&<><p className="small-text">{visual.components.map(p=>p.slot+' · '+p.view).join(', ')}</p><button type="button" onClick={()=>patch({components:[]})}>Use native artwork</button></>}
    <button type="button" className="quiet full" disabled={!visual.components?.length} onClick={()=>{try{downloadText(character.name.replace(/[^a-z0-9_-]/gi,'-')+'-body.sirvibe-assets',exportAssetPackage([exportCharacterArtwork(character)]));}catch(error){setStatus(error instanceof Error?error.message:'Could not export artwork.');}}}>Export character body artwork</button>
    <button type="button" className="quiet full" onClick={()=>{const text=assetInstructions('hair',visual.profile,visual.style);void navigator.clipboard.writeText(text).then(()=>setStatus('AI instructions copied.')).catch(()=>setPrompt(text));}}>Copy AI Asset Instructions</button>
    {prompt&&<textarea aria-label="AI character asset instructions" value={prompt} readOnly rows={5} onFocus={e=>e.target.select()}/>}{status&&<p role="status" className="small-text">{status}</p>}
    {workbench&&<AssetWorkbench close={()=>setWorkbench(false)} profile={visual.profile} apply={apply}/>}
  </details>;
}
