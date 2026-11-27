import { useState } from 'react';
import { applyProfile, illustratedCharacters } from '../engine/visualPresets.ts';
import { bodyProfiles, compileComponents, assetInstructions, type CharacterVisualData, type VisualAssetPack } from '../engine/visualAssets.ts';
import type { Character } from '../engine/schema.ts';
import { AssetWorkbench } from './AssetWorkbench.tsx';
const controls=[['shoulders','Shoulder width',.8,1.25],['waist','Waist width',.75,1.35],['hips','Hip width',.8,1.3],['armWidth','Arm thickness',.75,1.3],['thighWidth','Thigh thickness',.75,1.3],['calfWidth','Calf thickness',.8,1.25],['handSize','Hand size',.75,1.3],['footSize','Foot size',.8,1.25],['neckLength','Neck length',.8,1.2]] as const;
export function CharacterVisualStudio({character,change}:{character:Character;change:(c:Character)=>void}){
  const [workbench,setWorkbench]=useState(false),[status,setStatus]=useState(''),[prompt,setPrompt]=useState('');
  const visual=character.visual??{version:1 as const,style:'classic' as const,profile:'average' as const};
  function patch(values:Partial<CharacterVisualData>){change({...character,visual:{...visual,...values}});}
  function apply(pack:VisualAssetPack){
    if(!['hair','clothing'].includes(pack.category))throw Error('Use props and environments from the scene artwork library.');
    if(pack.style!==visual.style)throw Error(`This artwork requires the ${pack.style} art style. Change Art style before applying it.`);
    const components=compileComponents(pack);
    if(!components.length||components.some(c=>!c.profiles.includes(visual.profile)))throw Error(`This artwork does not fit the ${visual.profile} profile. Choose a compatible body profile first.`);
    patch({components:[...(visual.components??[]).filter(old=>!components.some(next=>next.slot===old.slot&&next.view===old.view)),...components]});
    setWorkbench(false);setStatus(`Applied ${pack.name}. Other views retain the native artwork; test all declared views and match sleeve colour for clothing.`);
  }
  return <details className="character-visual-studio"><summary>Illustrated characters & imported artwork</summary>
    <div className="field-row">{illustratedCharacters.map(preset=><button type="button" key={preset.id} onClick={()=>change({...preset,id:character.id,name:character.name})}>Use {preset.name}</button>)}</div>
    <label className="field">Art style<select aria-label="Art style" value={visual.style} onChange={e=>{patch({style:e.target.value as CharacterVisualData['style'],components:[]});setStatus('Style changed; custom components were detached.');}}><option value="classic">Classic SIRVIBE</option><option value="illustrated">Illustrated studio</option></select></label>
    <label className="field">Body profile<select aria-label="Body profile" value={visual.profile} onChange={e=>{change(applyProfile(character,e.target.value as CharacterVisualData['profile']));setStatus('Profile proportions applied. Incompatible artwork was detached; undo by closing without saving.');}}>{bodyProfiles.map(p=><option key={p}>{p}</option>)}</select></label>
    {controls.map(([id,label,min,max])=><label className="field slider" key={id}>{label}<input aria-label={label} type="range" min={min} max={max} step={.01} value={visual[id]??1} onChange={e=>patch({[id]:Number(e.target.value)})}/></label>)}
    <div className="field-row"><button type="button" onClick={()=>patch(Object.fromEntries(controls.map(([id])=>[id,1])))}>Reset body adjustments</button><button type="button" onClick={()=>setWorkbench(true)}>Import / prepare artwork</button></div>
    {!!visual.components?.length&&<><p className="small-text">{visual.components.map(p=>p.slot+' · '+p.view).join(', ')}</p><button type="button" onClick={()=>patch({components:[]})}>Use native artwork</button></>}
    <button type="button" className="quiet full" onClick={()=>{const text=assetInstructions('hair',visual.profile,visual.style);void navigator.clipboard.writeText(text).then(()=>setStatus('AI instructions copied.')).catch(()=>setPrompt(text));}}>Copy AI Asset Instructions</button>
    {prompt&&<textarea aria-label="AI character asset instructions" value={prompt} readOnly rows={5} onFocus={e=>e.target.select()}/>}{status&&<p role="status" className="small-text">{status}</p>}
    {workbench&&<AssetWorkbench close={()=>setWorkbench(false)} profile={visual.profile} apply={apply}/>}
  </details>;
}
