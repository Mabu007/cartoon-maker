import {secondaryMotionAudition} from './secondaryMotionAudition.ts';
import {makeWorldSet,nativeWorldProp, type WorldSetName} from './worldCatalog.ts';
import {nativeWorldPropKinds,type NativeWorldPropKind} from './worldArtworkSchema.ts';
import {defaultPerspective} from './environmentVisuals.ts';
import {ProjectDocument,type Project,type Clip} from './schema.ts';
/** Existing demonstration plus actual shared wind, canonical vector props
 * and release cue. The existing chair/sofa and contact system stay in charge. */
export function livingWorldAudition(set:WorldSetName='Living room'):Project{
 const p=secondaryMotionAudition(2),s=p.scenes[0],world=makeWorldSet(set);
 p.name='Living world · shared wind audition';
 s.visual={...s.visual!,world,walkable:world.walkable,perspective:{...defaultPerspective,nearY:480,farY:395,nearScale:1,farScale:.8,retimeMovement:true},lighting:{enabled:true,ambient:'#f6e6d1',intensity:.9,shadow:'#423949',shadowOpacity:.28,lights:[{id:'window-key',x:620,y:175,color:'#ffe4b7',intensity:.3,radius:450,falloff:1.5}]},secondaryMotion:{...s.visual!.secondaryMotion!,windX:46,windY:4,turbulence:1,gravity:12,regions:[{id:'window-breeze',x:620,y:230,radius:280,windX:28,windY:0}]}};
 s.objects=s.objects.map(o=>nativeWorldPropKinds.includes(o.kind as NativeWorldPropKind)?{...o,worldArtwork:nativeWorldProp(o.kind as NativeWorldPropKind)}:o);
 // Sbu starts without a prop; a nearby book becomes attached by the
 // existing equip cue, and is released at the walked-to location.
 const a=s.actors[0],book=s.objects.find(o=>o.id==='book')!;
 book.x=a.x+18;book.y=a.y;book.depth=0;
 s.clips.push({id:'world-book-pick',track:'props',actor:a.id,target:book.id,interaction:'equip',hand:'left',start:.2,length:.1},{id:'world-book-release',track:'props',actor:a.id,target:book.id,interaction:'release',hand:'left',start:4.9,length:.1},{id:'world-cup-release',track:'props',actor:s.actors[1].id,target:'cup',interaction:'release',hand:'right',start:18.5,length:.1});
 return ProjectDocument.parse(p);
}
