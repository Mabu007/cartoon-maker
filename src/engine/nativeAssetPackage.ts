/** Restricted, self-contained JSON package. No ZIP, SVG, resource loading or code execution. */
import {z} from 'zod';
import {NativeVectorComponent,CharacterVisual,assetViews,type NativeVectorComponentData} from './visualAssets.ts';
import {CharacterDefinition,type Character} from './schema.ts';
import {vectorDrawList} from './vectorArtwork.ts';
const id=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/),revision=z.number().int().min(1).max(1_000_000);
export const nativePackageLimits={bytes:2_000_000,depth:32,tokens:180_000,packs:12,components:24,commands:8192,points:16384,nodes:96,constraints:128,iterations:4} as const;
export const NativeReference=z.strictObject({id,revision});
const manifest=z.strictObject({format:z.literal('sirvibe-native-vector'),version:z.literal(1),id,revision,name:z.string().trim().min(1).max(60),category:z.enum(['hair','clothing','accessory','character']),style:z.enum(['classic','illustrated']),rig:z.literal('sirvibe-native-v1'),coordinates:z.literal('local-x-right-y-down'),license:z.string().trim().min(1).max(500),provenance:z.string().trim().min(1).max(500),dependencies:z.array(NativeReference).max(12),coverage:z.array(z.enum(assetViews)).min(1).max(5),components:z.array(NativeVectorComponent).min(1).max(24)});
export type NativeAssetPack=z.infer<typeof manifest>;
export const NativeAssetPackage=z.strictObject({format:z.literal('sirvibe-assets'),version:z.literal(2),packs:z.array(manifest).min(1).max(nativePackageLimits.packs)});
export type NativePackage=z.infer<typeof NativeAssetPackage>;
export const nativeKey=(p:{id:string;revision:number})=>p.id+'@'+p.revision;
const error=(path:string,message:string):never=>{throw Error(path+': '+message);};
/** Linear lexical preflight before JSON.parse. Bounds nesting and token count
 * without interpreting string content or expanding anything. Rejects archives
 * and raw XML, and counts encoded bytes rather than JS UTF-16 units. */
export function boundedAssetJSON(text:string,limit=nativePackageLimits.bytes):unknown{
 if(text.length>limit||new TextEncoder().encode(text).length>limit)error('$','Package exceeds byte limit '+limit);
 if(!text.trimStart().startsWith('{'))error('$','Only plain JSON objects are accepted; ZIP, SVG and compressed files are unsupported');
 let depth=0,tokens=0,quoted=false,escaped=false;
 for(const c of text){if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
  if(c==='"'){quoted=true;tokens++;}else if(c==='{'||c==='['){depth++;tokens++;if(depth>nativePackageLimits.depth)error('$','Nesting limit exceeded');}else if(c==='}'||c===']')depth--;else if(c===','||c===':')tokens++;
  if(depth<0||tokens>nativePackageLimits.tokens)error('$','Invalid structure or token budget exceeded');
 }
 let value:unknown;try{value=JSON.parse(text);}catch{error('$','Invalid JSON');}
 const walk=(v:unknown,path:string)=>{if(typeof v==='number'&&!Number.isFinite(v))error(path,'Nonfinite number');if(v&&typeof v==='object'){for(const [k,x] of Object.entries(v)){if(['__proto__','prototype','constructor'].includes(k))error(path+'.'+k,'Unsafe key');walk(x,path+'.'+k);}}};walk(value,'$');return value;
}
export function parseNativePackage(text:string):NativePackage{
 const raw=boundedAssetJSON(text),parsed=NativeAssetPackage.safeParse(raw);
 if(!parsed.success)error('$',parsed.error.issues.slice(0,6).map(i=>i.path.join('.')+': '+i.message).join('; '));
 const value=parsed.data!,map=new Map<string,NativeAssetPack>();let components=0,commands=0,points=0,nodes=0,constraints=0;
 for(const [i,p] of value.packs.entries()){
  const at='packs.'+i,key=nativeKey(p);if(map.has(key))error(at+'.id','Duplicate pack revision');map.set(key,p);
  if(new Set(p.dependencies.map(nativeKey)).size!==p.dependencies.length)error(at+'.dependencies','Duplicate dependency');
  if(new Set(p.coverage).size!==p.coverage.length||assetViews.some(v=>p.coverage.includes(v)!==p.components.some(c=>c.view===v)))error(at+'.coverage','Coverage must exactly match component views');
  const ids=new Set<string>(),slots=new Set<string>();
  for(const [j,c] of p.components.entries()){
   const field=at+'.components.'+j;components++;
   if(ids.has(c.id))error(field+'.id','Duplicate component ID in pack');ids.add(c.id);
   if(c.packageSource)error(field+'.packageSource','Source metadata assigned by importer');
   if(p.category==='hair'&&c.slot!=='hair'||p.category==='clothing'&&!['top','shoe-left','shoe-right','upper-arm-left','upper-arm-right','forearm-left','forearm-right','thigh-left','thigh-right','calf-left','calf-right'].includes(c.slot)||p.category==='accessory'&&c.slot!=='head-accessory')error(field+'.slot','Category/slot mismatch');
   const slot=c.slot+'/'+c.view;if(slots.has(slot+'/'+(c.facing??'both'))||slots.has(slot+'/both')||!c.facing&&[...slots].some(s=>s.startsWith(slot+'/')))error(field+'.view','Conflicting slot/view/facing');slots.add(slot+'/'+(c.facing??'both'));
   if(!c.facing&&!c.artwork.compatibility.mirrorSafe)error(field+'.facing','Explicit facing required for asymmetric artwork');
   if(c.dynamics?.length&&c.artwork.regions.some(r=>r.transform))error(field+'.dynamics','Dynamic transformed regions are unsupported');
   for(const art of [c.artwork,...(c.poseArtwork??[]).map(v=>v.artwork)]){
    if(!vectorDrawList(art))error(field+'.artwork','Unsupported mask, clip, compound path or fill rule');
    const bound=art.units==='rig'?180:4;if(art.bounds.some(x=>Math.abs(x)>bound))error(field+'.artwork.bounds','Coordinate budget exceeded');
    if(art.regions.some(r=>r.transform&&r.transform.slice(0,4).some(x=>Math.abs(x)>8)))error(field+'.artwork.regions','Transform scale budget exceeded');
    for(const path of [...art.regions,...art.poses]){commands+=path.commands.length;points+=path.commands.reduce((n,c)=>n+(c.length-1)/2,0);}
   }
   for(const d of c.dynamics??[]){nodes+=d.points.length;constraints+=d.points.length-1;}
  }
 }
 if(components>nativePackageLimits.components||commands>nativePackageLimits.commands||points>nativePackageLimits.points||nodes>nativePackageLimits.nodes||constraints>nativePackageLimits.constraints)error('packs','Aggregate component/command/point/physics budget exceeded');
 const done=new Set<string>(),active=new Set<string>();
 function visit(k:string){if(active.has(k))error('packs.dependencies','Dependency cycle at '+k);if(done.has(k))return;const p=map.get(k);if(!p)error('packs.dependencies','Missing exact revision '+k);active.add(k);for(const d of p!.dependencies)visit(nativeKey(d));active.delete(k);done.add(k);}
 for(const k of map.keys())visit(k);return value;
}
export const exportNativePackage=(packs:NativeAssetPack[])=>JSON.stringify(parseNativePackage(JSON.stringify({format:'sirvibe-assets',version:2,packs})),null,2);
export function nativeClosure(packs:NativeAssetPack[],root:string){const map=new Map(packs.map(p=>[nativeKey(p),p])),visited=new Set<string>(),out:NativeAssetPack[]=[];function visit(k:string){if(visited.has(k))return;const p=map.get(k);if(!p)error('dependencies','Missing '+k);visited.add(k);for(const d of p!.dependencies)visit(nativeKey(d));out.push(p!);}visit(root);return out;}
/** Safe calibration only: palette values and pivot inside original bounds.
 * Revalidation occurs before any save or apply. */
