/** Native v2 world envelope variant: same bounded JSON preflight and canonical
 * vector schema as character packs. No external dependencies or execution. */
import {z} from 'zod';
import {boundedAssetJSON,nativePackageLimits} from './nativeAssetPackage.ts';
import {WorldSet,WorldArtwork,WorldSource,nativeWorldPropKinds,worldPropCompatible,worldArtLimits,type WorldSetData,type WorldArtworkData} from './worldArtworkSchema.ts';
const identity=WorldSource.shape;
export const WorldPackage=z.strictObject({format:z.literal('sirvibe-assets'),version:z.literal(2),worldPacks:z.array(z.discriminatedUnion('category',[z.strictObject({...identity,category:z.literal('environment'),set:WorldSet}),z.strictObject({...identity,category:z.literal('prop'),kind:z.enum(nativeWorldPropKinds),art:WorldArtwork})])).min(1).max(nativePackageLimits.packs)});
export type WorldPackageData=z.infer<typeof WorldPackage>;
export function parseWorldPackage(text:string):WorldPackageData{
 const q=WorldPackage.safeParse(boundedAssetJSON(text));if(!q.success)throw Error(q.error.issues.slice(0,6).map(i=>i.path.join('.')+': '+i.message).join('; '));
 const keys=new Set<string>();let commands=0,nodes=0,components=0;
 for(const p of q.data.worldPacks){const key=p.id+'@'+p.revision;if(keys.has(key))throw Error('worldPacks.id: Duplicate revision');keys.add(key);
  if(p.category==='prop'&&!worldPropCompatible(p.kind,p.art))throw Error('worldPacks.art: Prop bounds or kind incompatible');
  for(const a of p.category==='environment'?p.set.layers.map(l=>l.art):[p.art]){components++;commands+=a.artwork.regions.reduce((n,r)=>n+r.commands.length,0);nodes+=(a.dynamics??[]).reduce((n,d)=>n+d.points.length,0);}
 }
 if(commands>nativePackageLimits.commands||nodes>nativePackageLimits.nodes||components>nativePackageLimits.components)throw Error('worldPacks: Aggregate native command/node/component budget exceeded');return q.data;
}
export function worldSource(p:WorldPackageData['worldPacks'][number]){const {id,revision,license,provenance}=p;return {id,revision,license,provenance};}
const meta=(id:string)=>({id,revision:1,license:'CC0-1.0',provenance:'Original SIRVIBE world fixture'});
export const exportWorldSet=(set:WorldSetData)=>JSON.stringify(parseWorldPackage(JSON.stringify({format:'sirvibe-assets',version:2,worldPacks:[{...(set.source??meta(set.id)),category:'environment',set}]})),null,2);
export const exportWorldProp=(kind:typeof nativeWorldPropKinds[number],art:WorldArtworkData)=>JSON.stringify(parseWorldPackage(JSON.stringify({format:'sirvibe-assets',version:2,worldPacks:[{...(art.source??meta(art.id)),category:'prop',kind,art}]})),null,2);
