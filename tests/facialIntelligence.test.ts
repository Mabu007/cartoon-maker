import assert from 'node:assert/strict';
import test from 'node:test';
import { makeProject } from '../src/engine/presets.ts';
import { ProjectDocument } from '../src/engine/schema.ts';
import {
  neutralFacialControls,facialExpressionControls,blendFacialControls,actingFacialControls,facialFromBlendshapes,emotionFacialControls
} from '../src/engine/facialIntelligence.ts';
import { facialPerformance } from '../src/engine/facialAnimation.ts';
import { directedActingPosture } from '../src/engine/actingPosture.ts';
import { makeActingDemoProject } from '../src/engine/actingDemo.ts';
import { mouthGeometry } from '../src/engine/mouthRig.ts';
import { evaluate } from '../src/engine/evaluate.ts';

test('facial expression controls are independent, asymmetric and finite',()=>{
  const surprise=facialExpressionControls('surprised');
  const angry=facialExpressionControls('angry');
  const smug=facialExpressionControls('smug');
  assert(surprise.eyeWideLeft>.6 && surprise.browLeft>.7);
  assert(angry.eyeNarrowRight>.4 && angry.browLeft<0);
  assert.notEqual(smug.browLeft,smug.browRight);
  for(const expression of ['neutral','happy','excited','smug','confused','sleepy','angry','surprised','sad','thinking','nervous'] as const){
    for(const intensity of [0,.35,1,1.5]) {
      const controls=facialExpressionControls(expression,intensity);
      assert(Object.values(controls).every(Number.isFinite));
      assert(Object.values(controls).every(v=>v>=-1 && v<=1));
    }
  }
});
test('intensity interpolates from neutral through natural to exaggerated',()=>{
  const faint=facialExpressionControls('sad',.25);
  const natural=facialExpressionControls('sad',1);
  const strong=facialExpressionControls('sad',1.5);
  assert(Math.abs(faint.frownLeft)<natural.frownLeft);
  assert(strong.frownLeft>natural.frownLeft);
  assert.deepEqual(facialExpressionControls('excited',0),neutralFacialControls);
  assert.deepEqual(blendFacialControls({...neutralFacialControls},natural,0),neutralFacialControls);
});
test('acting micro-beats are deterministic and character aware',()=>{
  const first=actingFacialControls(1.7,'zee','nervous',{preset:'shy',autoActing:'full'});
  const second=actingFacialControls(1.7,'zee','nervous',{preset:'shy',autoActing:'full'});
  const composed=actingFacialControls(1.7,'zee','nervous',{preset:'confident',autoActing:'subtle'});
  assert.deepEqual(first,second);
  assert.notDeepEqual(first,composed);
  for(const t of [0,.3,1.7,6.5,300]){
    assert.deepEqual(actingFacialControls(t,'sbu','thinking'),actingFacialControls(t,'sbu','thinking'));
  }
});
test('emotional face deformation preserves mandatory closed visemes',()=>{
  const c=makeProject(true).characters[0];
  for(const expression of ['happy','angry','nervous','smug','excited'] as const){
    const mood=facialPerformance(1.25,c.id,'talk',expression,1,
      {shape:'closed',weight:1},undefined,c.personality,1.5);
    const mouth=mouthGeometry(c,mood,'front');
    assert.equal(mouth.open,false);
    assert.equal(mouth.parameters.lipClosure,1);
    assert.equal(mouth.parameters.teethVisibility,0);
    assert(!/NaN|Infinity|undefined/.test(mouth.cavityPath));
  }
  const smile=mouthGeometry(c,facialPerformance(1,c.id,'idle','happy'),'front');
  const sad=mouthGeometry(c,facialPerformance(1,c.id,'idle','sad'),'front');
  assert(smile.cornerLeft<sad.cornerLeft);
});
test('face intensity persists on the existing timeline and preview evaluator',()=>{
  const project=makeProject(true),scene=project.scenes[0],actor=scene.actors[0];
  const next={...scene,clips:[...scene.clips,{
    id:'facial-acting-intensity-test',track:'face' as const,
    actor:actor.id,expression:'angry' as const,start:1,length:2,intensity:1.35
  }]};
  const document=ProjectDocument.parse({...project,scenes:[next,...project.scenes.slice(1)]});
  const output=evaluate(document.scenes[0],1.7,new Map(document.characters.map(c=>[c.id,c])));
  const frame=output.actors.find(item=>item.id===actor.id);
  assert(frame);
  assert.equal(frame.expression,'angry');
  assert.equal(frame.expressionIntensity,1.35);
  assert.equal(evaluate(document.scenes[0],3.3).actors.find(a=>a.id===actor.id)?.expressionIntensity,1);
  assert.equal(ProjectDocument.safeParse({...project,scenes:[{
    ...next,clips:[...scene.clips,{id:'invalid',track:'face',actor:actor.id,
      expression:'angry',start:1,length:2,intensity:5}]
  },...project.scenes.slice(1)]}).success,false);
});

