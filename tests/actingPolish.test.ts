import assert from 'node:assert/strict';
import test from 'node:test';
import { makeProject } from '../src/engine/presets.ts';
import { animations, footContactAt, gaitLeg, seatedLeg } from '../src/engine/animation.ts';
import { handRotation, sampleHandRig } from '../src/engine/handRig.ts';
import { gestureAt, livingPose } from '../src/engine/livingCharacter.ts';
import { facialPerformance } from '../src/engine/facialAnimation.ts';

const base=makeProject(true).characters[0];

test('point index and relaxed fingers extend away from the wrist anchor',()=>{
  const point=sampleHandRig('point'),relaxed=sampleHandRig('relaxed');
  assert(point.fingers[0][2][1]<point.fingers[1][2][1]-3);
  for(const finger of relaxed.fingers)assert(finger[2][1]<finger[0][1]-3);
  // Vertical local fingertips aim horizontally along a horizontal forearm.
  for(const angle of [0,Math.PI/2,-Math.PI/2,Math.PI]){
    const rotation=handRotation(angle,0,'point');
    const outward={x:Math.sin(rotation),y:-Math.cos(rotation)};
    assert(Math.abs(outward.x-Math.cos(angle))<1e-8);
    assert(Math.abs(outward.y-Math.sin(angle))<1e-8);
  }
});

test('seated soles are planted at the local floor and use deterministic IK',()=>{
  for(const scale of [.8,1,1.3]){
    const lift=-49*scale;
    for(const side of ['left','right'] as const){
      const hip={x:(side==='left'?-13:13)*scale,y:-76*scale};
      const [knee,foot]=seatedLeg(hip,scale,lift,side);
      assert(Math.abs(foot.y-lift)<1e-6);
      assert(Number.isFinite(knee.x)&&Number.isFinite(knee.y));
      assert.deepEqual(seatedLeg(hip,scale,lift,side),[knee,foot]);
    }
  }
});

test('walk/run support phases stay grounded, while running lifts the swing foot higher',()=>{
  for(const action of ['walk','run'] as const){
    for(const side of ['left','right'] as const){
      for(let i=0;i<24;i++){
        const sample=footContactAt(animations[action].duration*i/24,action,side);
        assert(Number.isFinite(sample.x)&&Number.isFinite(sample.y));
        if(sample.planted)assert.equal(sample.y,0);
        else assert(sample.y<=0);
      }
    }
    const [knee,sole]=gaitLeg({x:0,y:-76},1,0,action,'left',1,0);
    assert(Number.isFinite(knee.x)&&Number.isFinite(sole.y));
  }
  const walk=footContactAt(animations.walk.duration*.77,'walk','left');
  const run=footContactAt(animations.run.duration*.715,'run','left');
  assert(run.y<walk.y);
});

test('shy and confident resting silhouettes and gaze differ without lip motion',()=>{
  const confident={...base,personality:{preset:'confident' as const}};
  const shy={...base,personality:{preset:'shy' as const}};
  const input={time:.37,actorId:'a',action:'idle' as const,locomotion:'idle' as const,
    expression:'neutral' as const,speaking:false,speechWeight:0};
  const a=livingPose(confident,input,{});
  const b=livingPose(shy,input,{});
  assert(Math.abs((a.rightShoulder??0)-(b.rightShoulder??0))>6);
  const eyesA=facialPerformance(.37,'a','idle','neutral',0,undefined,undefined,confident.personality);
  const eyesB=facialPerformance(.37,'a','idle','neutral',0,undefined,undefined,shy.personality);
  assert(eyesB.gazeY>eyesA.gazeY);
  const target={x:-.7,y:.3};
  const directed=facialPerformance(.37,'a','idle','neutral',0,undefined,target,shy.personality);
  assert(directed.gazeX<0);
});

test('one sparse phrase accent drives deterministic body and hand decisions',()=>{
  const c={...base,personality:{preset:'hyperactive' as const,gestureFrequency:100}};
  const phrase={start:2,duration:4,text:'We have a plan. We can do it today!'};
  const at=(time:number)=>gestureAt(c,{time,actorId:'a',action:'idle',
    locomotion:'idle',expression:'neutral',speaking:true,speechWeight:1,phrase});
  const times=Array.from({length:100},(_,i)=>2+i*.04);
  const forward=times.map(at),backward=[...times].reverse().map(at).reverse();
  assert.deepEqual(forward,backward);
  assert(forward.some(p=>p.weight>.15));
  assert(forward.filter(p=>p.kind==='rest').length>30);
});
