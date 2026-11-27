import {z} from 'zod';
import {CharacterDefinition,identityLockGroups,type Character} from './schema.ts';
import {characterStyles} from './characterCatalog.ts';
export type IdentityLock=typeof identityLockGroups[number];
const envelope=z.strictObject({format:z.literal('sirvibe-character'),version:z.literal(1),character:CharacterDefinition});
export function characterIdentity(c:Character){return c.identity??{version:1 as const,seed:0,locks:[] as IdentityLock[]};}
/** Full canonical character record is the DNA; no competing identity fields. */
export function exportCharacterIdentity(c:Character){return JSON.stringify(envelope.parse({format:'sirvibe-character',version:1,character:c}),null,2);}
/** Explicit old raw-character import, not a silent project migration.
 * Imported identity can replace a draft without changing its actor references. */
export function importCharacterIdentity(text:string,currentId:string){
  if(text.length>4_000_000)throw Error('Character file exceeds 4 MB');
  const raw:unknown=JSON.parse(text);
  const c=raw&&typeof raw==='object'&&Object.hasOwn(raw,'format')?envelope.parse(raw).character:CharacterDefinition.parse(raw);
  return CharacterDefinition.parse({...c,id:currentId});
}
export function duplicateCharacterIdentity(c:Character,id:string){
  return CharacterDefinition.parse({...structuredClone(c),id,name:c.name.trim().slice(0,54)+' copy'});
}
export function setIdentityLock(c:Character,lock:IdentityLock,on:boolean):Character{
  const identity=characterIdentity(c),locks=new Set(identity.locks);
  if(on)locks.add(lock);else locks.delete(lock);
  return {...c,identity:{...identity,locks:identityLockGroups.filter(k=>locks.has(k))}};
}
/** Independent deterministic group streams: locking a group never changes
 * the random sequence of another group. No Math.random or runtime pose data. */
function stream(seed:number,group:number){
  let state=(seed^Math.imul(group+1,0x9e3779b1))>>>0;
  // Avalanche adjacent seeds before the LCG; a one-step seed change must
  // not simply shift the first value by one LCG increment.
  state=Math.imul(state^(state>>>16),0x85ebca6b)>>>0;
  state=Math.imul(state^(state>>>13),0xc2b2ae35)>>>0;
  state=(state^(state>>>16))>>>0;
  return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
}
export function randomizeCharacterIdentity(c:Character,seed:number):Character{
  if(!Number.isInteger(seed)||seed<0||seed>4294967295)throw Error('Seed must be an unsigned 32-bit integer');
  const identity=characterIdentity(c),locked=new Set(identity.locks);
  const next=structuredClone(c);
  const group=(key:IdentityLock,fn:(rand:()=>number)=>void)=>{if(!locked.has(key))fn(stream(seed,identityLockGroups.indexOf(key)));};
  const pick=<T>(a:readonly T[],rand:()=>number):T=>a[Math.floor(rand()*a.length)];
  const value=(r:()=>number,min:number,max:number)=>Math.round((min+(max-min)*r())*100)/100;
  group('body',r=>{
    // Imported components remain bound to the same declared profile.
    next.height=value(r,.85,1.22);next.head=value(r,.8,1.16);next.torso=value(r,.85,1.18);next.arms=value(r,.88,1.15);next.legs=value(r,.88,1.18);next.thickness=value(r,.8,1.2);
    if(next.visual)next.visual={...next.visual,shoulders:value(r,.88,1.18),waist:value(r,.85,1.2),hips:value(r,.88,1.2),abdomen:value(r,.9,1.2),armWidth:value(r,.88,1.2),thighWidth:value(r,.88,1.2),calfWidth:value(r,.9,1.18)};
  });
  group('face',r=>{next.shape=pick(characterStyles.shape,r);next.eyes=pick(characterStyles.eyes,r);next.brows=pick(characterStyles.brows,r);next.nose=pick(characterStyles.nose,r);next.mouth=pick(characterStyles.mouth,r);next.ears=pick(characterStyles.ears,r);next.eyeSpacing=value(r,.85,1.15);});
  group('hair',r=>{next.hair=pick(characterStyles.hair,r);next.beard=pick(characterStyles.beard,r);});
  group('palette',r=>{next.skin=pick(['#f2c49b','#d89b70','#b97550','#925b40','#76452f','#503123'],r);next.hairColor=pick(['#242120','#302327','#5e4030','#939097'],r);next.shirt=pick(['#304a48','#b46d50','#28363e','#87678f','#cba97b'],r);next.pants=pick(['#263b40','#28363e','#5b433c','#3d3555'],r);next.shoes=pick(['#d3c1a2','#d9b482','#29282e'],r);next.wardrobe={...next.wardrobe,iris:pick(['#36271f','#574332','#2f4540'],r)};});
  group('wardrobe',r=>{next.outfit=pick(characterStyles.outfit,r);next.hat=pick(characterStyles.hat,r);next.accessory=pick(characterStyles.accessory,r);next.glasses=r()<.2;next.earrings=r()<.4;});
  group('personality',r=>{next.personality={...next.personality,preset:pick(['balanced','confident','shy','relaxed','playful'] as const,r),confidence:value(r,25,85),expressiveness:value(r,25,85),energy:value(r,25,85)};});
  group('voice',r=>{if(!next.hostedVoiceId)next.voicePreset=pick(['warm','bright','deep'] as const,r);});
  next.identity={...identity,seed};
  return CharacterDefinition.parse(next);
}