test('MediaPipe facial blendshapes remain asymmetric and editable',()=>{
  const facial=facialFromBlendshapes({
    mouthSmileLeft:.9,mouthSmileRight:.15,eyeBlinkLeft:.8,eyeBlinkRight:.12,
    browOuterUpLeft:.6,browDownRight:.4,mouthPucker:.21
  });
  assert(facial.smileLeft>facial.smileRight);
  assert(facial.blinkLeft>facial.blinkRight);
  assert(facial.browLeft>0 && facial.browRight<0);
  assert(facial.lipRound>.2);
  const halfway=blendFacialControls({...neutralFacialControls},facial,.5);
  assert(halfway.smileLeft<facial.smileLeft && halfway.smileLeft>0);
});
test('facial performance capture keys interpolate and survive project serialization',async()=>{
  const {samplePerformance}=await import('../src/engine/performanceCapture.ts');
  const project=makeProject(true),scene=project.scenes[0],actor=scene.actors[0];
  const first=facialFromBlendshapes({mouthSmileLeft:.05,eyeBlinkLeft:.1});
  const last=facialFromBlendshapes({mouthSmileLeft:.95,eyeBlinkLeft:.9});
  const keys=[{time:0,pose:{},facial:first},{time:1,pose:{},facial:last}];
  const midpoint=samplePerformance(keys,.5).facial;
  assert(midpoint && midpoint.smileLeft>.05 && midpoint.smileLeft<.95);
  assert(midpoint.blinkLeft>.1 && midpoint.blinkLeft<.9);
  const track={id:'face-mocap-test',track:'body' as const,actor:actor.id,
    start:0,length:2,action:'idle' as const,layer:'gesture' as const,
    performance:keys,performanceOrigin:'mocap' as const};
  const doc=ProjectDocument.parse({...project,scenes:[{
    ...scene,clips:[...scene.clips,track]
  },...project.scenes.slice(1)]});
  const frame=evaluate(doc.scenes[0],.7,new Map(doc.characters.map(c=>[c.id,c])));
  assert(frame.actors.find(item=>item.id===actor.id)?.facialCapture);
  assert(doc.scenes[0].clips.some(c=>c.track==='body'&&c.id===track.id&&c.performance?.[0]?.facial));
});

