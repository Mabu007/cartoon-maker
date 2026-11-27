import {useState} from 'react';
import {aiVectorCategories,aiCategoryInfo,aiMaterialPresets,generateAiVectorSpecification,nativePackageSchemaText,exportAiStarter,type AiVectorCategory,type AiMaterial,type AiVectorOptions} from '../engine/aiVectorSpecification.ts';
import {assetViews,bodyProfiles} from '../engine/visualAssets.ts';
import type {Character,View} from '../engine/schema.ts';
import {downloadText} from '../services/assetPreparation.ts';
export function AiVectorSpecification({profile='average',character}:{profile?:typeof bodyProfiles[number];character?:Character}){
 const [category,setCategory]=useState<AiVectorCategory>('hair'),[brief,setBrief]=useState(''),[views,setViews]=useState<View[]>(['front','three-quarter']),[material,setMaterial]=useState<AiMaterial>('braid'),[target,setTarget]=useState(profile),[style,setStyle]=useState<'classic'|'illustrated'>(character?.visual?.style??'illustrated'),[prompt,setPrompt]=useState(''),[message,setMessage]=useState('');
 const info=aiCategoryInfo(category),supported=info.status!=='unsupported';
 const options:AiVectorOptions={category,brief,views,profile:target,style,material,character};
 function changed(){setPrompt('');setMessage('');}
 function generate(){return generateAiVectorSpecification(options);}
 async function copy(){try{const value=generate();setPrompt(value);try{await navigator.clipboard.writeText(value);setMessage('Specification copied. Paste into your chosen external AI.');}catch{setMessage('Clipboard unavailable. Select the specification below and copy manually.');}}catch(e){setMessage(e instanceof Error?e.message:String(e));}}
 function action(fn:()=>void){try{fn();}catch(e){setMessage(e instanceof Error?e.message:String(e));}}
 return <details className="factory-details"><summary>AI vector specification · optional external workflow</summary>
 <p className="small-text">SIRVIBE generates instructions locally, not artwork. No AI account, model, network call or automatic upload is required. Use an external AI or write JSON yourself. Reference images are optional and separate from vector data.</p>
 <label className="field">Asset task<select aria-label="AI asset task" value={category} onChange={e=>{setCategory(e.target.value as AiVectorCategory);changed();}}>{Object.entries(aiVectorCategories).map(([id,c])=><option key={id} value={id}>{c.label} — {c.status}</option>)}</select></label>
 <p role="note">{info.reason}</p>
 {supported&&<>
 <label className="field">Art brief<textarea aria-label="AI art brief" maxLength={1600} rows={3} value={brief} onChange={e=>{setBrief(e.target.value);changed();}} placeholder="e.g. Copper shoulder-length locs with a strong clean silhouette"/></label>
 <div className="field-row"><label>Target body profile<select aria-label="AI body profile" value={target} onChange={e=>{setTarget(e.target.value as typeof target);changed();}}>{bodyProfiles.map(v=><option key={v}>{v}</option>)}</select></label><label>Art style<select aria-label="AI art style" value={style} onChange={e=>{setStyle(e.target.value as typeof style);changed();}}><option>illustrated</option><option>classic</option></select></label></div>
 <fieldset><legend>Target views (only author views actually supplied)</legend>{assetViews.map(v=><label className="check" key={v}><input type="checkbox" checked={views.includes(v)} onChange={e=>{setViews(old=>e.target.checked?assetViews.filter(x=>x===v||old.includes(x)):old.filter(x=>x!==v));changed();}}/>{v}</label>)}</fieldset>
 <label className="field">Material preset<select aria-label="AI material preset" value={material} onChange={e=>{setMaterial(e.target.value as AiMaterial);changed();}}>{aiMaterialPresets.map(v=><option key={v}>{v}</option>)}</select></label>
 <div className="field-row"><button type="button" className="primary" disabled={!views.length} onClick={()=>void copy()}>Copy AI Vector Asset Specification</button><button type="button" disabled={!views.length} onClick={()=>action(()=>{const value=generate();setPrompt(value);downloadText('sirvibe-'+category+'-ai-spec.txt',value,'text/plain');})}>Download specification</button><button type="button" onClick={()=>action(()=>downloadText('sirvibe-native-package.schema.json',nativePackageSchemaText()))}>Download JSON Schema</button>{info.example&&<button type="button" disabled={!views.length} onClick={()=>action(()=>{const value=exportAiStarter(options);if(!value)throw Error('No authored starter for selected views. Choose front or three-quarter.');downloadText('authored-starter-'+category+'.sirvibe-assets',value);setMessage('Downloaded an authored fixture, not AI-generated artwork.');})}>Download authored starter</button>}</div>
 {prompt&&<label className="field">Generated specification<textarea aria-label="Generated AI vector specification" readOnly rows={12} value={prompt} onFocus={e=>e.currentTarget.select()}/></label>}
 </>}
 {message&&<p role="status">{message}</p>}
 <p className="small-text">External output must be plain native JSON. Paste it into the quarantine validator below, or import the downloaded file. Never paste executable SVG or scripts. Unsupported categories are not enabled for generation.</p>
 </details>;
}
