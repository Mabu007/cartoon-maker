import {GarmentControls} from './GarmentControls.tsx';
import {LayeredHairControls} from './LayeredHairControls.tsx';
import {buildLayeredHair,hairRenderPaths} from '../engine/layeredHair.ts';
import {hairDesignDefaults} from '../engine/hairDesignSchema.ts';
import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { characterStyles, garmentDefaults, styleNames, wardrobeStyles } from '../engine/characterCatalog.ts';
import { extraPaths, eyewearPaths, hairPaths, hatPaths, headOutline } from '../engine/headCatalogArt.ts';
import { bagPaths, handheldPaths, shoePaths, topShapes } from '../engine/wardrobeArt.ts';
import { label, type Character } from '../engine/schema.ts';
import { prepareArtwork } from '../services/artwork.ts';

type Closet = NonNullable<Character['wardrobe']>;
type Core = keyof typeof characterStyles;
type Addon = keyof typeof wardrobeStyles | 'piercingSide' | 'hand' | 'watchSide';
type Section = 'Hair' | 'Face' | 'Outfit' | 'Accessories';
const coreGroups = {
  Hair: ['hair','beard','hat'],
  Face: ['shape','eyes','brows','ears','nose','mouth'],
  Outfit: ['outfit'],
  Accessories: []
} satisfies Record<Section,Core[]>;
const addonGroups = {
  Hair: ['hatWear','mustache','chinHair','jawHair'], Face: ['pupil','toothStyle'],
  Outfit: ['bottoms','footwear','pattern','sleeve','neckline','closure'],
  Accessories: ['eyewear','piercing','extra','watch','bag','handheld','hand','watchSide','piercingSide']
} satisfies Record<Section,Addon[]>;
const optionTitles: Partial<Record<Core|Addon,string>> = {
  shape:'Head shape', eyes:'Eye shape', hair:'Hairstyle', beard:'Facial hair', hat:'Hat',
  brows:'Eyebrows', outfit:'Top or dress', extra:'Head and neck accessories', pupil:'Pupil shape',
  chinHair:'Chin hair', jawHair:'Jaw and cheeks', toothStyle:'Mouth interior',
  handheld:'Handheld prop', hand:'Handheld side', watchSide:'Watch wrist', piercingSide:'Piercing side', hatWear:'Brim direction', closure:'Jacket closure'
};
const choiceNames: Partial<Record<Core|Addon,Record<string,string>>> = {
  eyes:{round:'Round / Doe',wide:'Wide / Bulging',relaxed:'Soft relaxed',bead:'Dot / Bead'},
  hair:{'side-part':'Side-parted quiff','top-knot':'Messy top knot',goatee:'Disconnected goatee'},
  hat:{'flat-cap':'Flat cap / Newsboy',ushanka:'Ushanka / Trapper',cloche:'Cloche hat',visor:'Sport visor'},
  beard:{full:'Lumberjack beard',stubble:'Five o’clock shadow',goatee:'Disconnected goatee',handlebar:'Handlebar mustache'},
  outfit:{'slip-dress':'Bodycon / Slip dress',blouse:'Blouse / Button-up'},
  footwear:{'high-top':'High-top sneakers',boot:'Combat boots',chelsea:'Chelsea boots',platform:'Platform boots'},
  ears:{wide:'Square / Jug',small:'Minimalist',round:'Rounded'},
  mouth:{line:'Neutral line',full:'Full lips',smile:'Wide grin',wavy:'Wavy'},
  bottoms:{straight:'Straight trousers',cargo:'Baggy cargo / Denim',shorts:'Athletic shorts','wide-leg':'Wide-leg trousers',skirt:'Pleated skirt'}
};
const formatStyle = (field:Core|Addon,value:string)=>choiceNames[field]?.[value]??styleNames[value]??label(value);

