import assert from 'node:assert/strict';
import test from 'node:test';
import { makeProject } from '../src/engine/presets.ts';
import { ProjectDocument } from '../src/engine/schema.ts';
import {
  neutralFacialControls,facialExpressionControls,blendFacialControls,actingFacialControls
} from '../src/engine/facialIntelligence.ts';
import { facialPerformance } from '../src/engine/facialAnimation.ts';
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
