import assert from 'node:assert/strict';
import test from 'node:test';
import { makeProject } from '../src/engine/presets.ts';
import { ProjectDocument, parseStoredProject } from '../src/engine/schema.ts';
import { gestureAt, livingPose, resolvePersonality } from '../src/engine/livingCharacter.ts';
import { handPerformance } from '../src/engine/handPerformance.ts';
import { armIK } from '../src/engine/animation.ts';
import { evaluate } from '../src/engine/evaluate.ts';

const project=makeProject(true),base=project.characters[0];
const perform=(_character:typeof base,time:number,speaking=true)=>({
  time,actorId:'actor-a',action:'idle' as const,locomotion:'idle' as const,
  expression:'neutral' as const,speaking,
  phrase:{start:0,duration:14,text:'First, hear me out. I have an idea. Can you help? Stop! This is how it works.'}
});

test('personality is optional for historical characters and validates custom traits',()=>{
  const legacy=parseStoredProject(project);
  assert.equal(legacy.characters[0].id,base.id);
  const confident={...base,personality:{preset:'confident' as const,confidence:94,signature:'point' as const,autoActing:'full' as const}};
  const parsed=ProjectDocument.parse({...project,characters:[confident,...project.characters.slice(1)]});
  assert.equal(parsed.characters[0].personality?.confidence,94);
  assert.equal(resolvePersonality(confident.personality).confidence,94);
  assert.throws(()=>ProjectDocument.parse({...project,characters:[{...confident,personality:{confidence:101}},...project.characters.slice(1)]}));
});
test('distinct profiles produce distinct body motion from the same dialogue',()=>{
  const brave={...base,personality:{preset:'confident' as const,autoActing:'full' as const}};
  const timid={...base,personality:{preset:'nervous' as const,autoActing:'full' as const}};
  const at=1.27;
  const a=livingPose(brave,perform(brave,at),{});
  const b=livingPose(timid,perform(timid,at),{});
  assert.notDeepEqual(a,b);
  assert(Number.isFinite(a.torso)&&Number.isFinite(b.head));
});
test('gesture sampling is deterministic for arbitrary seek order',()=>{
  const expressive={...base,personality:{preset:'hyperactive' as const,gestureFrequency:100,signature:'point' as const}};
  const times=[0.2,1.3,5.6,3.9,12.5,1.3,0.2];
  const first=times.map(t=>gestureAt(expressive,perform(expressive,t)));
  const reversed=[...times].reverse().map(t=>gestureAt(expressive,perform(expressive,t)));
  assert.deepEqual(first,[...reversed].reverse());
  assert(Array.from({length:140},(_,i)=>gestureAt(expressive,perform(expressive,i*.1))).some(item=>item.weight>0));
});
test('explicit gestures and disabled auto acting take precedence',()=>{
  const enabled={...base,personality:{preset:'dramatic' as const,gestureFrequency:100}};
  const disabled={...base,personality:{preset:'dramatic' as const,autoActing:'off' as const}};
  const time=2;
  assert.equal(gestureAt(disabled,perform(disabled,time)).kind,'rest');
  assert.deepEqual(livingPose(disabled,perform(disabled,time),{rightShoulder:50}),{rightShoulder:50});
  assert.equal(gestureAt(enabled,{...perform(enabled,time),manualGesture:true}).weight,0);
  const handInput={action:'point' as const,locomotion:'idle' as const,side:'right' as const,carrying:true};
  assert.equal(handPerformance(handInput).pose,'grip');
  assert.equal(handPerformance({...handInput,carrying:false}).pose,'point');
});
test('five-finger poses are selected consistently with the body gesture',()=>{
  const excited={...base,personality:{preset:'hyperactive' as const,gestureFrequency:100}};
  for(let n=0;n<150;n++){
    const input=perform(excited,n*.11);
    const gesture=gestureAt(excited,input);
    const hand=handPerformance({action:'idle',locomotion:'idle',side:gesture.side,carrying:false,gesture});
    if(gesture.kind!=='rest')assert.equal(hand.blend,gesture.weight);
  }
});
test('IK clamps out-of-reach hand targets and produces finite elbow positions',()=>{
  const shoulder={x:10,y:20};
  for(const target of [{x:1e6,y:1e6},{x:10,y:20},{x:-90,y:23}]){
    const [elbow,hand]=armIK(shoulder,target,28,28,1);
    assert(Number.isFinite(elbow.x)&&Number.isFinite(elbow.y));
    assert(Number.isFinite(hand.x)&&Number.isFinite(hand.y));
    assert(Math.hypot(hand.x-shoulder.x,hand.y-shoulder.y)<=56+.001);
  }
});
test('scene evaluation respects character identity and random access timestamps',()=>{
  const first=project.characters[0],actor=project.scenes[0].actors.find(a=>a.characterId===first.id);
  assert(actor);
  const current={...first,personality:{preset:'confident' as const}};
  const chars=new Map(project.characters.map(c=>[c.id,c] as const));
  chars.set(first.id,current);
  const scene=project.scenes[0];
  const a=evaluate(scene,2.4,chars);
  evaluate(scene,8.4,chars);
  const b=evaluate(scene,2.4,chars);
  assert.deepEqual(a.actors.find(item=>item.id===actor.id)?.pose,b.actors.find(item=>item.id===actor.id)?.pose);
});