function glyph(field:Core|Addon,value:string,c:Character):ReactNode {
  if(value==='none'||value==='auto')return null;
  const paths:Partial<Record<Core|Addon,Record<string,string>>> = {hair:hairPaths,hat:hatPaths,eyewear:eyewearPaths,extra:extraPaths,footwear:shoePaths,bag:bagPaths,handheld:handheldPaths};
  if(field==='hair'){
    const model=buildLayeredHair({...c,hair:value as Character['hair'],hairDesign:hairDesignDefaults},{width:1,face:0,far:true,rear:false,profile:false});
    if(model)return <svg viewBox="-85 -115 170 225" aria-hidden="true">{(['background','foreground'] as const).flatMap(layer=>hairRenderPaths(model,layer)).map(({id,...item})=><path key={id} {...item} strokeLinecap="round" strokeLinejoin="round"/>)}</svg>;
  }
  const d=paths[field]?.[value];
  const svg=(viewBox:string,d:string,fill:string)=> <svg viewBox={viewBox} aria-hidden="true"><path d={d} fill={fill} stroke="currentColor" strokeWidth={field==='shape'?4:2} strokeLinejoin="round"/></svg>;
  if(d) {
    if(field==='hair')return svg('-90 -110 180 200',d,c.hairColor);
    if(field==='hat')return svg('-74 -77 148 108',d,c.wardrobe?.accessoryColor??c.shirt);
    if(field==='eyewear')return svg('-19 -15 38 32',d,c.wardrobe?.lens??'#d8cfec');
    if(field==='extra')return null;
    const box=field==='handheld'?'-22 -35 44 70':field==='bag'?'-26 -28 52 49':'-19 -20 38 31';
    return svg(box,d,field==='footwear'?c.shoes:c.wardrobe?.accessoryColor??'#a996d1');
  }
  if(field==='shape')return svg('-60 -60 120 120',headOutline({...c,shape:value as Character['shape'],wardrobe:undefined},{width:1,face:0,far:true,rear:false,profile:false}),c.skin);
  if(field==='outfit'){
    if(value==='bikini')return svg('-32 -8 64 94','M-21 19Q-14 5 0 16Q14 5 21 19L19 28Q0 34 -19 28Z M-19 53Q0 60 19 53Q11 66 5 68H-5Q-11 66 -19 53Z',c.shirt);
    const [a,b,h]=topShapes[value as Character['outfit']];
    return svg('-32 -8 64 94',`M-9 -4L${-a} 7L${-a} 20L${-b} ${49+h}Q0 ${52+h} ${b} ${49+h}L${a} 20V7L9 -4Q0 4 -9 -4Z`,value==='shirtless'?c.skin:c.shirt);
  }
  return null;
}
function Cards({ title, choices, selected, choose, field, character, open, toggle }:{
  title:string; choices:readonly string[]; selected:string; choose:(value:string)=>void; field:Core|Addon;
  character:Character; open:boolean; toggle:()=>void
}) {
  return <div className="factory-choice-group">
    <button type="button" className="factory-choice-title" aria-expanded={open} onClick={toggle}>
      <strong>{title}</strong><span>{formatStyle(field,selected)}</span><ChevronDown size={14}/>
    </button>
    {open&&<div className="choice-pills factory-choice-cards" role="group" aria-label={title}>
      {choices.map(value=><button type="button" key={value} className={selected===value?'selected':''} aria-pressed={selected===value}
        onClick={()=>choose(value)}>{glyph(field,value,character)}<span>{formatStyle(field,value)}</span></button>)}
    </div>}
  </div>;
}

