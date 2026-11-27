import type {PrimaryArtworkPose} from './primaryArtworkPose.ts';
/** Native, reusable limb contours in bone-local units. X is the solved
 * bone length; Y is the independent anatomical width. No pose mutation. */
export type LimbRegion = 'upper-arm'|'forearm'|'thigh'|'calf';
export type VectorPoint = {x:number;y:number};
export type LimbArtwork = Readonly<{outline:string;shadow:string;highlight:string}>;
/** Authored curves: each region has a distinct muscle mass and joint taper.
 * Shadow and highlight are inset closed paths, not strokes along the bone. */
export const limbArtwork = {
  'upper-arm': {
    outline:'M-.10 0 Q-.10 -.40 .04 -.48 C.23 -.60 .43 -.53 .62 -.40 Q.83 -.32 1.03 -.32 Q1.12 -.25 1.12 0 Q1.12 .26 1.01 .32 C.74 .30 .52 .49 .30 .48 Q.03 .51 -.07 .30 Q-.12 .14 -.10 0Z',
    shadow:'M.00 .18 C.25 .35 .43 .34 .64 .24 Q.85 .19 1.06 .13 Q1.09 .25 1.00 .29 C.72 .29 .52 .46 .30 .45 Q.08 .48 .00 .31Z',
    highlight:'M.07 -.39 C.26 -.52 .44 -.46 .61 -.35 C.39 -.36 .26 -.31 .10 -.26Z'},
  forearm:{
    outline:'M-.10 0 Q-.10 -.31 .04 -.36 C.22 -.53 .43 -.43 .60 -.32 Q.80 -.22 1.05 -.23 Q1.12 -.18 1.12 0 Q1.12 .20 1.04 .23 Q.78 .23 .60 .34 C.37 .46 .18 .42 .02 .34 Q-.10 .27 -.10 0Z',
    shadow:'M.02 .16 C.22 .27 .42 .31 .62 .22 Q.83 .15 1.06 .10 L1.03 .20 Q.76 .20 .59 .31 C.35 .43 .16 .37 .02 .30Z',
    highlight:'M.08 -.29 C.25 -.43 .43 -.34 .59 -.25 Q.33 -.25 .10 -.18Z'},
  thigh:{
    outline:'M-.10 0 Q-.10 -.48 .04 -.53 C.27 -.64 .52 -.53 .72 -.41 Q.87 -.34 1.03 -.34 Q1.12 -.27 1.12 0 Q1.12 .30 1.02 .35 Q.77 .34 .56 .49 C.35 .58 .14 .57 -.01 .44 Q-.10 .32 -.10 0Z',
    shadow:'M.01 .20 C.24 .40 .43 .39 .61 .30 Q.84 .24 1.06 .15 Q1.08 .28 1.02 .32 Q.76 .31 .55 .46 C.34 .55 .13 .53 .02 .41Z',
    highlight:'M.06 -.44 C.28 -.56 .50 -.47 .69 -.35 C.45 -.39 .24 -.36 .09 -.28Z'},
  calf:{
    outline:'M-.10 0 Q-.10 -.30 .03 -.34 C.19 -.51 .38 -.58 .56 -.39 Q.74 -.23 1.04 -.21 Q1.12 -.14 1.12 0 Q1.12 .17 1.03 .21 Q.79 .22 .60 .38 C.39 .49 .18 .39 .02 .32 Q-.10 .26 -.10 0Z',
    shadow:'M.01 .15 C.23 .30 .43 .34 .61 .25 Q.81 .15 1.06 .09 L1.03 .18 Q.79 .19 .59 .35 C.38 .46 .18 .36 .02 .29Z',
    highlight:'M.12 -.29 C.27 -.49 .42 -.44 .55 -.32 C.36 -.34 .24 -.26 .13 -.19Z'}
} as const satisfies Record<LimbRegion,LimbArtwork>;

export function anatomicalBoneFrame(a:VectorPoint,b:VectorPoint,width:number){
  if(![a.x,a.y,b.x,b.y,width].every(Number.isFinite)||width<=0)return undefined;
  const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
  if(!Number.isFinite(length)||length<.01)return undefined;
  return {x:a.x,y:a.y,length,width,angle:Math.atan2(dy,dx)*180/Math.PI};
}
export function anatomicalSegments(joints:readonly VectorPoint[],width:number,first:LimbRegion,morphology?:LimbMorphology,primary?:PrimaryArtworkPose){
  const segments:{frame:NonNullable<ReturnType<typeof anatomicalBoneFrame>>;region:LimbRegion;art:LimbArtwork}[]=[];
  for(let i=1;i<joints.length;i++){
    const region=i===1?first:first==='upper-arm'?'forearm':first==='thigh'?'calf':first;
    const frame=anatomicalBoneFrame(joints[i-1],joints[i],width*(i===1?1:.83));
    if(frame)segments.push({frame,region,art:poseLimbArtwork(region,morphLimbArtwork(region,morphology),primary)});
  }
  return segments;
}