test('acting intentions can contradict base emotion without affecting the rig or speech',()=>{
  const c=makeProject(true).characters[0];
  const genuine=facialPerformance(1,c.id,'idle','happy',0,undefined,undefined,c.personality,1);
  const forced=facialPerformance(1,c.id,'idle','happy',0,undefined,undefined,c.personality,1,'forced-smile');
  assert(genuine.controls && forced.controls);
  assert(forced.controls!.lipPress>genuine.controls!.lipPress);
  assert(forced.controls!.cheekLeft<genuine.controls!.cheekLeft);
  const guarded=facialPerformance(1,c.id,'idle','neutral',0,undefined,undefined,c.personality,1,'hide-anger');
  assert(guarded.controls && guarded.controls.smileLeft>0 && guarded.controls.browLeft<0);
  const closed=facialPerformance(1,c.id,'talk','happy',1,{shape:'closed',weight:1},undefined,c.personality,1,'forced-smile');
  assert.equal(mouthGeometry(c,closed,'front').open,false);
});
test('directed posture modifies only bounded upper body and is deterministic',()=>{
  const base={head:2,torso:1,leftHip:5,rightKnee:8,rightElbow:14};
  const tense=directedActingPosture(base,'hide-anger',1);
  assert.notEqual(tense.torso,base.torso);
  assert.equal(tense.leftHip,base.leftHip);
  assert.equal(tense.rightKnee,base.rightKnee);
  assert.equal(tense.rightElbow,base.rightElbow);
  assert.deepEqual(directedActingPosture(base,'embarrassed',1),directedActingPosture(base,'embarrassed',1));
  assert.deepEqual(directedActingPosture(base,'embarrassed',0),base);
});
test('a timeline face intention directs the body and can be saved and restored',()=>{
  const project=makeProject(true), scene=project.scenes[0],actor=scene.actors[0];
  const clip={id:'authored-acting-intention',track:'face' as const,actor:actor.id,
    expression:'happy' as const,intent:'forced-smile' as const,
    intensity:1,start:2.2,length:1.7};
  const next={...scene,clips:[...scene.clips,clip]};
  const doc=ProjectDocument.parse({...project,scenes:[next,...project.scenes.slice(1)]});
  const characters=new Map(doc.characters.map(c=>[c.id,c]));
  const before=evaluate(doc.scenes[0],2.7,characters).actors.find(a=>a.id===actor.id);
  const repeat=evaluate(doc.scenes[0],2.7,characters).actors.find(a=>a.id===actor.id);
  assert.equal(before?.actingIntent,'forced-smile');
  assert.deepEqual(before,repeat);
  assert.equal(doc.scenes[0].clips.find(c=>c.id===clip.id)?.track,'face');
});

test('continuous emotion space remains editable, bounded and distinct from expressions',()=>{
  const neutral=facialExpressionControls('neutral',1);
  const warm=emotionFacialControls(neutral,{valence:.9,arousal:.5,dominance:.7,tension:.05});
  const upset=emotionFacialControls(neutral,{valence:-.9,arousal:.8,dominance:.3,tension:.85});
  assert(warm.smileLeft>upset.smileLeft);
  assert(upset.frownRight>warm.frownRight);
  assert(upset.lipPress>warm.lipPress);
  assert.deepEqual(emotionFacialControls(neutral),neutral);
  assert(Object.values(emotionFacialControls(neutral,{
    valence:3,arousal:5,dominance:-9,tension:6
  })).every(v=>Number.isFinite(v)&&v>=-1&&v<=1));
});
test('the 30-second acting demo is schema-valid with editable directed performances',()=>{
  const project=makeActingDemoProject();
  const parsed=ProjectDocument.parse(project);
  assert.equal(parsed.scenes.length,1);
  const scene=parsed.scenes[0];
  assert.equal(scene.duration,30);
  assert.equal(scene.actors.length,2);
  const faces=scene.clips.filter(c=>c.track==='face');
  assert(faces.length>=8 && faces.some(c=>c.track==='face'&&c.intent==='forced-smile'));
  assert(scene.clips.some(c=>c.track==='text'));
  assert(scene.clips.some(c=>c.track==='camera'));
  assert(scene.clips.some(c=>c.track==='gaze'));
  const actors=new Map(parsed.characters.map(c=>[c.id,c]));
  for(const time of [0,3,6,12,17,23,27,29.8]){
    const frame=evaluate(scene,time,actors);
    assert(frame.actors.length===2);
    assert(frame.actors.every(c=>Object.values(c.pose).every(Number.isFinite)));
  }
});