const controls = {
  Hair: [
    ['beardLength','Beard length',.7,1.55],['beardWidth','Beard width',.7,1.25],['beardFullness','Beard fullness',.5,1.5],['hatTilt','Hat tilt',-45,45]
  ],
  Face: [
    ['crownWidth','Crown width',.72,1.28],['cheekWidth','Cheekbone width',.72,1.28],['jawWidth','Jaw width',.72,1.28],
    ['chinWidth','Chin width',.6,1.4],['headStretch','Vertical stretch',.8,1.25],['facialOffset','Facial asymmetry',-4,4],
    ['forehead','Forehead height',.8,1.2],['jawAngle','Jaw angle',0,1],['eyeWidth','Eye width',.8,1.2],['eyeTilt','Eye tilt',-15,15],['eyeHeight','Eye height',-4,4],['irisSize','Iris size',.75,1.25],['lidCurvature','Eyelid curvature',.8,1.2],['lashes','Lashes',0,1],['browLength','Brow length',.8,1.2],['browAsymmetry','Brow asymmetry',-3,3],['freckles','Freckles',0,1],['wrinkles','Wrinkles',0,1],['makeup','Makeup',0,1],['cheekBlush','Cheek blush',0,1],['upperLipRatio','Upper lip',.65,1.35],['lowerLipRatio','Lower lip',.65,1.35],['cupidBow','Cupid’s bow',0,1],['mouthHeight','Mouth height',-3,3],
    ['pupilSize','Pupil size',.4,1.8],['ring','Iris ring darkness',0,1],['veins','Bloodshot veins',0,1],['eyelid','Upper lid drop',0,.8],['undereye','Under-eye shading',0,1],
    ['browInner','Inner brow tilt',-45,45],['browOuter','Outer brow tilt',-45,45],['browBend','Brow arch',-1,1],
    ['browThickness','Brow thickness',.5,2],['browSpacing','Brow spacing',-4,4],['browOffset','Brow height',-6,6],
    ['earScale','Ear length',.6,1.5],['earTilt','Ear protrusion',0,60],['earTip','Ear tip sharpness',0,1],['earlobe','Earlobe size',.5,1.5],
    ['noseLength','Bridge length',.6,1.6],['noseWidth','Bridge width',.65,1.5],['noseTilt','Nose tip tilt',-30,30],
    ['noseFlare','Nostril flare',0,1],['noseBlush','Nose blush',0,1],['mouthCurve','Mouth corner curve',-1,1],
    ['restJaw','Resting jaw opening',0,1],['lipThickness','Lip thickness',.5,2]
  ],
  Outfit: [
    ['waist','Waist width',.65,1.5],['hem','Hem length',-1,1],['heelHeight','Heel height',.4,1.8],
    ['patternScale','Pattern scale',.25,4],['patternRotation','Pattern rotation',-180,180],['patternOpacity','Pattern opacity',0,1],
    ['logoScale','Logo size',.4,2]
  ],
  Accessories: [['lensOpacity','Lens opacity',0,1],['rim','Frame thickness',.5,4],['piercingSize','Piercing size',.5,1.8],['propTilt','Handheld angle',-90,90]]
} as const;
const colors = {
  Hair:[['hairColor','Hair color']],
  Face:[['iris','Iris'],['sclera','Eye white'],['lipColor','Lips']],
  Outfit:[['shirt','Top'],['pants','Bottoms'],['shoes','Shoe upper'],['trim','Trim'],['sole','Sole'],['laces','Laces']],
  Accessories:[['frame','Frame'],['lens','Lens'],['metal','Metal'],['accessoryColor','Accessory color']]
} as const;
const toggles = {
  Hair:[],
  Face:[['unibrow','Join brows']],
  Outfit:[['tucked','Tuck top in'],['socks','Socks with slides'],['hood','Hood']],
  Accessories:[['glint','Lens reflections']]
} as const;