export function calibrateNative(value:NativePackage,packIndex:number,componentIndex:number,change:{palette?:Record<string,string>;pivot?:[number,number]}):NativePackage{
 const copy=structuredClone(value),c=copy.packs[packIndex]?.components[componentIndex];if(!c)error('components','Missing calibration target');
 if(change.palette){for(const [key,color] of Object.entries(change.palette)){if(!Object.hasOwn(c.artwork.palette,key))error('palette.'+key,'Unknown channel');c.artwork.palette[key]=color;for(const v of c.poseArtwork??[])if(Object.hasOwn(v.artwork.palette,key))v.artwork.palette[key]=color;}}
 if(change.pivot)c.artwork.pivot=change.pivot;
 return parseNativePackage(JSON.stringify(copy));
}
/** Apply closure atomically to a draft; copies geometry and provenance into the
 * project, so playback/backup never require the reusable library. */
export function applyNativePackage(character:Character,packs:NativeAssetPack[],root:string):Character{
 const closure=nativeClosure(parseNativePackage(JSON.stringify({format:'sirvibe-assets',version:2,packs})).packs,root);
 const visual=character.visual??{version:1 as const,style:'classic' as const,profile:'average' as const};
 const parts:NativeVectorComponentData[]=[];
 for(const p of closure){if(p.style!==visual.style)error(p.name+'.style','Requires '+p.style+' art style');for(const c of p.components){if(!c.profiles.includes(visual.profile))error(p.name+'.profiles','Does not fit '+visual.profile);parts.push({...c,id:p.id+'-'+c.id,packageSource:{id:p.id,revision:p.revision,license:p.license,provenance:p.provenance}});}}
 // Component IDs are bounded and unique after embedding; no silent truncation.
 const ids=new Set<string>();for(const c of parts){if(c.id.length>80||ids.has(c.id))error('components.id','Embedded component ID conflict or length limit');ids.add(c.id);}
 const replace=(old:{slot:string;view:string})=>parts.some(c=>c.slot===old.slot&&c.view===old.view);
 const next=CharacterVisual.safeParse({...visual,components:visual.components?.filter(c=>!replace(c)),vectorComponents:[...(visual.vectorComponents??[]).filter(c=>!replace(c)),...parts]});
 if(!next.success)error('character.visual',next.error.issues.map(i=>i.path.join('.')+': '+i.message).join('; '));
 return CharacterDefinition.parse({...character,visual:next.data});
}
