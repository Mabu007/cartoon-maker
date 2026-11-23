import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultStageViewport, zoomStageAt, moveStageViewport } from '../src/engine/stageViewport.ts';
import { assessHandReach,actorPositionAt,mayAttachProp,pickupFeedback,resolveHandCustody } from '../src/engine/objectInteractionEngine.ts';
import { makeProp,makeScene } from '../src/engine/presets.ts';
import { addSceneActor } from '../src/engine/actorPresence.ts';
import { stagePath } from '../src/engine/stagePath.ts';
import { CameraShot, SceneDefinition,type Clip } from '../src/engine/schema.ts';
import { cameraFraming } from '../src/engine/cameraDirector.ts';
import { evaluate } from '../src/engine/evaluate.ts';
import { aimEyes } from '../src/engine/gaze.ts';

const sceneWithActor=()=>{
  const {scene,actorId}=addSceneActor({...makeScene('Living room',false),duration:12},'test-character',0,'place');
  const actor=scene.actors.find(a=>a.id===actorId)!;
  const prop=makeProp('cup',actor.x+50,actor.y);
  return {scene:{...scene,objects:[prop]},actorId,actor,prop};
};

test('editing canvas zoom keeps the world point under the cursor and is not a movie camera change',()=>{
  const pointer={x:190,y:110},center={x:250,y:150};
  const first=zoomStageAt(defaultStageViewport,2,pointer,center);
  assert.equal(first.zoom,2);
  const centered=(screen:{zoom:number;panX:number;panY:number})=>({
    x:(pointer.x-center.x-screen.panX)/screen.zoom,
    y:(pointer.y-center.y-screen.panY)/screen.zoom
  });
  assert.deepEqual(centered(first),centered(defaultStageViewport));
  const maximum=zoomStageAt(first,500,pointer,center);
  assert.equal(maximum.zoom,8);
  assert.equal(zoomStageAt(first,.01,pointer,center).zoom,.5);
  assert.deepEqual(moveStageViewport(first,15,-12),{...first,panX:first.panX+15,panY:first.panY-12});
});

test('reach is scaled to the actor and rejects distant or elevated props',()=>{
  const actor={x:110,y:450,scale:1};
  assert(assessHandReach(actor,{x:181,y:420}).canReach);
  assert(!assessHandReach(actor,{x:290,y:420}).canReach);
  assert(!assessHandReach(actor,{x:181,y:210}).canReach);
  assert(assessHandReach({...actor,scale:2},{x:290,y:420}).canReach);
});

test('actor must walk into range before a pick-up; static distant objects never teleport',()=>{
  const {scene,actorId,actor,prop}=sceneWithActor();
  const distant=makeProp('phone',actor.x+300,actor.y);
  const far={...scene,objects:[distant]};
  assert(!mayAttachProp(far,actorId,distant.id,.75));
  assert.match(pickupFeedback(far,actorId,distant.id,.75)??'',/Walk closer/);
  const movement=stagePath(far,actorId,0,[{x:actor.x,y:actor.y},{x:distant.x-55,y:actor.y}],
    'walk','natural','move');
  // Evaluate the contact after arriving at the end of the walk.
  const moment=movement.clip.start+movement.clip.length+.25;
  const at=actorPositionAt(movement.scene,actorId,moment)!;
  assert(Math.abs(at.x-(distant.x-55))<.1);
  assert(mayAttachProp(movement.scene,actorId,distant.id,moment));
  assert(mayAttachProp(scene,actorId,prop.id,.75));
});

test('a non-holdable object is scenery, not a valid hand attachment',()=>{
  const {scene,actorId,actor}=sceneWithActor();
  const sofa=makeProp('sofa',actor.x+20,actor.y);
  const world={...scene,objects:[sofa]};
  assert.equal(mayAttachProp(world,actorId,sofa.id,.1),false);
  assert.match(pickupFeedback(world,actorId,sofa.id,.1)??'',/scenery/);
});

