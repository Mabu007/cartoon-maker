import {useState} from 'react';
import {hairDesignDefaults,type HairDesign} from '../engine/hairDesignSchema.ts';
import {buildLayeredHair,layeredHairStyles,hairRenderPaths} from '../engine/layeredHair.ts';
import {headOutline} from '../engine/faceIdentityGeometry.ts';
import {viewArt} from '../engine/actorArt.ts';
import {views,type Character,type View} from '../engine/schema.ts';
const controls=[['length','Hair length',.7,1.3],['width','Hair width',.85,1.15],['volume','Volume',.7,1.3],['hairline','Hairline',-.1,.1],['density','Coil detail density',0,1],['braidThickness','Braid thickness',.75,1.25],['parting','Parting',-.3,.3],['highlight','Highlight intensity',0,.45]] as const;
export function LayeredHairControls({character,change}:{character:Character;change:(value:HairDesign|undefined)=>void}){
  const [view,setView]=useState<View>('three-quarter'),[mirror,setMirror]=useState(false),[offset,setOffset]=useState(0);
  const design=character.hairDesign??hairDesignDefaults,available=(layeredHairStyles as readonly string[]).includes(character.hair);
  const model=available?buildLayeredHair({...character,hairDesign:design},viewArt[view]):undefined;
  function patch(value:Partial<HairDesign>){change({...design,...value});}
  function sample(moved:boolean){return <svg role="img" aria-label={moved?'Manual hair deformation':'Hair rest shape'} viewBox="-100 -135 200 260" style={{width:'100%',maxHeight:180}}><g transform={mirror?'scale(-1 1)':undefined}>
    {model&&hairRenderPaths(model,'background',moved?[offset,0]:[0,0]).map(({id,...item})=><path key={id} {...item} strokeLinecap="round" strokeLinejoin="round"/>)}
    <path d={headOutline(character,viewArt[view])} fill={character.skin} stroke="#302435" strokeWidth="2"/>
    {model&&hairRenderPaths(model,'foreground',moved?[offset,0]:[0,0]).map(({id,...item})=><path key={id} {...item} strokeLinecap="round" strokeLinejoin="round"/>)}
  </g></svg>;}
  return <details className="factory-details"><summary>Layered hair · vector v1</summary>
    <p className="small-text">Optional native hair artwork. Imported hair and closed hats take precedence. Manual deformation is an audition only.</p>
    {!available?<p className="small-text">This style uses the original library. Select a supported style: {layeredHairStyles.join(', ')}.</p>:<>
      <label className="check"><input type="checkbox" checked={Boolean(character.hairDesign)||['short-afro','cornrows','box-braids'].includes(character.hair)} disabled={['short-afro','cornrows','box-braids'].includes(character.hair)} onChange={e=>change(e.target.checked?structuredClone(design):undefined)}/> Use layered hair</label>
      {controls.map(([key,label,min,max])=><label className="field slider" key={key}>{label}<input aria-label={label} type="range" min={min} max={max} step={.01} value={design[key]} onChange={e=>patch({[key]:Number(e.target.value)})}/></label>)}
      {(['stiffness','damping','wind','maxDisplacement'] as const).map(key=><label className="field slider" key={key}>{key}<input aria-label={'Hair '+key} type="range" min={0} max={{stiffness:256,damping:32,wind:1,maxDisplacement:12}[key]} step={key==='wind'?.05:1} value={design.material[key]} onChange={e=>patch({material:{...design.material,[key]:Number(e.target.value)}})}/></label>)}
      <label className="field">Hair audition view<select aria-label="Hair audition view" value={view} onChange={e=>setView(e.target.value as View)}>{views.map(v=><option key={v}>{v}</option>)}</select></label>
      <label className="check"><input type="checkbox" checked={mirror} onChange={e=>setMirror(e.target.checked)}/> Mirror audition</label>
      <label className="field slider">Manual deformation<input aria-label="Manual hair deformation" type="range" min={-12} max={12} step={1} value={offset} onChange={e=>setOffset(Number(e.target.value))}/></label>
      <div className="field-row"><div style={{flex:1}}>Rest{sample(false)}</div><div style={{flex:1}}>Deformed{sample(true)}</div></div>
      <p className="small-text">{model?.groups.length??0} sparse motion groups. No simulation state saved.</p>
    </>}
  </details>;
}