/** Optional identity controls alter only authored contour points, not solved joints.
 * Inputs are quantized to 0.05 for a bounded reusable path cache. The unchanged
 * identity takes the original Stage 0 strings by reference. */
export type LimbMorphology={wristWidth?:number;kneeWidth?:number;ankleWidth?:number;muscleDefinition?:number;softness?:number};
const morphologyCache=new Map<string,LimbArtwork>();
const quant=(v:number|undefined,fallback:number,min:number,max:number)=>Math.round(Math.min(max,Math.max(min,Number.isFinite(v)?v!:fallback))*20)/20;
export function morphLimbArtwork(region:LimbRegion,m?:LimbMorphology):LimbArtwork{
  const wrist=quant(m?.wristWidth,1,.85,1.15),knee=quant(m?.kneeWidth,1,.85,1.15),ankle=quant(m?.ankleWidth,1,.85,1.15);
  const muscle=quant(m?.muscleDefinition,.5,0,1),soft=quant(m?.softness,.5,0,1);
  const proximal=region==='calf'?knee:1,distal=region==='forearm'?wrist:region==='thigh'?knee:region==='calf'?ankle:1;
  if(proximal===1&&distal===1&&muscle===.5&&soft===.5)return limbArtwork[region];
  const key=[region,proximal,distal,muscle,soft].join('/');
  const hit=morphologyCache.get(key);if(hit)return hit;
  const shape=(source:string)=>{
    // Trusted built-in absolute M/L/Q/C/Z artwork only. Preserve command
    // topology and x coordinates; paired joint centers remain exactly y=0.
    const tokens=source.match(/[MLQCZ]|-?(?:\d+(?:\.\d*)?|\.\d+)/g)!;
    const output:string[]=[];
    for(let i=0;i<tokens.length;){
      const t=tokens[i++];output.push(t);
      if(t==='Z')continue;
      const count=t==='C'?3:t==='Q'?2:1;
      for(let j=0;j<count;j++){
        const x=Number(tokens[i++]),y=Number(tokens[i++]);
        const u=Math.min(1,Math.max(0,x));
        const belly=Math.sin(Math.PI*u)**2;
        const profile=1+(muscle-.5)*.24*belly+(soft-.5)*.20*Math.sin(Math.PI*u);
        const factor=(proximal*(1-u)+distal*u)*profile;
        output.push(String(x),String(Math.round(y*factor*10000)/10000));
      }
    }
    return output.join(' ');
  };
  const rest=limbArtwork[region];
  const art=Object.freeze({outline:shape(rest.outline),shadow:shape(rest.shadow),highlight:shape(rest.highlight)});
  morphologyCache.set(key,art);
  if(morphologyCache.size>64){const oldest=morphologyCache.keys().next().value;if(oldest!==undefined)morphologyCache.delete(oldest);}
  return art;
}

// Same topology, axial coordinates and centerline endpoints as the authored
// rest art. Weighted transverse compression affects only visual control points.
const posedCache=new Map<string,LimbArtwork>();
export function poseLimbArtwork(region:LimbRegion,rest:LimbArtwork,pose?:PrimaryArtworkPose):LimbArtwork{
 if(!pose||!pose.bend&&!pose.shortening)return rest;
 const bend=Math.round(Math.max(0,Math.min(1,pose.bend))*8)/8,short=Math.round(Math.max(0,Math.min(1,pose.shortening))*8)/8;
 const key=[region,bend,short,pose.inside,rest.outline,rest.shadow,rest.highlight].join('|');const hit=posedCache.get(key);if(hit)return hit;
 const proximal=region==='forearm'||region==='calf';
 function deform(source:string){const tokens=source.match(/[MLQCZ]|-?(?:\d+(?:\.\d*)?|\.\d+)/g)!,out:string[]=[];
 for(let i=0;i<tokens.length;){const t=tokens[i++];out.push(t);if(t==='Z')continue;const count=t==='C'?3:t==='Q'?2:1;
 for(let j=0;j<count;j++){const x=Number(tokens[i++]),y=Number(tokens[i++]),u=Math.max(0,Math.min(1,x));
 const joint=proximal?(1-u)**3:u**3,inner=Math.sign(y)===pose.inside*(proximal?-1:1),weight=Math.sin(Math.PI*u);
 // Keep seam tips intact, compress the inside and support the outer contour.
 const factor=1+(inner?-.16:.09)*bend*joint*weight+.10*short*weight;
 out.push(String(x),String(Math.round(y*factor*10000)/10000));}}
 return out.join(' ');}
 const value=Object.freeze({outline:deform(rest.outline),shadow:deform(rest.shadow),highlight:deform(rest.highlight)});if(posedCache.size>=96)posedCache.delete(posedCache.keys().next().value!);posedCache.set(key,value);return value;
}
export const primaryArtworkCacheSize=()=>posedCache.size;