test('timeline pick-up glues one prop to the chosen hand until the matching release',()=>{
  const {scene,actorId,prop}=sceneWithActor();
  const pickup:Clip={id:'grab-cup',track:'body',actor:actorId,action:'pick-up',layer:'gesture',
    hand:'left',target:prop.id,start:1,length:1};
  const drop:Clip={id:'release-cup',track:'props',actor:actorId,
    target:prop.id,hand:'left',interaction:'release',start:4,length:.2};
  const filmed={...scene,clips:[pickup,drop]};
  assert.equal(resolveHandCustody(filmed,1.3).size,0,'cannot grab until hand contact');
  assert.equal(resolveHandCustody(filmed,2).get(prop.id)?.hand,'left');
  assert.equal(evaluate(filmed,2).actors[0].heldItems?.left?.id,prop.id);
  assert(!resolveHandCustody(filmed,4.1).has(prop.id));
  assert.equal(evaluate(filmed,4.1).actors[0].held,undefined);
});

test('one hand never acquires two props; the other hand remains independently available',()=>{
  const {scene,actorId,actor,prop}=sceneWithActor();
  const phone=makeProp('phone',actor.x+66,actor.y);
  const book=makeProp('book',actor.x+40,actor.y);
  const cues:Clip[]=[
    {id:'cup',track:'props',actor:actorId,target:prop.id,interaction:'equip',start:1,length:.1,hand:'right'},
    {id:'phone',track:'props',actor:actorId,target:phone.id,interaction:'equip',start:1.2,length:.1,hand:'right'},
    {id:'book',track:'props',actor:actorId,target:book.id,interaction:'equip',start:1.4,length:.1,hand:'left'}
  ];
  const film={...scene,objects:[prop,phone,book],clips:cues};
  const owned=resolveHandCustody(film,2);
  assert.equal(owned.size,2);
  assert(owned.has(prop.id)&&owned.has(book.id));
  assert(!owned.has(phone.id));
  const performance=evaluate(film,2).actors[0];
  assert.equal(performance.heldItems?.left?.id,book.id);
  assert.equal(performance.heldItems?.right?.id,prop.id);
});

test('competing actor cannot grab prop already held by another, even if close',()=>{
  const {scene,actorId,actor,prop}=sceneWithActor();
  const other=addSceneActor(scene,'other-character',0,'place');
  const actors=other.scene.actors.map(a=>a.id===other.actorId?{...a,x:actor.x,y:actor.y}:a);
  const occupied={...scene,actors,clips:[
    {id:'one',track:'props' as const,actor:actorId,target:prop.id,interaction:'equip' as const,start:1,length:.1},
    {id:'two',track:'props' as const,actor:other.actorId,target:prop.id,interaction:'equip' as const,start:1.2,length:.1}
  ]};
  assert.equal(resolveHandCustody(occupied,2).get(prop.id)?.actor,actorId);
});

test('camera zoom multiplier is validated and applies to movie shots independently of editing zoom',()=>{
  const clip:Extract<Clip,{track:'camera'}>={id:'ultra',track:'camera',start:1,length:3,
    shot:'close-up',transition:'cut',zoomMultiplier:5};
  assert(CameraShot.safeParse(clip).success);
  assert(!CameraShot.safeParse({...clip,zoomMultiplier:20}).success);
  const base=cameraFraming({...clip,zoomMultiplier:1},[{id:'hero',x:480,y:430,scale:1,visible:true,lift:0}],[],1.5);
  const zoomed=cameraFraming(clip,[{id:'hero',x:480,y:430,scale:1,visible:true,lift:0}],[],1.5);
  assert(zoomed.zoom>base.zoom*3);
});

test('positional gaze responds naturally to lower and lateral prop targets',()=>{
  const eye={x:480,y:230};
  const down=aimEyes(eye,{x:480,y:440},false,0,1);
  const side=aimEyes(eye,{x:700,y:230},false,0,1);
  assert(down.y>.7&&Math.abs(down.x)<.1);
  assert(side.x>.7&&Math.abs(side.y)<.1);
});

test('new hand choices, reach actions and camera zoom remain JSON-schema compatible',()=>{
  const {scene,actorId,prop}=sceneWithActor();
  const value={...scene,clips:[
    {id:'grab',track:'body',actor:actorId,action:'pick-up',layer:'gesture',hand:'left',
      start:0,length:1,target:prop.id},
    {id:'lens',track:'camera',start:2,length:2,shot:'extreme-close-up',transition:'cut',
      zoomMultiplier:6}
  ]};
  assert.equal(SceneDefinition.safeParse(JSON.parse(JSON.stringify(value))).success,true);
});
