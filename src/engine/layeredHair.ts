import {headMetrics} from './faceIdentityGeometry.ts';
import {hairDesignDefaults,type HairDesign} from './hairDesignSchema.ts';
import {VectorArtworkV1,deformRegion,svgPath,type VectorArtwork,type VectorCommand,type VectorRegion} from './vectorArtwork.ts';
import type {Character} from './schema.ts';
import type {IllustratedView} from './illustration.ts';
export const layeredHairStyles=['bald','fade','buzz','short-afro','afro','curls','puff','cornrows','braids','box-braids','locs'] as const;
type Style=typeof layeredHairStyles[number];
const newStyles=new Set(['short-afro','cornrows','box-braids']);
export function hasLayeredHair(c:Character){return (c.hairDesign!==undefined||newStyles.has(c.hair))&&(layeredHairStyles as readonly string[]).includes(c.hair);}
type P=[number,number];
type Chain={id:string;mode:'chain'|'cage';points:P[];pins:number[];wind:number;materialId:string;maxDisplacement:number;collisionProxyIds:string[]};
export type HairModel={artwork:VectorArtwork;groups:Chain[];background:string[];foreground:string[]};
const cache=new Map<string,HairModel>();
const restPaths=new WeakMap<HairModel,Partial<Record<'background'|'foreground',ReturnType<typeof compileHairPaths>>>>();
const round=(n:number)=>Math.round(n*100)/100;
const shade=(hex:string,amount:number)=>'#'+[1,3,5].map(i=>Math.round(parseInt(hex.slice(i,i+2),16)*(1-Math.abs(amount))+(amount<0?0:255)*Math.abs(amount)).toString(16).padStart(2,'0')).join('');
const M=(x:number,y:number):VectorCommand=>['M',round(x),round(y)];
const L=(x:number,y:number):VectorCommand=>['L',round(x),round(y)];
const Q=(x:number,y:number,a:number,b:number):VectorCommand=>['Q',round(x),round(y),round(a),round(b)];
const C=(x:number,y:number,a:number,b:number,c:number,d:number):VectorCommand=>['C',round(x),round(y),round(a),round(b),round(c),round(d)];
const Z:VectorCommand=['Z'];
const paint=(key:string)=>({kind:'palette' as const,key});
const count=(cs:VectorCommand[])=>cs.reduce((n,c)=>n+(c.length-1)/2,0);
function freeze<T>(value:T):T{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
export function layeredHairCacheSize(){return cache.size;}
export function clearLayeredHairCache(){cache.clear();}
export function buildLayeredHair(c:Character,view:IllustratedView):HairModel|undefined{
  if(!hasLayeredHair(c)||c.hair==='bald')return;
  const style=c.hair as Style,d=c.hairDesign??hairDesignDefaults;
  const {w,h,crown}=headMetrics(c,view),top=-h*(c.wardrobe?.forehead??1);
  const key=JSON.stringify([style,round(w),round(h),round(crown),round(top),view.width,view.face,view.rear,view.profile,c.hairColor,c.skin,c.wardrobe?.accessoryColor??c.shirt,d]);
  const hit=cache.get(key);if(hit)return hit;
  const regions:VectorRegion[]=[],groups:Chain[]=[],background:string[]=[],foreground:string[]=[];
  const anchors:VectorArtwork['anchors']=[{id:'crown',point:[0,round(top)]}];
  const long=['braids','box-braids','locs'].includes(style),coiled=['afro','short-afro','curls'].includes(style),puff=style==='puff';
  const materialId=long?'locks':'volume';
  const limit=long?Math.min(10,d.material.maxDisplacement):coiled||puff?Math.min(3,d.material.maxDisplacement):0;
  const materials:VectorArtwork['materials']=[{id:materialId,stiffness:d.material.stiffness,damping:d.material.damping}];
  const collisionProxies:VectorArtwork['collisionProxies']=[{id:'head',center:[0,-h*.15],radius:Math.max(w,h)*.76},{id:'shoulder-left',center:[-w*.63,h+14],radius:w*.36},{id:'shoulder-right',center:[w*.63,h+14],radius:w*.36}];
  function add(id:string,layer:number,commands:VectorCommand[],fill:string|undefined,stroke?:string,sw=1,group?:Chain,weights?:{pin:number;influence:number}[]){
    const region:VectorRegion={id,layer,commands,fillRule:'nonzero',...(fill?{fill:paint(fill)}:{}),...(stroke?{stroke:{paint:paint(stroke),width:sw}}:{}),...(group?{material:{materialId,controlGroup:group.id,collisionProxyId:'head',maxDisplacement:group.maxDisplacement,weights:weights??Array.from({length:count(commands)},()=>({pin:1,influence:0}))}}:{})};
    regions.push(region);(layer<0?background:foreground).push(id);
  }
  function group(id:string,mode:Chain['mode'],points:P[],pins:number[]){
    const value:Chain={id,mode,points,pins,wind:limit?d.material.wind:0,materialId,maxDisplacement:limit,collisionProxyIds:collisionProxies.map(p=>p.id)};
    groups.push(value);anchors.push({id:id+'-root',point:points[0]});return value;
  }
  const shift=view.profile?-w*.11:view.face*w/180;
  const edge=Math.max(w+1,crown*.96),hairline=top*.55+d.hairline*h;
  const extra=coiled?(style==='short-afro'?7:style==='curls'?15:23)*d.volume*d.length:style==='fade'?3:style==='buzz'?1.8:3;
  const outer=edge+(coiled?extra*.58*d.width:Math.max(0,d.width-1)*3);
  const crownY=top-extra;
  const scalp:VectorCommand[]=[M(-outer+shift,-9),C(-outer-3+shift,top*.62,-crown*.75+shift,crownY-3,shift,crownY),C(crown*.78+shift,crownY-3,outer+2+shift,top*.67,outer+shift,-9)];
  const cap:VectorCommand[]=[...scalp,...(view.rear?[Q(outer+shift,h*.53,shift,h*.62),Q(-outer+shift,h*.53,-outer+shift,-9)]:[Q(edge*.87+shift,hairline*.65,edge*.68+shift,hairline),Q(shift+d.parting*w,hairline-5,-edge*.65+shift,hairline),Q(-edge*.84+shift,hairline*.7,-outer+shift,-9)]),Z];
  if(long){
    const n=style==='box-braids'?6:4;
    for(let i=0;i<n;i++){
      const side=i<n/2?-1:1,j=i%(n/2),far=view.profile&&side===1;
      if(far)continue;
      // One sparse chain per grouped lock, kept outside visible cheek/ear.
      const x=side*(edge*.82+j*3)+shift,root:P=[round(x),round(top*.72+j*3)],mid:P=[round(side*(edge+5+j*4)+shift),round(h*.38)],tip:P=[round(side*(edge+7+j*5)+shift),round(h+(24+j*7)*d.length)];
      const id='lock-'+i,g=group(id,'chain',[root,mid,tip],[1,.35,0]);
      const sw=(style==='locs'?8:style==='box-braids'?5.8:6.6)*d.braidThickness;
      const layer=view.rear?-3:side<0?-3:4;
      const points=[M(...root),Q(...mid,...tip)],weights=[{pin:1,influence:0},{pin:.35,influence:.6},{pin:0,influence:1}];
      add(id+'-edge',layer,points,undefined,'ink',sw+2,g,weights);
      add(id,layer+0,points,undefined,'base',sw,g,weights);
      // A restrained continuous highlight follows the same rest chain.
      add(id+'-light',layer,points,undefined,'highlight',Math.max(.7,sw*.19),g,weights);
      if(style!=='locs'){
        const bandY=tip[1]-5;
        add(id+'-band',layer,[M(tip[0]-sw*.32,bandY),L(tip[0]+sw*.32,bandY+1.5)],undefined,'accessory',1.2,g,[{pin:0,influence:1},{pin:0,influence:1}]);
      }
    }
  }
  let capGroup:Chain|undefined,capWeights:{pin:number;influence:number}[]|undefined;
  if(coiled){
    capGroup=group('crown-volume','cage',[[0,round(hairline)],[round(-outer*.6),round(crownY)],[round(outer*.6),round(crownY)]],[1,0,0]);
    capWeights=cap.flatMap(cmd=>{const out:{pin:number;influence:number}[]=[];for(let i=1;i<cmd.length;i+=2){const y=Number(cmd[i+1]),v=Math.max(0,Math.min(1,(hairline-y)/Math.max(1,hairline-crownY)));out.push({pin:1-v,influence:v});}return out;});
  }
  add('cap',0,cap,'base','ink',style==='buzz'?1.35:2,capGroup,capWeights);
  if(style==='fade'||style==='buzz'){
    for(const side of view.profile?[-1]:[-1,1]){
      add('temple-'+(side<0?'l':'r'),1,[M(side*edge+shift,-9),Q(side*(edge-3)+shift,hairline*.82,side*edge*.67+shift,hairline),Q(side*edge*.79+shift,-12,side*edge+shift,-9),Z],style==='fade'?'fade':'shadow');
    }
  }
  if(puff){
    const x=shift-w*.25+d.parting*w,y=top-24*d.volume,rx=(18+7*d.volume)*d.width,ry=23*d.length*d.volume;
    const g=group('puff-volume','cage',[[round(x),round(top-4)],[round(x-rx*.5),round(y-ry)],[round(x+rx*.5),round(y-ry)]],[1,0,0]);
    const outline:VectorCommand[]=[M(x-rx,y+ry*.4),C(x-rx*1.25,y-ry*.15,x-rx*.8,y-ry,x,y-ry),C(x+rx*.9,y-ry*1.13,x+rx*1.25,y-ry*.12,x+rx,y+ry*.4),Q(x,y+ry*.95,x-rx,y+ry*.4),Z];
    const weights=outline.flatMap(cmd=>{const out:{pin:number;influence:number}[]=[];for(let i=1;i<cmd.length;i+=2){const v=Math.max(0,Math.min(1,(top-Number(cmd[i+1]))/Math.max(1,ry+20)));out.push({pin:1-v,influence:v});}return out;});
    add('puff',2,outline,'base','ink',2.1,g,weights);
    add('tie',3,[M(x-rx*.45,top-5),Q(x,top+1,x+rx*.45,top-5)],undefined,'accessory',3);
  }
  if(style==='cornrows'||long){
    const rows=style==='cornrows'?6:3;
    for(let i=0;i<rows;i++){
      const x=(i-(rows-1)/2)*edge/(rows*.65)+shift;
      add('part-'+i,1,[M(shift+d.parting*w,crownY+4),Q(x,crownY+8,x,hairline-(view.rear?-25:2))],undefined,'shadow',style==='cornrows'?2.9:1.35);
    }
  }else if(coiled||puff||style==='buzz'||style==='fade'){
    const n=Math.round(3+d.density*5);
    for(let i=0;i<n;i++){
      const u=(i+.5)/n,x=shift+(u-.5)*edge*1.4,y=crownY+8+Math.abs(u-.5)*17;
      const commands=[M(x-3,y+3),Q(x,y-3,x+4,y+2)];
      const weights=commands.flatMap(cmd=>{const out:{pin:number;influence:number}[]=[];for(let j=1;j<cmd.length;j+=2){const v=Math.max(0,Math.min(1,(hairline-Number(cmd[j+1]))/Math.max(1,hairline-crownY)));out.push({pin:1-v,influence:v});}return out;});
      add('texture-'+i,2,commands,undefined,'highlight',coiled?1.6:1.05,capGroup,capGroup?weights:undefined);
    }
  }
  // Maximum 24 canonical regions: box braids use six sparse groups, so
  // reserve four regions per group only when the total remains within budget.
  // Remove decorative bands first, then reduce optional scalp rows.
  while(regions.length>24){
    const i=regions.findIndex(v=>v.id.endsWith('-band')||v.id.startsWith('part-'));
    if(i<0)throw Error('Hair region budget exceeded');
    const [removed]=regions.splice(i,1),ids=removed.layer<0?background:foreground;ids.splice(ids.indexOf(removed.id),1);
  }
  const artwork=VectorArtworkV1.parse({version:1,units:'rig',bounds:[-240,-240,240,240],pivot:[0,0],anchors,palette:{base:c.hairColor,ink:shade(c.hairColor,-.55),shadow:shade(c.hairColor,-.24),highlight:shade(c.hairColor,d.highlight),fade:shade(c.skin,-.29),accessory:c.wardrobe?.accessoryColor??c.shirt},materials,controlGroups:groups.map(g=>g.id),collisionProxies,regions,poses:[],compatibility:{rig:'sirvibe-native-v1',mirrorSafe:true}});
  const model=freeze({artwork,groups,background,foreground});
  if(cache.size>=48)cache.delete(cache.keys().next().value!);cache.set(key,model);return model;
}
function compileHairPaths(model:HairModel,layer:'background'|'foreground',offset:readonly [number,number]){
  const ids=layer==='background'?model.background:model.foreground;
  const color=(p:VectorRegion['fill'])=>p?.kind==='palette'?model.artwork.palette[p.key]:p?.kind==='solid'?p.color:'none';
  return model.artwork.regions.filter(r=>ids.includes(r.id)).sort((a,b)=>a.layer-b.layer).map(r=>({id:r.id,d:svgPath(offset[0]||offset[1]?deformRegion(r,offset):r.commands),fill:color(r.fill),stroke:color(r.stroke?.paint),strokeWidth:r.stroke?.width??0}));
}

export function hairRenderPaths(model:HairModel,layer:'background'|'foreground',offset:readonly [number,number]=[0,0]){
  if(offset[0]||offset[1])return compileHairPaths(model,layer,offset);
  let entry=restPaths.get(model);if(!entry){entry={};restPaths.set(model,entry);}
  return entry[layer]??(entry[layer]=freeze(compileHairPaths(model,layer,offset)));
}
