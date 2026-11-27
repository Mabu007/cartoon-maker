import test from 'node:test';
import assert from 'node:assert/strict';
import {GarmentDesignV1,GarmentPhysicsV1,garmentDefaults,garmentFits,garmentTops,garmentBottoms,garmentOuters,garmentShoes} from '../src/engine/garmentDesignSchema.ts';
import {garmentEnabled,garmentTorso,garmentSleeve,garmentLeg,garmentSkirt,garmentFoot,garmentPhysics} from '../src/engine/garmentGeometry.ts';
import {flagshipCharacters,applyProfile} from '../src/engine/visualPresets.ts';
import {rig,animations,sample,seatedLeg,gaitLeg,viewForward} from '../src/engine/animation.ts';
import {viewArt,heldGripPoint} from '../src/engine/actorArt.ts';
import {CharacterDefinition,views} from '../src/engine/schema.ts';
import {visualRigAnchors} from '../src/engine/visualRig.ts';
import {exportCharacterIdentity,importCharacterIdentity} from '../src/engine/characterIdentity.ts';
import {illustratedPath} from '../src/engine/illustration.ts';
test('legacy characters unchanged; independent strict design is portable',()=>{
 const base=flagshipCharacters[0];assert(!garmentEnabled(base));
 const c=CharacterDefinition.parse({...base,garmentDesign:{...garmentDefaults,outer:'coat',top:'blouse',bottom:'skirt',pattern:'checks'}});
 assert(garmentEnabled(c));assert.deepEqual(importCharacterIdentity(exportCharacterIdentity(c),c.id),c);
 assert(!GarmentDesignV1.safeParse({...garmentDefaults,cuff:10}).success);
 assert(!GarmentDesignV1.safeParse({...garmentDefaults,stiffness:999}).success);
});
test('all garment profiles, views, pose samples and fit extremes use finite renderable paths and pinned metadata',()=>{
 for(const profile of ['slim','average','muscular','curvy','heavyset'] as const)
 for(const view of views)for(const fit of garmentFits){
  const base=applyProfile(flagshipCharacters[1],profile),art=viewArt[view];
  const d={...garmentDefaults,fit,outer:'jacket' as const,length:fit==='tight'?.8:1.2,waist:fit==='tight'?.9:1.15,hem:fit==='tight'?.9:1.2,cuff:fit==='tight'?.9:1.2};
  const c=CharacterDefinition.parse({...base,garmentDesign:d});
  for(const action of ['idle','sit','walk','wave'] as const){
   const s=sample(animations[action],.4),r=rig(c,s.pose,art.width),original=structuredClone(r);
   const a=visualRigAnchors(c,view,s.pose),meta=garmentPhysics(c,a);
   for(const group of meta){assert(GarmentPhysicsV1.safeParse(group).success);for(const pin of group.pins)assert.deepEqual(pin.point,a[pin.name as keyof typeof a]);}
   const paths=garmentTorso(c,art,r.neck,r.hip,r.left.shoulder,r.right.shoulder,action==='sit'?1:0);
   for(const side of ['left','right'] as const){
    const j=r[side],leg=action==='sit'?seatedLeg(j.upper,c.legs*c.height,s.lift,side):action==='walk'?gaitLeg(j.upper,c.legs*c.height,.4,'walk',side,viewForward(view),s.lift):[j.knee,j.foot] as const;
    paths.push(...garmentSleeve(c,j.shoulder,j.elbow,j.hand),...garmentLeg(c,j.upper,leg[0],leg[1]),...garmentFoot(c,leg[1],side==='left'?-1:1,art.rear));
   }
   assert(paths.length<100);for(const p of paths){assert(!/NaN|Infinity|undefined/.test(p.d));assert.doesNotThrow(()=>illustratedPath(p.d));}
   assert.deepEqual(r,original);assert.deepEqual(heldGripPoint(c,view,s.pose),heldGripPoint(base,view,s.pose));
  }
 }
});
test('template switches, open layers, independent sleeves and grounded sole',()=>{
 const base=flagshipCharacters[0],view=viewArt.front,r=rig(base,{},view.width);
 for(const top of garmentTops)for(const bottom of garmentBottoms)for(const outer of garmentOuters)for(const footwear of garmentShoes){
  const c={...base,garmentDesign:{...garmentDefaults,top,bottom,outer,footwear}};
  const paths=garmentTorso(c,view,r.neck,r.hip,r.left.shoulder,r.right.shoulder);
  assert(paths.some(p=>p.id==='top-panel'));
  if(outer!=='none')assert(paths.some(p=>p.id==='outer-panel-left'));
  if(top==='hoodie')assert(paths.some(p=>p.id==='hood'));
  if(bottom==='skirt'&&top!=='dress')assert(garmentSkirt(c,view,r.hip).length>0);
  assert(garmentFoot(c,r.left.foot,-1).length>0);
 }
 const c={...base,garmentDesign:{...garmentDefaults,outer:'jacket' as const}};
 assert(!garmentSleeve(c,r.left.shoulder,r.left.elbow,r.left.hand,'all',true,false).some(p=>p.id.includes('upper')));
 assert(garmentSleeve(c,r.left.shoulder,r.left.elbow,r.left.hand,'hand').length===0);
 const shoe=garmentFoot(c,{x:0,y:0},1);assert(shoe[1].d.includes(' 5'));
 const large=garmentFoot({...c,visual:{...c.visual!,footSize:1.25}},{x:0,y:0},1);assert(large[1].d.includes(' 5'));
});
