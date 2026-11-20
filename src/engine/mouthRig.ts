import type { Character, View } from './schema.ts';
import type { FacialPerformance } from './facialAnimation.ts';
import type { Viseme } from './visemes.ts';

export type MouthParameters = {
  jawOpening: number; mouthWidth: number; lipRounding: number; lipClosure: number;
  upperLip: number; lowerLip: number; teethVisibility: number; tongueVisibility: number;
  asymmetry: number;
};
export type MouthTooth = { id: string; index: number; x: number; y: number;
  width: number; height: number; fill: string; outline: string };
export type MouthGeometry = { parameters: MouthParameters; cavityPath: string;
  upperLipPath: string; lowerLipPath: string;
  rx: number; top: number; bottom: number; cornerLeft: number; cornerRight: number;
  teeth: MouthTooth[]; tongue: { x: number; y: number; rx: number; ry: number; visible: boolean };
  open: boolean; profileScale: number };

const cap = (n:number, low=0, high=1) => Math.max(low,Math.min(high,n));
const mix = (a:number,b:number,t:number) => a+(b-a)*t;
const fmt = (n:number) => Number(n.toFixed(3));
const shapes:Record<Viseme,MouthParameters> = {
  rest:   {jawOpening:0,mouthWidth:.88,lipRounding:0,lipClosure:1,upperLip:.2,lowerLip:.1,teethVisibility:0,tongueVisibility:0,asymmetry:0},
  closed: {jawOpening:0,mouthWidth:.91,lipRounding:0,lipClosure:1,upperLip:0,lowerLip:0,teethVisibility:0,tongueVisibility:0,asymmetry:0},
  bite:   {jawOpening:.33,mouthWidth:1.02,lipRounding:.08,lipClosure:0,upperLip:-.18,lowerLip:.2,teethVisibility:1,tongueVisibility:0,asymmetry:0},
  wide:   {jawOpening:.53,mouthWidth:1.32,lipRounding:0,lipClosure:0,upperLip:.10,lowerLip:.12,teethVisibility:1,tongueVisibility:.12,asymmetry:0},
  open:   {jawOpening:.91,mouthWidth:1.03,lipRounding:.15,lipClosure:0,upperLip:.2,lowerLip:.25,teethVisibility:.66,tongueVisibility:.32,asymmetry:0},
  round:  {jawOpening:.90,mouthWidth:.72,lipRounding:.82,lipClosure:0,upperLip:.16,lowerLip:.19,teethVisibility:.16,tongueVisibility:0,asymmetry:0},
  pucker: {jawOpening:.46,mouthWidth:.49,lipRounding:1,lipClosure:0,upperLip:.3,lowerLip:.26,teethVisibility:0,tongueVisibility:0,asymmetry:0},
  tongue: {jawOpening:.67,mouthWidth:1.06,lipRounding:.12,lipClosure:0,upperLip:.04,lowerLip:.24,teethVisibility:.32,tongueVisibility:1,asymmetry:0}
};
export function blendMouthParameters(a:MouthParameters,b:MouthParameters,t:number):MouthParameters {
  const ratio=cap(t),out={...a};
  for(const name of Object.keys(out) as (keyof MouthParameters)[])out[name]=mix(a[name],b[name],ratio);
  return out;
}
/** Pure viseme-to-control mapping, shared by native SVG and GPU vector drawing. */
export function mouthParameters(character:Character,mood:FacialPerformance):MouthParameters {
  let target:Viseme = mood.viseme;
  if(!mood.speaking) {
    target = mood.expression==='surprised'?'round':
      mood.expression==='happy'||mood.expression==='excited'?'wide':
      mood.expression==='thinking'?'pucker':'rest';
  }
  const base=shapes[target];
  const from=shapes[mood.mouthFrom??target];
  let p=blendMouthParameters(from,base,target==='closed'||target==='rest'?1:mood.mouthBlend??1);
  const size=character.mouthRig;
  const strength=cap(mood.mouthOpen);
  if(mood.speaking) {
    // Closed consonants and silence MUST win over expression and envelope.
    if(target==='closed'||target==='rest')p={...shapes[target]};
    else p.jawOpening*=.64+.36*strength;
  }else if(target==='wide') {
    p.jawOpening*=mood.expression==='excited'?1.35:.92;
    p.mouthWidth*=1.05;
  }else if(target==='round')p.jawOpening=1;
  if(!mood.speaking&&mood.expression==='smug')p.asymmetry=.75;
  if(!mood.speaking&&mood.expression==='confused')p.asymmetry=-.55;
  if(mood.speaking&&mood.expression==='nervous')p.asymmetry+=.12;
  p.mouthWidth*=size?.width??1;
  p.jawOpening*=size?.jawScale??1;
  p.lipRounding=cap(p.lipRounding+((size?.roundness??.5)-.5)*.25);
  p.asymmetry=cap(p.asymmetry+(size?.asymmetry??0),-1,1);
  p.jawOpening=cap(p.jawOpening);p.lipClosure=cap(p.lipClosure);
  return p;
}
export function mouthGeometry(character:Character,mood:FacialPerformance,view:View):MouthGeometry {
  const parameters=mouthParameters(character,mood);
  const profileScale=view==='side'?.75:view==='three-quarter'?.9:1;
  const width=character.mouth==='full'?12:character.mouth==='line'?9:11;
  const rx=width*parameters.mouthWidth*(1-.22*parameters.lipRounding);
  const opening=parameters.jawOpening*(1-parameters.lipClosure);
  const height=opening*(character.mouth==='full'?12.6:11.3);
  const top=-height*(.73+parameters.upperLip*.15);
  const bottom=height*(.88+parameters.lowerLip*.18);
  const cornerLeft=parameters.asymmetry*1.9,cornerRight=-parameters.asymmetry*1.9;
  const upperLipPath=`M ${fmt(-rx)} ${fmt(cornerLeft)} Q ${fmt(-rx*.4)} ${fmt(top-1.2)} 0 ${fmt(top-1.45)}
    Q ${fmt(rx*.4)} ${fmt(top-1.05)} ${fmt(rx)} ${fmt(cornerRight)}`;
  const lowerLipPath=`M ${fmt(-rx)} ${fmt(cornerLeft)} Q ${fmt(-rx*.35)} ${fmt(bottom+.65)} 0 ${fmt(bottom+1.15)}
    Q ${fmt(rx*.35)} ${fmt(bottom+.65)} ${fmt(rx)} ${fmt(cornerRight)}`;
  // Cubic path uses the exact points also used by Pixi's Graphics mask.
  const cavityPath=`M ${fmt(-rx)} ${fmt(cornerLeft)}
    C ${fmt(-rx*.76)} ${fmt(top*.9)} ${fmt(-rx*.36)} ${fmt(top)} 0 ${fmt(top)}
    C ${fmt(rx*.36)} ${fmt(top)} ${fmt(rx*.76)} ${fmt(top*.9)} ${fmt(rx)} ${fmt(cornerRight)}
    C ${fmt(rx*.75)} ${fmt(bottom*.9)} ${fmt(rx*.36)} ${fmt(bottom)} 0 ${fmt(bottom)}
    C ${fmt(-rx*.36)} ${fmt(bottom)} ${fmt(-rx*.75)} ${fmt(bottom*.9)} ${fmt(-rx)} ${fmt(cornerLeft)} Z`;
  const open=height>.2;
  const span=rx*1.55,step=span/6;
  const teeth=Array.from({length:6},(_,index):MouthTooth=>{
    const custom=character.toothColors?.[index],gold=character.goldTeeth?.includes(index);
    return {id:`tooth-${index}`,index,x:-span/2+index*step+.3,
      y:top+.6,width:Math.max(1,step-.65),height:Math.max(0,(bottom-top)*.55*parameters.teethVisibility),
      fill:custom??(gold?'#eac05c':'#fff4de'),outline:gold?'#a77e34':'#e1d4c9'};
  }).filter(tooth=>!character.missingTeeth?.includes(tooth.index));
  return {parameters,cavityPath,upperLipPath,lowerLipPath,rx,top,bottom,
    cornerLeft,cornerRight,teeth,
    tongue:{x:0,y:bottom*.58,rx:rx*.45,ry:Math.max(0,(bottom-top)*.18*parameters.tongueVisibility),
      visible:open&&parameters.tongueVisibility>.05},
    open,profileScale};
}