export function CharacterChoices({ section, character, change, changeCloset }:{
  section:Section; character:Character; change:<K extends keyof Character>(key:K,value:Character[K])=>void;
  changeCloset:<K extends keyof Closet>(key:K,value:Closet[K])=>void
}) {
  const [expanded,setExpanded]=useState<string>(coreGroups[section][0]??addonGroups[section][0]);
  const [error,setError]=useState('');
  const [uploading,setUploading]=useState('');
  const q=character.wardrobe;
  const defaults:Partial<Record<Addon,string>>={
    bottoms:character.outfit==='athleisure'?'leggings':'straight',footwear:'classic',pattern:'solid',pupil:'round',hand:'right',piercingSide:'left',
    toothStyle:'standard',sleeve:'auto',neckline:'auto',closure:'auto',hatWear:'forward',watchSide:q?.hand??'right',mustache:'auto',chinHair:'auto',jawHair:'auto',
    eyewear:character.glasses?'wayfarer':'none',piercing:character.earrings?'huggie':'none',extra:character.accessory
  };
  const toggle=(key:string)=>setExpanded(prev=>prev===key?'':key);
  async function upload(file:File,field:'patternImage'|'logoImage'|'bagLogo'|'shoeLogo'){
    setError('');setUploading(field);
    try {changeCloset(field,(await prepareArtwork(file,'prop')).data);}
    catch(cause){setError(cause instanceof Error?cause.message:'This image could not be opened.');}
    finally {setUploading('');}
  }
  return <>
    {coreGroups[section].map(key=><Cards key={key} field={key} character={character} title={optionTitles[key]??label(key)}
      choices={characterStyles[key]} selected={character[key]} choose={v=>change(key,v as Character[typeof key])}
      open={expanded===key} toggle={()=>toggle(key)}/>)}
    {addonGroups[section].map(key=>{
      const choices=key==='piercingSide'||key==='watchSide'?wardrobeStyles.side:key==='hand'?['left','right']:wardrobeStyles[key];
      const field=key as Exclude<Addon,'side'>;
      return <Cards key={key} field={key} character={character} title={optionTitles[key]??label(key)}
        choices={choices} selected={String(q?.[field]??defaults[key]??'none')}
        choose={v=>changeCloset(field,v as Closet[typeof field])} open={expanded===key} toggle={()=>toggle(key)}/>;
    })}
    <div className="color-row factory-custom-colors">{colors[section].map(([key,title])=>{
      const base=key==='shirt'||key==='pants'||key==='hairColor'||key==='shoes';
      return <label key={key}>{title}<input type="color" aria-label={title} value={base?character[key]:q?.[key]??garmentDefaults[key]}
        onChange={e=>base?change(key,e.target.value):changeCloset(key,e.target.value)}/></label>;
    })}</div>
    {section==='Outfit'&&<div className="factory-textiles">
      {([['patternImage','Seamless pattern'],['logoImage','Chest logo'],['shoeLogo','Shoe logo'],['bagLogo','Bag logo']] as const).map(([key,title])=>
        <label className="factory-image-input" key={key}>
          {q?.[key]&&<img src={q[key]} alt=""/>}
          <span>{uploading===key?'Importing…':title}</span>
          <input type="file" disabled={Boolean(uploading)} aria-label={'Upload '+title.toLowerCase()} accept="image/png,image/svg+xml,image/jpeg,image/webp"
            onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';if(file)void upload(file,key);}}/>
          {q?.[key]&&<button type="button" className="quiet" onClick={()=>changeCloset(key,undefined)}>Remove</button>}
        </label>)}
      {error&&<p role="alert">{error}</p>}
    </div>}
    {section==='Outfit'&&<GarmentControls character={character} change={value=>change('garmentDesign',value)}/>}
    {section==='Hair'&&<LayeredHairControls character={character} change={value=>change('hairDesign',value)}/>}
    <details className="factory-details">
      <summary>{section==='Outfit'?'Fit and artwork controls':section==='Hair'?'Hair and hat controls':section==='Face'?'Facial controls':'Accessory controls'}</summary>
      {controls[section].map(([key,title,min,max])=><label key={key} className="field slider">
        <span>{title} <small>{(q?.[key]??garmentDefaults[key]).toFixed(max>10?0:2)}</small></span>
        <input type="range" aria-label={title} min={min} max={max} step={max>10?1:.01} value={q?.[key]??garmentDefaults[key]}
          onChange={e=>changeCloset(key,Number(e.target.value))}/>
      </label>)}
      {toggles[section].map(([key,title])=><label className="check" key={key}>
        <input type="checkbox" checked={q?.[key]??garmentDefaults[key]} onChange={e=>changeCloset(key,e.target.checked)}/> {title}
      </label>)}
    </details>
  </>;
}
