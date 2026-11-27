import {garmentDefaults,GarmentDesignV1,garmentFits,garmentTops,garmentBottoms,garmentOuters,garmentShoes,garmentMaterials,type GarmentDesign} from '../engine/garmentDesignSchema.ts';
import type {Character} from '../engine/schema.ts';
import {useState} from 'react';
const selections=[['top','Top',garmentTops],['bottom','Bottom',garmentBottoms],['outer','Outer garment',garmentOuters],['footwear','Footwear',garmentShoes],['fit','Fit',garmentFits],['material','Fabric',garmentMaterials],['neckline','Neckline',['crew','v','collar']],['closure','Closure',['none','buttons','zipper']],['pattern','Pattern',['solid','stripes','checks','dots']],['logo','Logo',['none','circle','diamond']]] as const;
const ranges=[['sleeve','Sleeve coverage',0,2],['length','Garment length',.8,1.2],['waist','Waist ease',.9,1.15],['hem','Hem width',.9,1.2],['cuff','Cuff width',.9,1.2],['patternScale','Pattern size',.7,1.5],['patternOpacity','Pattern opacity',0,.7],['logoScale','Logo size',.6,1.2],['folds','Fold detail',0,1],['soleThickness','Sole thickness',1,4]] as const;
export function GarmentControls({character,change}:{character:Character;change:(value:GarmentDesign|undefined)=>void}){
 const d=character.garmentDesign??garmentDefaults,[status,setStatus]=useState('');
 function patch(p:Partial<GarmentDesign>){const result=GarmentDesignV1.safeParse({...d,...p});if(result.success){change(result.data);setStatus('');}else setStatus('Invalid garment settings');}
 return <details className="factory-details"><summary>Modular garments · vector v1</summary>
  <label className="check"><input type="checkbox" checked={!!character.garmentDesign} onChange={e=>change(e.target.checked?structuredClone(d):undefined)}/>Use modular garments</label>
  <p className="small-text">Choose independent clothing layers. Existing imported parts take precedence. Shirtless and swimwear use the original renderer. The existing shirt, trousers and shoe colour controls still apply.</p>
  {character.garmentDesign&&<>
   {selections.map(([key,label,options])=><label className="field" key={key}>{label}<select aria-label={'Garment '+label} value={d[key]} onChange={e=>patch({[key]:e.target.value})}>{options.map(v=><option key={v}>{v}</option>)}</select></label>)}
   {ranges.map(([key,label,min,max])=><label className="field slider" key={key}>{label}<input aria-label={'Garment '+label} type="range" min={min} max={max} step={.01} value={d[key]} onChange={e=>patch({[key]:Number(e.target.value)})}/></label>)}
   {(['pockets','seams','laceDetail'] as const).map(key=><label className="check" key={key}><input type="checkbox" checked={d[key]} onChange={e=>patch({[key]:e.target.checked})}/>{key}</label>)}
   {(['outerColor','accent','sole','laces'] as const).map(key=><label key={key} className="field">{key}<input aria-label={'Garment '+key} type="color" value={d[key]} onChange={e=>patch({[key]:e.target.value})}/></label>)}
   <button type="button" onClick={()=>{const blob=new Blob([JSON.stringify(d,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='garment-v1.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}>Export garment design</button>
   <label className="field">Import garment design<input type="file" accept=".json" onChange={async e=>{const input=e.currentTarget,file=input.files?.[0];if(!file)return;try{if(file.size>65536)throw Error('Garment file exceeds 64 KB');change(GarmentDesignV1.parse(JSON.parse(await file.text())));setStatus('Garment imported');}catch(error){setStatus(error instanceof Error?error.message:'Invalid design');}finally{input.value='';}}}/></label>
  </>}
  {status&&<p role="status" className="small-text">{status}</p>}
 </details>;
}
