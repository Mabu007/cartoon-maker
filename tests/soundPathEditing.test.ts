import assert from 'node:assert/strict';
import test from 'node:test';
import { CharacterDefinition, TimelineClip, type SoundClip } from '../src/engine/schema.ts';
import { animations, rig, sample } from '../src/engine/animation.ts';
import { facialPerformance } from '../src/engine/facialAnimation.ts';
import { characters, makeScene } from '../src/engine/presets.ts';
import { shiftVoice, voiceLooks } from '../src/engine/voiceEffects.ts';
import { splitTimelineClips } from '../src/engine/timelineEditing.ts';
import { insertWaypoint, pathNodes, smoothPath } from '../src/engine/stagePath.ts';

test('voice pitch changes frequency without changing source alignment or mutating audio', () => {
  const rate=16000, hz=260;
  const tone=Float32Array.from({length:rate*2},(_,index)=>Math.sin(2*Math.PI*index*hz/rate));
  const before=tone.slice();
  const [lower]=shiftVoice([tone],rate,voiceLooks['deep-bass'].pitch);
  assert.deepEqual(tone,before);
  assert.equal(lower.length,tone.length);
  let crossings=0;
  for(let i=rate/2;i<rate*1.5;i++)if(lower[i]>=0&&lower[i-1]<0)crossings++;
  assert(Math.abs(crossings-hz*2**(-5/12))<3,`heard ${crossings} Hz`);
});

test('splitting dialogue keeps source offset, effects and outer fades', () => {
  const clip:SoundClip={id:'read',track:'dialogue', actor:'voice', asset:'asset:local',text:'Hello',
    start:2,length:5,offset:1.25,volume:1,muted:false,fadeIn:1,fadeOut:2,voiceEffect:{...voiceLooks.champ}};
  const scene={...makeScene(),duration:12,clips:[clip]};
  const result=splitTimelineClips(scene,[clip.id],4);
  const [before,after]=result.scene.clips;
  assert.equal(TimelineClip.safeParse(after).success,true);
  assert(before.track==='dialogue'&&after.track==='dialogue');
  assert.equal(before.offset,1.25);
  assert.equal(after.offset,3.25);
  assert.equal(before.fadeIn,1);
  assert.equal(before.fadeOut,undefined);
  assert.equal(after.fadeIn,undefined);
  assert.equal(after.fadeOut,2);
  assert.deepEqual(after.voiceEffect,clip.voiceEffect);
});

test('curved paths pass through waypoint handles without overshoot', () => {
  const route=[{x:0,y:15},{x:50,y:20},{x:70,y:-10},{x:100,y:20}];
  const extra={x:68,y:0};
  assert.deepEqual(insertWaypoint(route,extra),[...route.slice(0,2),extra,...route.slice(2)]);
  const nodes=pathNodes(route);
  for (const {x,y,time} of nodes)assert.deepEqual(smoothPath(nodes,time),{x,y});
  for(let i=0;i<=100;i++){
    const {x,y}=smoothPath(nodes,i/100);
    assert(x>=0&&x<=100&&y>=-10&&y<=20);
  }
});

test('body build options keep legacy rig anchors stable and crying closes the eyes', () => {
  const original=characters[0];
  const legacy=rig(original,{},1);
  assert.deepEqual(rig({...original,bodyBuild:{frame:'regular',arms:'regular',legs:'regular'}},{},1),legacy);
  const stylized={...original, outfit:'shirtless' as const, bodyBuild:{frame:'broad' as const,hips:.6,abs:true}};
  assert.equal(CharacterDefinition.safeParse(stylized).success,true);
  const result=rig(stylized,{},1);
  assert(result.right.shoulder.x>legacy.right.shoulder.x);
  assert(result.right.upper.x>legacy.right.upper.x);
  assert.equal(result.right.knee.y,legacy.right.knee.y);
  assert.equal(facialPerformance(.25,'actor','cry','neutral').blink,1);
  assert.notDeepEqual(sample(animations.cry,.1).pose,sample(animations.cry,.44).pose);
});
