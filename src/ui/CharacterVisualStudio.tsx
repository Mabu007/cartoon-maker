import {applyNativePackage,boundedAssetJSON,type NativeAssetPack} from '../engine/nativeAssetPackage.ts';
import {forearmVectorFixture} from '../engine/vectorArtworkFixture.ts';
import {assetViews,NativeVectorComponent} from '../engine/visualAssets.ts';
import type {View} from '../engine/schema.ts';
import { exportCharacterArtwork, downloadText } from '../services/assetPreparation.ts';
import { exportAssetPackage, characterCompatibility } from '../engine/visualAssets.ts';
import { useState } from 'react';
import { applyProfile, illustratedCharacters, studioCharacters, flagshipCharacters } from '../engine/visualPresets.ts';
import { CharacterVisual, bodyProfiles, compileComponents, assetInstructions, type CharacterVisualData, type VisualAssetPack } from '../engine/visualAssets.ts';
import type { Character } from '../engine/schema.ts';
import { AssetWorkbench } from './AssetWorkbench.tsx';
const controls=[['shoulders','Shoulder width',.8,1.25],['waist','Waist width',.75,1.35],['hips','Hip width',.8,1.3],['armWidth','Arm thickness',.75,1.3],['thighWidth','Thigh thickness',.75,1.3],['calfWidth','Calf thickness',.8,1.25],['handSize','Hand size',.75,1.3],['footSize','Foot size',.8,1.25],['neckLength','Neck length',.8,1.2],['abdomen','Abdomen',.8,1.3]] as const;
export function CharacterVisualStudio({character,change}:{character:Character;change:(c:Character)=>void}){
  const [workbench,setWorkbench]=useState(false),[status,setStatus]=useState(''),[prompt,setPrompt]=useState('');
  const [vectorView,setVectorView]=useState<View>('three-quarter');
  const [vectorFacing,setVectorFacing]=useState<'both'|'normal'|'mirrored'>('both');
  const visual=character.visual??{version:1 as const,style:'classic' as const,profile:'average' as const};
  function patch(values:Partial<CharacterVisualData>){const result=CharacterVisual.safeParse({...visual,...values});if(!result.success){setStatus(result.error.issues[0]?.message??'Invalid artwork');return;}change({...character,visual:result.data});}
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
  function applyNative(packs:NativeAssetPack[],root:string){const next=applyNativePackage(character,packs,root);change(next);setWorkbench(false);setStatus('Native vector geometry applied to draft. Save to retain.');}
  const activeVector=visual.vectorComponents?.find(p=>p.slot==='forearm-left'&&p.view===vectorView&&(p.facing??'both')===vectorFacing);
  function editVector(update:Partial<NonNullable<CharacterVisualData['vectorComponents']>[number]>){
    if(!activeVector)return;
    const part=NativeVectorComponent.parse({...activeVector,...update});
    patch({vectorComponents:visual.vectorComponents!.map(p=>p===activeVector?part:p)});
  }
  function addVector(){
    const part=NativeVectorComponent.parse({id:'forearm-fixture',slot:'forearm-left',view:vectorView,profiles:[...bodyProfiles],...(vectorFacing==='both'?{}:{facing:vectorFacing}),fitMorphology:'anatomical-v1',artwork:structuredClone(forearmVectorFixture)});
    patch({vectorComponents:[...(visual.vectorComponents??[]).filter(p=>p.slot!==part.slot||p.view!==part.view||(p.facing&&part.facing&&p.facing!==part.facing)),part],...(visual.components?{components:visual.components.filter(p=>p.slot!==part.slot||p.view!==part.view)}:{})});
    setStatus('Native forearm fixture added. Select the matching preview view; this replaces the left forearm artwork only.');
  }
  return <details className="character-visual-studio"><summary>Illustrated characters & imported artwork</summary>
    <p className="small-text">Studio makeovers · fully editable native artwork and existing animation rig.</p>
    <div className="field-row">{studioCharacters.map(preset=><button type="button" key={preset.id} onClick={()=>{change({...structuredClone(preset),id:character.id,name:character.name});setStatus(`Applied ${preset.name}. Body, face, colours, hair and clothing remain editable.`);}}>Use {preset.name}</button>)}</div>
    <p className="small-text">Vector Studio upgrade candidates (explicit opt-in)</p>
    <div className="field-row">{flagshipCharacters.map(preset=><button type="button" key={preset.id} onClick={()=>{change({...structuredClone(preset),id:character.id,name:character.name});setStatus('Vector Studio upgrade applied to draft. Save to retain.');}}>Use {preset.name}</button>)}</div>
    <p className="small-text">Imported artwork examples</p>
    <div className="field-row">{illustratedCharacters.map(preset=><button type="button" key={preset.id} onClick={()=>change({...preset,id:character.id,name:character.name})}>Use {preset.name}</button>)}</div>
    <label className="field">Art style<select aria-label="Art style" value={visual.style} onChange={e=>{patch({style:e.target.value as CharacterVisualData['style'],components:[],...(visual.vectorComponents?{vectorComponents:[]}:{})});setStatus('Style changed; custom components were detached.');}}><option value="classic">Classic SIRVIBE</option><option value="illustrated">Illustrated studio</option></select></label>
    {visual.style==='illustrated'&&visual.limbArt==='anatomical-v1'&&<label className="check"><input type="checkbox" checked={visual.primaryArt==='pose-v1'} onChange={e=>patch({primaryArt:e.target.checked?'pose-v1':undefined})}/>Pose-aware anatomical contours</label>}
    {visual.style==='illustrated'&&<label className="field">Limb illustration<select aria-label="Limb illustration" value={visual.limbArt??'legacy'} onChange={e=>changeLimbArt(e.target.value)}><option value="legacy">Original illustrated</option><option value="anatomical-v1">Anatomical vector v1</option></select></label>}
    <label className="field">Body profile<select aria-label="Body profile" value={visual.profile} onChange={e=>{change(applyProfile(character,e.target.value as CharacterVisualData['profile']));setStatus('Profile proportions applied. Incompatible artwork was detached; undo by closing without saving.');}}>{bodyProfiles.map(p=><option key={p}>{p}</option>)}</select></label>
    <details><summary>Native vector component · experimental</summary>
      <label className="field">Component view<select aria-label="Native vector view" value={vectorView} onChange={e=>setVectorView(e.target.value as View)}>{assetViews.map(v=><option key={v}>{v}</option>)}</select></label>
      <label className="field">Facing<select aria-label="Native vector facing" value={vectorFacing} onChange={e=>setVectorFacing(e.target.value as typeof vectorFacing)}><option value="both">Mirror-safe both</option><option value="normal">Normal</option><option value="mirrored">Mirrored</option></select></label>
      <label className="field">Import native component<input aria-label="Import native vector component" type="file" accept=".json" onChange={async e=>{const input=e.currentTarget,file=input.files?.[0];if(!file)return;try{if(file.size>500000)throw Error('Vector file exceeds 500 KB');const part=NativeVectorComponent.parse(boundedAssetJSON(await file.text(),500000));if(!part.profiles.includes(visual.profile))throw Error('Component profile mismatch');patch({vectorComponents:[...(visual.vectorComponents??[]).filter(p=>p.slot!==part.slot||p.view!==part.view||(p.facing&&part.facing&&p.facing!==part.facing)),part]});}catch(error){setStatus(error instanceof Error?error.message:'Invalid component');}finally{input.value='';}}}/></label>
      {!activeVector?<button type="button" onClick={addVector}>Add native forearm fixture</button>:<>
        <label className="check"><input type="checkbox" checked={activeVector.fitMorphology==='anatomical-v1'} onChange={e=>editVector({fitMorphology:e.target.checked?'anatomical-v1':undefined})}/> Fit native contour to anatomy</label>
        <button type="button" onClick={()=>downloadText(activeVector.id+'.json',JSON.stringify(activeVector,null,2))}>Export vector component</button>
        {Object.entries(activeVector.artwork.palette).map(([key,color])=><label className="field" key={key}>{key}<input aria-label={'Vector palette '+key} type="color" value={color} onChange={e=>editVector({artwork:{...activeVector.artwork,palette:{...activeVector.artwork.palette,[key]:e.target.value}}})}/></label>)}
        <label className="field">Authored deformation<input aria-label="Vector deformation" type="range" min={-.08} max={.08} step={.005} value={activeVector.authoredOffset?.[1]??0} onChange={e=>editVector({authoredOffset:[0,Number(e.target.value)]})}/></label>
        <button type="button" onClick={()=>patch({vectorComponents:visual.vectorComponents!.filter(p=>p!==activeVector)})}>Remove native forearm</button>
      </>}
      <p className="small-text">Local editable geometry; matching view only. Saved with the character. Deformation is an authored offset, not live physics.</p>
    </details>
    <label className="field slider">Chest / ribcage<input aria-label="Chest / ribcage" type="range" min={0} max={1} step={.01} value={character.bodyBuild?.chest??0} onChange={e=>change({...character,bodyBuild:{...character.bodyBuild,chest:Number(e.target.value)}})}/></label>
    {visual.style==='illustrated'&&visual.limbArt==='anatomical-v1'&&<details><summary>Anatomical contour controls</summary><p className="small-text">Affects native anatomical limbs, not custom imported slots.</p>{([['wristWidth','Wrist width',.85,1.15,1],['kneeWidth','Knee width',.85,1.15,1],['ankleWidth','Ankle width',.85,1.15,1],['muscleDefinition','Muscle definition',0,1,.5],['softness','Softness',0,1,.5]] as const).map(([id,label,min,max,neutral])=><label className="field slider" key={id}>{label}<input aria-label={label} type="range" min={min} max={max} step={.05} value={visual[id]??neutral} onChange={e=>patch({[id]:Number(e.target.value)})}/></label>)}</details>}
    <details><summary>Finger proportions</summary><p className="small-text">Free-hand artwork only; contact and captured finger poses retain their calibrated silhouette.</p>{['Thumb','Index','Middle','Ring','Pinky'].map((label,i)=><label key={label} className="field slider">{label}<input aria-label={label+' length'} type="range" min={.9} max={1.1} step={.02} value={visual.fingerLengths?.[i]??1} onChange={e=>{const lengths=[...(visual.fingerLengths??[1,1,1,1,1])] as [number,number,number,number,number];lengths[i]=Number(e.target.value);patch({fingerLengths:lengths});}}/></label>)}</details>
    {controls.map(([id,label,min,max])=><label className="field slider" key={id}>{label}<input aria-label={label} type="range" min={min} max={max} step={.01} value={visual[id]??1} onChange={e=>patch({[id]:Number(e.target.value)})}/></label>)}
    <div className="field-row"><button type="button" onClick={()=>patch(Object.fromEntries(controls.map(([id])=>[id,1])))}>Reset body adjustments</button><button type="button" onClick={()=>setWorkbench(true)}>Import / prepare artwork</button></div>
    {!!visual.components?.length&&<><p className="small-text">{visual.components.map(p=>p.slot+' · '+p.view).join(', ')}</p><button type="button" onClick={()=>patch({components:[]})}>Use native artwork</button></>}
    <button type="button" className="quiet full" disabled={!visual.components?.length} onClick={()=>{try{downloadText(character.name.replace(/[^a-z0-9_-]/gi,'-')+'-body.sirvibe-assets',exportAssetPackage([exportCharacterArtwork(character)]));}catch(error){setStatus(error instanceof Error?error.message:'Could not export artwork.');}}}>Export character body artwork</button>
    <button type="button" className="quiet full" onClick={()=>{const text=assetInstructions('hair',visual.profile,visual.style);void navigator.clipboard.writeText(text).then(()=>setStatus('AI instructions copied.')).catch(()=>setPrompt(text));}}>Copy AI Asset Instructions</button>
    {prompt&&<textarea aria-label="AI character asset instructions" value={prompt} readOnly rows={5} onFocus={e=>e.target.select()}/>}{status&&<p role="status" className="small-text">{status}</p>}
    {workbench&&<AssetWorkbench close={()=>setWorkbench(false)} profile={visual.profile} character={character} apply={apply} applyNative={applyNative}/>}
  </details>;
}
